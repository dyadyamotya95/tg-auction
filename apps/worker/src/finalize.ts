import mongoose from 'mongoose'
import Big from 'big.js'
import { Auctions, Rounds, Bids, Wallets, LedgerEntries, Gifts } from '@tac/db'
import { rankBids, getTopK } from '@tac/core'
import { tgNotify } from '@tac/telegram'

export async function startDueAuctions(now: Date) {
  const due = await Auctions.find({
    status: 'upcoming',
    start_at: { $lte: now },
  })
    .sort({ start_at: 1 })
    .limit(10)
    .lean()

  for (const a of due) {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const auction = await Auctions.findOne({ _id: a._id, status: 'upcoming' }).session(session)
        if (!auction) {
          return
        }
        if (!auction.start_at || auction.start_at.getTime() > now.getTime()) {
          return
        }

        const firstRound = auction.rounds_config[0]
        const roundEnd = new Date(now.getTime() + firstRound.duration_minutes * 60 * 1000)

        const existingRound = await Rounds.findOne({
          auction_id: auction._id,
          round_number: 1,
        }).session(session)

        if (!existingRound) {
          await Rounds.create(
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
        }

        await Auctions.updateOne(
          { _id: auction._id, status: 'upcoming' },
          { $set: { status: 'active', current_round: 1, start_at: now } },
          { session },
        )
      })

      console.log(`Auction started by schedule: ${String(a._id)}`)
    } catch (err) {
      console.error('Failed to start scheduled auction', a._id, err)
    } finally {
      await session.endSession()
    }
  }
}

export async function finalizeRound(round: {
  _id: unknown
  auction_id: unknown
  round_number: number
  items_count: number
  status?: 'pending' | 'active' | 'finalizing' | 'completed'
}) {
  const roundId = round._id
  const auctionId = round.auction_id
  const now = new Date()

  if (round.status === 'active') {
    const locked = await Rounds.updateOne(
      { _id: roundId, status: 'active', end_at: { $lte: now } },
      { $set: { status: 'finalizing' } },
    )

    if (locked.matchedCount === 0) {
      const fresh = await Rounds.findById(roundId).lean()
      if (!fresh || fresh.status !== 'finalizing') {
        return
      }
    }
  } else if (round.status !== 'finalizing') {
    return
  }

  const auction = await Auctions.findById(auctionId)
  if (!auction) {
    console.error('Auction not found', auctionId)
    return
  }

  const bids = await Bids.find({ round_id: roundId }).lean()
  const ranked = rankBids(
    bids.map((b) => ({
      _id: b._id,
      user_id: b.user_id,
      amount: b.amount,
      amount_reached_at: b.amount_reached_at,
    })),
  )

  const { winners, rest } = getTopK(ranked, round.items_count)

  const ensureWinnerProcessed = async (w: { _id: unknown; user_id: number; amount: string }) => {
    const session = await mongoose.startSession()
    try {
      let ok = false
      await session.withTransaction(async () => {
        const nowTx = new Date()

        const bid = await Bids.findById(w._id).session(session)
        if (!bid) {
          throw new Error(`Bid not found: ${String(w._id)}`)
        }

        if (bid.status === 'won') {
          ok = true
          return
        }

        if (bid.status !== 'active') {
          throw new Error(`Winner bid has unexpected status: ${bid.status}`)
        }

        let gift =
          (await Gifts.findOne({ auction_id: auctionId, bid_id: bid._id }).session(session)) ||
          (await Gifts.findOneAndUpdate(
            { auction_id: auctionId, owner_id: null },
            {
              $set: {
                owner_id: bid.user_id,
                round_id: roundId,
                bid_id: bid._id,
                claimed_at: nowTx,
              },
            },
            { sort: { gift_number: 1 }, returnDocument: 'after', session },
          ))

        if (!gift) {
          const updatedAuction = await Auctions.findOneAndUpdate(
            { _id: auctionId, issued_gifts: { $lt: auction.total_items } },
            { $inc: { issued_gifts: 1 } },
            { returnDocument: 'after', session },
          )

          if (!updatedAuction) {
            throw new Error(`No available gifts left for auction ${String(auctionId)}`)
          }

          const giftNumber = updatedAuction.issued_gifts
          const created = await Gifts.create(
            [
              {
                auction_id: auctionId,
                gift_number: giftNumber,
                owner_id: bid.user_id,
                round_id: roundId,
                bid_id: bid._id,
                claimed_at: nowTx,
              },
            ],
            { session },
          )

          gift = created[0]
        }

        const wallet = await Wallets.findOne({ user_id: bid.user_id }).session(session)
        if (!wallet) {
          throw new Error(`Wallet not found for user ${bid.user_id}`)
        }

        const amountBig = new Big(bid.amount)
        const holdBig = new Big(wallet.hold)

        if (holdBig.lt(amountBig)) {
          throw new Error(`Insufficient hold for capture, user ${bid.user_id}`)
        }

        const nextHold = holdBig.minus(amountBig)
        if (nextHold.lt(0)) {
          throw new Error(`Negative hold after capture, user ${bid.user_id}`)
        }

        const updatedWallet = await Wallets.findOneAndUpdate(
          { user_id: bid.user_id },
          { $set: { hold: nextHold.toString() } },
          { returnDocument: 'after', session },
        )

        const bidUpdate = await Bids.updateOne(
          { _id: bid._id, status: 'active' },
          { $set: { status: 'won', award_number: gift.gift_number, won_at: nowTx } },
          { session },
        )
        if (bidUpdate.matchedCount === 0) {
          throw new Error(`Bid was not active during win transition: ${String(bid._id)}`)
        }

        await LedgerEntries.create(
          [
            {
              user_id: bid.user_id,
              type: 'capture',
              amount: bid.amount,
              balance_after: updatedWallet?.balance ?? wallet.balance,
              hold_after: updatedWallet?.hold ?? nextHold.toString(),
              ref_type: 'gift',
              ref_id: gift._id,
              note: `${auction.auction_name} Gift #${gift.gift_number}`,
            },
          ],
          { session },
        )

        ok = true
      })

      if (ok) {
        const gift = await Gifts.findOne({ auction_id: auctionId, bid_id: w._id }).lean()
        if (gift) {
          tgNotify.win(w.user_id, gift.gift_number, auction.auction_name)
        }
      }

      return ok
    } catch (err) {
      console.error('Winner finalize failed', w.user_id, err)
      return false
    } finally {
      await session.endSession()
    }
  }

  const ensureBidRefunded = async (b: { _id: unknown; user_id: number; amount: string }) => {
    const session = await mongoose.startSession()
    try {
      let ok = false
      await session.withTransaction(async () => {
        const nowTx = new Date()

        const bid = await Bids.findById(b._id).session(session)
        if (!bid) {
          throw new Error(`Bid not found: ${String(b._id)}`)
        }

        if (bid.status === 'refunded') {
          ok = true
          return
        }

        if (bid.status !== 'active') {
          throw new Error(`Refund bid has unexpected status: ${bid.status}`)
        }

        const wallet = await Wallets.findOne({ user_id: bid.user_id }).session(session)
        if (!wallet) {
          throw new Error(`Wallet not found for user ${bid.user_id}`)
        }

        const amountBig = new Big(bid.amount)
        const holdBig = new Big(wallet.hold)

        if (holdBig.lt(amountBig)) {
          throw new Error(`Insufficient hold for refund, user ${bid.user_id}`)
        }

        const nextBalance = new Big(wallet.balance).plus(amountBig)
        const nextHold = holdBig.minus(amountBig)
        if (nextHold.lt(0)) {
          throw new Error(`Negative hold after refund, user ${bid.user_id}`)
        }

        await Bids.updateOne(
          { _id: bid._id, status: 'active' },
          { $set: { status: 'refunded', refunded_at: nowTx } },
          { session },
        )

        const updatedWallet = await Wallets.findOneAndUpdate(
          { user_id: bid.user_id },
          { $set: { balance: nextBalance.toString(), hold: nextHold.toString() } },
          { returnDocument: 'after', session },
        )

        await LedgerEntries.create(
          [
            {
              user_id: bid.user_id,
              type: 'release',
              amount: bid.amount,
              balance_after: updatedWallet?.balance ?? nextBalance.toString(),
              hold_after: updatedWallet?.hold ?? nextHold.toString(),
              ref_type: 'bid',
              ref_id: bid._id,
              note: 'Bid refunded - auction ended',
            },
          ],
          { session },
        )

        ok = true
      })

      if (ok) {
        tgNotify.refund(b.user_id, b.amount, auction.auction_name)
      }

      return ok
    } catch (err) {
      console.error('Refund failed', b.user_id, err)
      return false
    } finally {
      await session.endSession()
    }
  }

  let winnersOk = true
  for (const w of winners) {
    const ok = await ensureWinnerProcessed(w)
    if (!ok) {
      winnersOk = false
    }
  }
  if (!winnersOk) {
    return
  }

  const nextRoundConfig = auction.rounds_config.find((r) => r.round_number === round.round_number + 1)

  if (nextRoundConfig && rest.length === 0) {
    await Auctions.updateOne({ _id: auctionId }, { $set: { status: 'completed' } })
    await Rounds.updateOne(
      { _id: roundId },
      { $set: { status: 'completed', winners_count: winners.length, transferred_count: 0 } },
    )
    console.log(`Auction completed early. Round ${round.round_number}: ${winners.length} winners, no bidders to transfer.`)
    return
  }

  if (nextRoundConfig) {
    const startAt = new Date()
    const nextRoundEnd = new Date(startAt.getTime() + nextRoundConfig.duration_minutes * 60 * 1000)

    let nextRound = await Rounds.findOne({
      auction_id: auctionId,
      round_number: nextRoundConfig.round_number,
    })

    if (!nextRound) {
      try {
        nextRound = await Rounds.create({
          auction_id: auctionId,
          round_number: nextRoundConfig.round_number,
          items_count: nextRoundConfig.items_count,
          start_at: startAt,
          end_at: nextRoundEnd,
          status: 'active',
        })
      } catch {
        nextRound = await Rounds.findOne({
          auction_id: auctionId,
          round_number: nextRoundConfig.round_number,
        })
      }
    }

    if (!nextRound) {
      console.error('Failed to create/find next round', auctionId, nextRoundConfig.round_number)
      return
    }

    const transferAt = new Date()
    let transferOk = true

    for (const b of rest) {
      try {
        await Bids.updateOne(
          { _id: b._id, status: 'active' },
          { $set: { status: 'transferred', transferred_to_round_id: nextRound._id, transferred_at: transferAt } },
        )

        try {
          await Bids.create({
            auction_id: auctionId,
            round_id: nextRound._id,
            user_id: b.user_id,
            amount: b.amount,
            amount_reached_at: b.amount_reached_at,
            status: 'active',
          })
        } catch (err: unknown) {
          const code = (err as { code?: number })?.code
          if (code !== 11000) {
            throw err
          }
        }

        tgNotify.transferred(
          b.user_id,
          round.round_number,
          nextRoundConfig.round_number,
          String(auctionId),
          auction.auction_name,
        )
      } catch (err) {
        transferOk = false
        console.error('Transfer failed for user', b.user_id, err)
      }
    }

    if (!transferOk) {
      return
    }

    await Auctions.updateOne({ _id: auctionId }, { $set: { current_round: nextRoundConfig.round_number } })
    await Rounds.updateOne(
      { _id: roundId },
      { $set: { status: 'completed', winners_count: winners.length, transferred_count: rest.length } },
    )

    console.log(
      `Round ${round.round_number} completed. ${winners.length} winners, ${rest.length} transferred to round ${nextRoundConfig.round_number}`,
    )
    return
  }

  let refundsOk = true
  for (const b of rest) {
    const ok = await ensureBidRefunded(b)
    if (!ok) {
      refundsOk = false
    }
  }
  if (!refundsOk) {
    return
  }

  await Auctions.updateOne({ _id: auctionId }, { $set: { status: 'completed' } })
  await Rounds.updateOne(
    { _id: roundId },
    { $set: { status: 'completed', winners_count: winners.length, transferred_count: 0 } },
  )
  console.log(`Auction completed. ${winners.length} final winners, ${rest.length} refunded.`)
}

export async function tick() {
  const now = new Date()

  await startDueAuctions(now)

  const expiredRounds = await Rounds.find({
    $or: [
      { status: 'active', end_at: { $lte: now } },
      { status: 'finalizing' },
    ],
  })
    .sort({ end_at: 1 })
    .limit(10)
    .lean()

  for (const round of expiredRounds) {
    try {
      await finalizeRound(round)
    } catch (err) {
      console.error('Error finalizing round', round._id, err)
    }
  }
}
