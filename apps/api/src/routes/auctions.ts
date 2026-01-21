import { Hono } from 'hono'
import Big from 'big.js'
import {
  mongoose,
  Auctions,
  Rounds,
  Bids,
  Wallets,
  LedgerEntries,
  Users,
  Gifts,
  type AuctionDoc,
  type RoundDoc,
  type BidDoc,
} from '@tac/db'
import { config } from '../config.js'
import {
  isValidBidAmount,
  isValidBidIncrease,
  shouldExtendRound,
  rankBids,
  DEFAULT_ANTI_SNIPING,
  canHold,
} from '@tac/core'
import type {
  AuctionDTO,
  AuctionListItemDTO,
  RoundDTO,
  BidDTO,
  CreateAuctionRequest,
} from '@tac/shared'
import { getAuth, type AuthEnv } from '../middleware/auth.js'
import { notifyBid, notifyRoundExtended, type LeaderboardEntry } from '../ws/auction-hub.js'
import { tgNotify } from '@tac/telegram'

const auctions = new Hono<AuthEnv>()

async function buildLeaderboard(roundId: unknown, itemsCount: number): Promise<LeaderboardEntry[]> {
  const bids = await Bids.find({ round_id: roundId, status: 'active' }).lean()
  const ranked = rankBids(
    bids.map((b) => ({
      ...b,
      amount: b.amount,
      amount_reached_at: b.amount_reached_at,
    })),
  )

  const userIds = [...new Set(ranked.map((b) => b.user_id))]
  const users = await Users.find({ telegram_user_id: { $in: userIds } }).lean()
  const userMap = new Map(users.map((u) => [u.telegram_user_id, u]))

  return ranked.map((b, idx) => {
    const user = userMap.get(b.user_id)
    const isAnon = user?.is_anonymous || false
    return {
      rank: idx + 1,
      user_id: b.user_id,
      display_name: isAnon ? user?.anon_name || `User ${b.user_id}` : user?.public_name || `User ${b.user_id}`,
      display_photo: isAnon ? user?.anon_photo || '' : user?.public_photo || '',
      is_anonymous: isAnon,
      amount: b.amount,
      is_winner: idx < itemsCount,
    }
  })
}

type HttpErrorStatus = 400 | 404

class HttpError extends Error {
  status: HttpErrorStatus

  constructor(status: HttpErrorStatus, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function getMongoErrorCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') {
    return undefined
  }
  const code = (err as { code?: unknown }).code
  return typeof code === 'number' ? code : undefined
}

function hasMongoErrorLabel(err: unknown, label: string): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const labels = (err as { errorLabels?: unknown }).errorLabels
  return Array.isArray(labels) && labels.includes(label)
}

function isRetryableTxError(err: unknown): boolean {
  const code = getMongoErrorCode(err)
  // 11000 = duplicate key, 112 = WriteConflict
  if (code === 11000 || code === 112) {
    return true
  }
  return (
    hasMongoErrorLabel(err, 'TransientTransactionError') ||
    hasMongoErrorLabel(err, 'UnknownTransactionCommitResult')
  )
}

function toAuctionDTO(doc: AuctionDoc, distributed_items: number): AuctionDTO {
  return {
    id: String(doc._id),
    creator_id: doc.creator_id,
    auction_name: doc.auction_name,
    auction_photo: doc.auction_photo,
    total_items: doc.total_items,
    distributed_items,
    rounds_config: doc.rounds_config,
    min_bid: doc.min_bid,
    bid_step: doc.bid_step,
    anti_sniping: doc.anti_sniping,
    status: doc.status as AuctionDTO['status'],
    start_at: doc.start_at ? doc.start_at.toISOString() : null,
    current_round: doc.current_round ?? 0,
    unique_bidders: doc.unique_bidders ?? 0,
    highest_bid: doc.highest_bid ?? '0',
    created_at: doc.created_at.toISOString(),
  }
}

function toAuctionListItemDTO(doc: AuctionDoc, distributed_items: number): AuctionListItemDTO {
  return {
    id: String(doc._id),
    auction_name: doc.auction_name,
    auction_photo: doc.auction_photo,
    total_items: doc.total_items,
    distributed_items,
    status: doc.status as AuctionListItemDTO['status'],
    start_at: doc.start_at ? doc.start_at.toISOString() : null,
    current_round: doc.current_round ?? 0,
    total_rounds: doc.rounds_config.length,
    highest_bid: doc.highest_bid ?? '0',
  }
}

function toRoundDTO(doc: RoundDoc): RoundDTO {
  return {
    id: String(doc._id),
    auction_id: String(doc.auction_id),
    round_number: doc.round_number,
    items_count: doc.items_count,
    start_at: doc.start_at.toISOString(),
    end_at: doc.end_at.toISOString(),
    extensions_count: doc.extensions_count ?? 0,
    status: doc.status as RoundDTO['status'],
    winners_count: doc.winners_count ?? 0,
    transferred_count: doc.transferred_count ?? 0,
  }
}

function toBidDTO(doc: BidDoc): BidDTO {
  return {
    id: String(doc._id),
    auction_id: String(doc.auction_id),
    round_id: String(doc.round_id),
    user_id: doc.user_id,
    amount: doc.amount,
    rank: doc.rank ?? 0,
    status: doc.status as BidDTO['status'],
    award_number: doc.award_number,
    created_at: doc.created_at.toISOString(),
  }
}

auctions.get('/', async (c) => {
  const status = c.req.query('status')
  const query: Record<string, unknown> = {}

  if (status) {
    query.status = status
  } else {
    query.status = { $in: ['upcoming', 'active', 'completed'] }
  }

  const docs = await Auctions.find(query).sort({ start_at: -1, created_at: -1 }).limit(50).lean()
  const auctionIds = docs.map((d) => d._id)

  const distributedAgg = await Gifts.aggregate([
    { $match: { auction_id: { $in: auctionIds }, owner_id: { $ne: null } } },
    { $group: { _id: '$auction_id', count: { $sum: 1 } } },
  ])

  const distributedMap = new Map<string, number>(
    distributedAgg.map((d: { _id: unknown; count: number }) => [String(d._id), d.count]),
  )

  return c.json({
    ok: true,
    auctions: docs.map((doc) => toAuctionListItemDTO(doc as AuctionDoc, distributedMap.get(String(doc._id)) ?? 0)),
  })
})

auctions.get('/:id', async (c) => {
  const id = c.req.param('id')
  const doc = await Auctions.findById(id).lean()

  if (!doc) {
    return c.json({ ok: false, error: 'Auction not found' }, 404)
  }

  const distributed = await Gifts.countDocuments({ auction_id: doc._id, owner_id: { $ne: null } })

  return c.json({ ok: true, auction: toAuctionDTO(doc as AuctionDoc, distributed) })
})

auctions.post('/', async (c) => {
  const { tgUser } = getAuth(c)
  const body = (await c.req.json().catch(() => ({}))) as CreateAuctionRequest

  if (!body.auction_name?.trim()) {
    return c.json({ ok: false, error: 'Auction name required' }, 400)
  }

  if (!body.auction_photo?.trim()) {
    return c.json({ ok: false, error: 'Auction photo required' }, 400)
  }

  const roundsCount = body.rounds_count
  const itemsPerRound = body.items_per_round
  const firstRoundMinutes = body.first_round_minutes
  const otherRoundsMinutes = body.other_rounds_minutes

  if (!roundsCount || roundsCount < 1 || roundsCount > 100) {
    return c.json({ ok: false, error: 'rounds_count must be between 1 and 100' }, 400)
  }

  if (!itemsPerRound || itemsPerRound < 1 || itemsPerRound > 1000) {
    return c.json({ ok: false, error: 'items_per_round must be between 1 and 1000' }, 400)
  }

  const minMinutes = config.dev_mode ? 0.1 : 1

  if (!firstRoundMinutes || firstRoundMinutes < minMinutes) {
    return c.json({ ok: false, error: `first_round_minutes must be at least ${minMinutes}` }, 400)
  }

  if (roundsCount > 1 && (!otherRoundsMinutes || otherRoundsMinutes < minMinutes)) {
    return c.json({ ok: false, error: `other_rounds_minutes must be at least ${minMinutes}` }, 400)
  }

  const totalItems = roundsCount * itemsPerRound
  const roundsConfig: AuctionDoc['rounds_config'] = []

  for (let i = 1; i <= roundsCount; i++) {
    roundsConfig.push({
      round_number: i,
      duration_minutes: i === 1 ? firstRoundMinutes : otherRoundsMinutes,
      items_count: itemsPerRound,
    })
  }

  const minBidRaw = body.min_bid || '1'
  const bidStepRaw = body.bid_step || '1'

  let minBidBig: Big
  let bidStepBig: Big
  try {
    minBidBig = new Big(minBidRaw)
    bidStepBig = new Big(bidStepRaw)
  } catch {
    return c.json({ ok: false, error: 'min_bid and bid_step must be a positive integer' }, 400)
  }

  if (!minBidBig.eq(minBidBig.round(0)) || minBidBig.lt(1)) {
    return c.json({ ok: false, error: 'min_bid must be a positive integer' }, 400)
  }

  if (!bidStepBig.eq(bidStepBig.round(0)) || bidStepBig.lt(1)) {
    return c.json({ ok: false, error: 'bid_step must be a positive integer' }, 400)
  }

  const minBid = minBidBig.round(0).toString()
  const bidStep = bidStepBig.round(0).toString()

  const antiSniping = { ...DEFAULT_ANTI_SNIPING, ...body.anti_sniping }

  if (typeof antiSniping.threshold_seconds !== 'number' || antiSniping.threshold_seconds < 0 || antiSniping.threshold_seconds > 3600) {
    return c.json({ ok: false, error: 'threshold_seconds must be between 0 and 3600' }, 400)
  }

  if (typeof antiSniping.extension_seconds !== 'number' || antiSniping.extension_seconds < 0 || antiSniping.extension_seconds > 3600) {
    return c.json({ ok: false, error: 'extension_seconds must be between 0 and 3600' }, 400)
  }

  if (typeof antiSniping.max_extensions !== 'number' || antiSniping.max_extensions < 0 || antiSniping.max_extensions > 100) {
    return c.json({ ok: false, error: 'max_extensions must be between 0 and 100' }, 400)
  }

  const now = new Date()
  const startAt = body.start_at ? new Date(body.start_at) : null
  if (startAt && Number.isNaN(startAt.getTime())) {
    return c.json({ ok: false, error: 'start_at is invalid' }, 400)
  }

  const shouldStartNow = !!startAt && startAt.getTime() <= now.getTime()
  const status: AuctionDoc['status'] = startAt ? (shouldStartNow ? 'active' : 'upcoming') : 'draft'

  const session = await mongoose.startSession()
  let createdAuction: AuctionDoc | null = null

  try {
    await session.withTransaction(async () => {
      const created = await Auctions.create(
        [
          {
            creator_id: tgUser.id,
            auction_name: body.auction_name.trim(),
            auction_photo: body.auction_photo.trim(),
            total_items: totalItems,
            rounds_config: roundsConfig,
            min_bid: minBid,
            bid_step: bidStep,
            anti_sniping: antiSniping,
            issued_gifts: 0,
            status,
            start_at: startAt ? (shouldStartNow ? now : startAt) : null,
            current_round: shouldStartNow ? 1 : 0,
          },
        ],
        { session },
      )

      createdAuction = created[0].toObject() as AuctionDoc

      if (shouldStartNow) {
        const firstRound = roundsConfig[0]
        const roundEnd = new Date(now.getTime() + firstRound.duration_minutes * 60 * 1000)

        await Rounds.create(
          [
            {
              auction_id: createdAuction!._id,
              round_number: 1,
              items_count: firstRound.items_count,
              start_at: now,
              end_at: roundEnd,
              status: 'active',
            },
          ],
          { session },
        )
      }
    })
  } finally {
    await session.endSession()
  }

  return c.json({ ok: true, auction: toAuctionDTO(createdAuction!, 0) })
})

auctions.post('/:id/start', async (c) => {
  const { tgUser } = getAuth(c)
  const auctionId = c.req.param('id')

  if (!auctionId || auctionId === 'undefined' || !/^[a-f\d]{24}$/i.test(auctionId)) {
    return c.json({ ok: false, error: 'Invalid auction ID' }, 400)
  }

  const auction = await Auctions.findById(auctionId)
  if (!auction) {
    return c.json({ ok: false, error: 'Auction not found' }, 404)
  }

  if (auction.creator_id !== tgUser.id) {
    return c.json({ ok: false, error: 'Not authorized' }, 403)
  }

  if (auction.status !== 'draft' && auction.status !== 'upcoming') {
    return c.json({ ok: false, error: 'Auction already started' }, 400)
  }

  const now = new Date()
  const firstRound = auction.rounds_config[0]
  const roundEnd = new Date(now.getTime() + firstRound.duration_minutes * 60 * 1000)

  const session = await mongoose.startSession()
  let createdRound: RoundDoc | null = null
  let updatedAuction: AuctionDoc | null = null

  try {
    await session.withTransaction(async () => {
      const [round] = await Rounds.create(
        [
          {
            auction_id: auction._id,
            round_number: 1,
            items_count: firstRound.items_count,
            start_at: now,
            end_at: roundEnd,
            status: 'active',
          },
        ],
        { session },
      )

      createdRound = round.toObject() as RoundDoc

      const updated = await Auctions.findOneAndUpdate(
        { _id: auctionId, status: { $in: ['draft', 'upcoming'] } },
        {
          $set: {
            status: 'active',
            start_at: now,
            current_round: 1,
          },
        },
        { returnDocument: 'after', session },
      )

      if (!updated) {
        throw new Error('Auction status changed concurrently')
      }

      updatedAuction = updated.toObject() as AuctionDoc
    })
  } finally {
    await session.endSession()
  }

  if (!createdRound || !updatedAuction) {
    return c.json({ ok: false, error: 'Failed to start auction' }, 500)
  }

  return c.json({
    ok: true,
    auction: toAuctionDTO(updatedAuction, 0),
    round: toRoundDTO(createdRound),
  })
})

auctions.get('/:id/round', async (c) => {
  const id = c.req.param('id')

  const auction = await Auctions.findById(id).lean()
  if (!auction) {
    return c.json({ ok: false, error: 'Auction not found' }, 404)
  }

  if (auction.current_round === 0) {
    return c.json({ ok: false, error: 'Auction not started' }, 400)
  }

  const round = await Rounds.findOne({
    auction_id: auction._id,
    round_number: auction.current_round,
  }).lean()

  if (!round) {
    return c.json({ ok: false, error: 'Round not found' }, 404)
  }

  return c.json({ ok: true, round: toRoundDTO(round) })
})

auctions.get('/:id/leaderboard', async (c) => {
  const { tgUser } = getAuth(c)
  const id = c.req.param('id')

  const auction = await Auctions.findById(id).lean()
  if (!auction) {
    return c.json({ ok: false, error: 'Auction not found' }, 404)
  }

  const round = await Rounds.findOne({
    auction_id: auction._id,
    round_number: auction.current_round || 1,
  }).lean()

  if (!round) {
    return c.json({ ok: true, leaderboard: [], my_bid: undefined })
  }

  const leaderboard = await buildLeaderboard(round._id, round.items_count)

  const myBidDoc = await Bids.findOne({ round_id: round._id, user_id: tgUser.id, status: 'active' }).lean()
  const myBid = myBidDoc ? toBidDTO(myBidDoc) : undefined

  return c.json({ ok: true, leaderboard, my_bid: myBid })
})

auctions.post('/:id/bid', async (c) => {
  const { tgUser } = getAuth(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const amountRaw = body?.amount

  if (!amountRaw || typeof amountRaw !== 'string') {
    return c.json({ ok: false, error: 'Amount required' }, 400)
  }

  const { user } = getAuth(c)
  const displayName = user.is_anonymous ? user.anon_name : user.public_name
  const displayPhoto = user.is_anonymous ? user.anon_photo : user.public_photo

  const now = new Date()
  const MAX_ATTEMPTS = 3

  const auctionDoc = await Auctions.findById(id).lean()
  if (!auctionDoc) {
    return c.json({ ok: false, error: 'Auction not found' }, 404)
  }

  const currentRound = await Rounds.findOne({
    auction_id: auctionDoc._id,
    round_number: auctionDoc.current_round,
    status: 'active',
  }).lean()

  const prevTopUserIds: number[] = []
  if (currentRound) {
    const prevBids = await Bids.find({ round_id: currentRound._id, status: 'active' }).lean()
    const prevRanked = rankBids(prevBids.map((b) => ({ ...b, amount: b.amount, amount_reached_at: b.amount_reached_at })))
    prevTopUserIds.push(...prevRanked.slice(0, currentRound.items_count).map((b) => b.user_id))
  }

  type PlaceBidTxResult = {
    bid: BidDoc
    round: RoundDoc
    bidRank: number
    amount: string
    extended: boolean
    bidChanged: boolean
  }

  let txResult: PlaceBidTxResult | null = null

  let lastErr: unknown = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const session = await mongoose.startSession()
    try {
      const result = await session.withTransaction(async () => {
        const auction = await Auctions.findById(id).session(session)
        if (!auction) {
          throw new HttpError(404, 'Auction not found')
        }

        if (auction.status !== 'active') {
          throw new HttpError(400, 'Auction not active')
        }

        let round = await Rounds.findOne({
          auction_id: auction._id,
          round_number: auction.current_round,
          status: 'active',
        }).session(session)

        if (!round) {
          throw new HttpError(400, 'No active round')
        }

        if (now >= round.end_at) {
          throw new HttpError(400, 'Round ended')
        }

        if (!isValidBidAmount(amountRaw, auction.min_bid, auction.bid_step)) {
          throw new HttpError(400, 'Invalid bid amount')
        }

        // Normalize amount to canonical integer string ("100.0" -> "100")
        const amount = new Big(amountRaw).round(0).toString()
        const amountBig = new Big(amount)

        const wallet = await Wallets.findOneAndUpdate(
          { user_id: tgUser.id },
          { $setOnInsert: { user_id: tgUser.id, balance: '0', hold: '0' } },
          { upsert: true, returnDocument: 'after', session },
        )

        if (!wallet) {
          throw new Error('Wallet upsert failed')
        }

        const existingBid = await Bids.findOne({
          auction_id: auction._id,
          user_id: tgUser.id,
          status: 'active',
        }).session(session)

        let bid: BidDoc
        let bidChanged = false

        if (existingBid) {
          const existingAmountBig = new Big(existingBid.amount)

          // Idempotency: repeated request with the same amount is a no-op.
          if (amountBig.eq(existingAmountBig)) {
            bid = existingBid.toObject() as BidDoc
          } else {
            if (!isValidBidIncrease(existingBid.amount, amount, auction.bid_step)) {
              throw new HttpError(400, 'Bid must be higher')
            }

            const holdAmount = amountBig.minus(existingAmountBig)

            if (!canHold({ balance: wallet.balance, hold: wallet.hold }, holdAmount.toString())) {
              throw new HttpError(400, 'Insufficient balance')
            }

            const newBalance = new Big(wallet.balance).minus(holdAmount).toString()
            const newHold = new Big(wallet.hold).plus(holdAmount).toString()

            const updatedWallet = await Wallets.findOneAndUpdate(
              { _id: wallet._id },
              { $set: { balance: newBalance, hold: newHold } },
              { returnDocument: 'after', session },
            )

            if (!updatedWallet) {
              throw new Error('Wallet update failed')
            }

            const updatedBid = await Bids.findOneAndUpdate(
              { _id: existingBid._id, status: 'active' },
              {
                $set: {
                  amount,
                  amount_reached_at: now,
                  round_id: round._id,
                },
              },
              { returnDocument: 'after', session },
            )

            if (!updatedBid) {
              throw new Error('Bid update failed')
            }

            await LedgerEntries.create(
              [
                {
                  user_id: tgUser.id,
                  type: 'hold',
                  amount: holdAmount.toString(),
                  balance_after: updatedWallet.balance,
                  hold_after: updatedWallet.hold,
                  ref_type: 'bid',
                  ref_id: updatedBid._id,
                },
              ],
              { session },
            )

            bid = updatedBid.toObject() as BidDoc
            bidChanged = true
          }
        } else {
          // New active bid for this auction/round.
          const hadAnyBid = await Bids.exists({ auction_id: auction._id, user_id: tgUser.id }).session(session)

          if (!canHold({ balance: wallet.balance, hold: wallet.hold }, amountBig.toString())) {
            throw new HttpError(400, 'Insufficient balance')
          }

          const newBalance = new Big(wallet.balance).minus(amountBig).toString()
          const newHold = new Big(wallet.hold).plus(amountBig).toString()

          const updatedWallet = await Wallets.findOneAndUpdate(
            { _id: wallet._id },
            { $set: { balance: newBalance, hold: newHold } },
            { returnDocument: 'after', session },
          )

          if (!updatedWallet) {
            throw new Error('Wallet update failed')
          }

          const created = await Bids.create(
            [
              {
                auction_id: auction._id,
                round_id: round._id,
                user_id: tgUser.id,
                amount,
                amount_reached_at: now,
                status: 'active',
              },
            ],
            { session },
          )

          const createdBid = created[0]

          await LedgerEntries.create(
            [
              {
                user_id: tgUser.id,
                type: 'hold',
                amount: amountBig.toString(),
                balance_after: updatedWallet.balance,
                hold_after: updatedWallet.hold,
                ref_type: 'bid',
                ref_id: createdBid._id,
              },
            ],
            { session },
          )

          // unique_bidders: count unique users across the whole auction (even if they win and bid again)
          if (!hadAnyBid) {
            await Auctions.updateOne({ _id: auction._id }, { $inc: { unique_bidders: 1 } }).session(session)
          }

          bid = createdBid.toObject() as BidDoc
          bidChanged = true
        }

        // Auction counters: only when the bid actually changed (new bid or increased).
        if (bidChanged && amountBig.gt(auction.highest_bid || '0')) {
          await Auctions.updateOne({ _id: auction._id }, { $set: { highest_bid: amount } }).session(session)
        }

        const allBids = await Bids.find({ round_id: round._id, status: 'active' }).session(session).lean()
        const ranked = rankBids(
          allBids.map((b) => ({
            _id: b._id,
            amount: b.amount,
            amount_reached_at: b.amount_reached_at,
          })),
        )

        const bidRank = ranked.findIndex((b) => String(b._id) === String(bid._id)) + 1
        if (bidRank <= 0) {
          throw new Error('Failed to compute bid rank')
        }

        const entersTopK = bidRank <= round.items_count
        let extended = false

        // Anti-sniping: only trigger on actual bid change (not on idempotent retries).
        if (bidChanged && entersTopK && auction.anti_sniping.enabled) {
          const maxExt = auction.anti_sniping.max_extensions ?? 0

          const tryExtend = async (baseRound: RoundDoc) => {
            const currentExt = baseRound.extensions_count ?? 0
            if (
              !shouldExtendRound(
                baseRound.end_at,
                now,
                auction.anti_sniping.threshold_seconds,
                currentExt,
                maxExt,
              )
            ) {
              return null
            }

            const newEndAt = new Date(
              baseRound.end_at.getTime() + auction.anti_sniping.extension_seconds * 1000,
            )
            const filter: Record<string, unknown> = { _id: baseRound._id, end_at: baseRound.end_at }
            if (maxExt > 0) {
              filter.extensions_count = { $lt: maxExt }
            }

            return await Rounds.findOneAndUpdate(
              filter,
              { $set: { end_at: newEndAt }, $inc: { extensions_count: 1 } },
              { returnDocument: 'after', session },
            )
          }

          const updated =
            (await tryExtend(round.toObject() as RoundDoc)) ||
            (await (async () => {
              const fresh = await Rounds.findById(round._id).session(session)
              return fresh ? await tryExtend(fresh.toObject() as RoundDoc) : null
            })())

          if (updated) {
            round = updated
            extended = true
          }
        }

        const bidWithRank = await Bids.findByIdAndUpdate(
          bid._id,
          { $set: { rank: bidRank } },
          { returnDocument: 'after', session },
        )

        return {
          bid: (bidWithRank ? (bidWithRank.toObject() as BidDoc) : bid) as BidDoc,
          round: round.toObject() as RoundDoc,
          bidRank,
          amount,
          extended,
          bidChanged,
        } as PlaceBidTxResult
      })

      txResult = result

      break
    } catch (err) {
      lastErr = err
      if (err instanceof HttpError) {
        return c.json({ ok: false, error: err.message }, err.status)
      }
      if (attempt < MAX_ATTEMPTS && isRetryableTxError(err)) {
        continue
      }
      break
    } finally {
      await session.endSession()
    }
  }

  if (!txResult) {
    console.error('placeBid failed', lastErr)
    return c.json({ ok: false, error: 'Failed to place bid' }, 500)
  }

  const leaderboard = await buildLeaderboard(txResult.round._id, txResult.round.items_count)

  if (txResult.bidChanged) {
    notifyBid(id, {
      user_id: tgUser.id,
      display_name: displayName,
      display_photo: displayPhoto,
      amount: txResult.amount,
      rank: txResult.bidRank,
      is_anonymous: user.is_anonymous,
    }, leaderboard)

    const newTopUserIds = leaderboard.filter((e) => e.is_winner).map((e) => e.user_id)
    const knockedOut = prevTopUserIds.filter((uid) => !newTopUserIds.includes(uid) && uid !== tgUser.id)

    for (const userId of knockedOut) {
      const userBid = leaderboard.find((e) => e.user_id === userId)
      if (userBid) {
        tgNotify.outbid(userId, userBid.amount, txResult.round.items_count, id, auctionDoc.auction_name)
      }
    }
  }

  if (txResult.extended) {
    notifyRoundExtended(id, {
      id: String(txResult.round._id),
      end_at: txResult.round.end_at.toISOString(),
      extensions_count: txResult.round.extensions_count,
    })
  }

  return c.json({
    ok: true,
    bid: toBidDTO(txResult.bid),
    round: toRoundDTO(txResult.round),
    leaderboard,
  })
})

auctions.get('/:id/my-bid', async (c) => {
  const { tgUser } = getAuth(c)
  const id = c.req.param('id')

  const bid = await Bids.findOne({
    auction_id: id,
    user_id: tgUser.id,
  })
    .sort({ created_at: -1 })
    .lean()

  if (!bid) {
    return c.json({ ok: true, bid: null })
  }

  return c.json({ ok: true, bid: toBidDTO(bid) })
})

export { auctions }
