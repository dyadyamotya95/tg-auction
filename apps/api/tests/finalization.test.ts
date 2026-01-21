import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Rounds, Bids, Wallets, LedgerEntries, Auctions, Gifts } from '@tac/db'
import { finalizeRound } from '@tac/worker/finalize'
import {
  setupTestDB,
  teardownTestDB,
  clearCollections,
  createTestApp,
  createTestUser,
  apiRequest,
} from './setup.js'

describe('round finalization (worker)', () => {
  let app: ReturnType<typeof createTestApp>['app']

  beforeAll(async () => {
    await setupTestDB()
    app = createTestApp().app
  })

  afterAll(async () => {
    await teardownTestDB()
  })

  beforeEach(async () => {
    await clearCollections()
  })

  async function createAndStartAuction(
    userId: number,
    config: {
      rounds_count: number
      items_per_round: number
      first_round_minutes: number
      other_rounds_minutes?: number
      min_bid?: string
      bid_step?: string
    },
  ) {
    const { json } = await apiRequest(app, 'POST', '/api/v1/auctions', {
      userId,
      body: {
        auction_name: 'Test Auction',
        auction_photo: 'g01',
        ...config,
      },
    })
    await apiRequest(app, 'POST', `/api/v1/auctions/${json.auction.id}/start`, { userId })
    return json.auction.id
  }

  async function expireRound(auctionId: string) {
    const round = await Rounds.findOne({ auction_id: auctionId, status: 'active' })
    if (!round) {
      throw new Error('No active round')
    }
    await Rounds.updateOne({ _id: round._id }, { $set: { end_at: new Date(Date.now() - 1000) } })
    return round
  }

  describe('winner capture', () => {
    it('captures winner funds and assigns gift', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 1,
        items_per_round: 1,
        first_round_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '200' },
      })

      const walletBefore = await Wallets.findOne({ user_id: 200 })
      expect(walletBefore!.balance).toBe('300')
      expect(walletBefore!.hold).toBe('200')

      const round = await expireRound(auctionId)
      await finalizeRound(round.toObject())

      const walletAfter = await Wallets.findOne({ user_id: 200 })
      expect(walletAfter!.balance).toBe('300')
      expect(walletAfter!.hold).toBe('0')

      const bid = await Bids.findOne({ auction_id: auctionId, user_id: 200 })
      expect(bid!.status).toBe('won')
      expect(bid!.award_number).toBeDefined()

      const gift = await Gifts.findOne({ auction_id: auctionId, owner_id: 200 })
      expect(gift).not.toBeNull()
      expect(gift!.bid_id?.toString()).toBe(bid!._id.toString())

      const capture = await LedgerEntries.findOne({ user_id: 200, type: 'capture' })
      expect(capture).not.toBeNull()
      expect(capture!.amount).toBe('200')
    })

    it('handles multiple winners correctly', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')
      await createTestUser(400, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 1,
        items_per_round: 2,
        first_round_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '300' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '200' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 400, body: { amount: '100' } })

      const round = await expireRound(auctionId)
      await finalizeRound(round.toObject())

      const bid200 = await Bids.findOne({ auction_id: auctionId, user_id: 200 })
      const bid300 = await Bids.findOne({ auction_id: auctionId, user_id: 300 })
      const bid400 = await Bids.findOne({ auction_id: auctionId, user_id: 400 })

      expect(bid200!.status).toBe('won')
      expect(bid300!.status).toBe('won')
      expect(bid400!.status).toBe('refunded')

      const gifts = await Gifts.find({ auction_id: auctionId })
      expect(gifts).toHaveLength(2)
    })
  })

  describe('refund in final round', () => {
    it('refunds losers in final round', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 1,
        items_per_round: 1,
        first_round_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '200' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '100' } })

      const wallet300Before = await Wallets.findOne({ user_id: 300 })
      expect(wallet300Before!.balance).toBe('400')
      expect(wallet300Before!.hold).toBe('100')

      const round = await expireRound(auctionId)
      await finalizeRound(round.toObject())

      const wallet300After = await Wallets.findOne({ user_id: 300 })
      expect(wallet300After!.balance).toBe('500')
      expect(wallet300After!.hold).toBe('0')

      const bid300 = await Bids.findOne({ auction_id: auctionId, user_id: 300 })
      expect(bid300!.status).toBe('refunded')

      const release = await LedgerEntries.findOne({ user_id: 300, type: 'release' })
      expect(release).not.toBeNull()
      expect(release!.amount).toBe('100')
    })
  })

  describe('transfer between rounds', () => {
    it('transfers losers to next round with hold preserved', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 2,
        items_per_round: 1,
        first_round_minutes: 60,
        other_rounds_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '200' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '100' } })

      const round1 = await expireRound(auctionId)
      await finalizeRound(round1.toObject())

      const bid200R1 = await Bids.findOne({ auction_id: auctionId, user_id: 200, round_id: round1._id })
      expect(bid200R1!.status).toBe('won')

      const bid300R1 = await Bids.findOne({ auction_id: auctionId, user_id: 300, round_id: round1._id })
      expect(bid300R1!.status).toBe('transferred')

      const wallet300 = await Wallets.findOne({ user_id: 300 })
      expect(wallet300!.hold).toBe('100')
      expect(wallet300!.balance).toBe('400')

      const round2 = await Rounds.findOne({ auction_id: auctionId, round_number: 2 })
      expect(round2).not.toBeNull()
      expect(round2!.status).toBe('active')

      const bid300R2 = await Bids.findOne({ auction_id: auctionId, user_id: 300, round_id: round2!._id })
      expect(bid300R2).not.toBeNull()
      expect(bid300R2!.amount).toBe('100')
      expect(bid300R2!.status).toBe('active')

      const auction = await Auctions.findById(auctionId)
      expect(auction!.current_round).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('handles fewer bidders than items', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 1,
        items_per_round: 5,
        first_round_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })

      const round = await expireRound(auctionId)
      await finalizeRound(round.toObject())

      const bid = await Bids.findOne({ auction_id: auctionId, user_id: 200 })
      expect(bid!.status).toBe('won')

      const auction = await Auctions.findById(auctionId)
      expect(auction!.status).toBe('completed')

      const gifts = await Gifts.find({ auction_id: auctionId })
      expect(gifts).toHaveLength(1)
    })

    it('handles zero bidders in round', async () => {
      await createTestUser(100, '1000')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 1,
        items_per_round: 5,
        first_round_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      const round = await expireRound(auctionId)
      await finalizeRound(round.toObject())

      const auction = await Auctions.findById(auctionId)
      expect(auction!.status).toBe('completed')

      const completedRound = await Rounds.findById(round._id)
      expect(completedRound!.status).toBe('completed')
      expect(completedRound!.winners_count).toBe(0)
    })

    it('completes auction early when no bidders to transfer', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 3,
        items_per_round: 5,
        first_round_minutes: 60,
        other_rounds_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })

      const round = await expireRound(auctionId)
      await finalizeRound(round.toObject())

      const auction = await Auctions.findById(auctionId)
      expect(auction!.status).toBe('completed')

      const rounds = await Rounds.find({ auction_id: auctionId })
      expect(rounds).toHaveLength(1)
    })

    it('winner can participate in next round and win again', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '900')
      await createTestUser(300, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 2,
        items_per_round: 1,
        first_round_minutes: 60,
        other_rounds_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '200' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '100' } })

      const round1 = await expireRound(auctionId)
      await finalizeRound(round1.toObject())

      const wallet200AfterR1 = await Wallets.findOne({ user_id: 200 })
      expect(wallet200AfterR1!.balance).toBe('700')
      expect(wallet200AfterR1!.hold).toBe('0')

      const round2 = await Rounds.findOne({ auction_id: auctionId, round_number: 2 })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '300' } })

      const wallet200AfterBid = await Wallets.findOne({ user_id: 200 })
      expect(wallet200AfterBid!.balance).toBe('400')
      expect(wallet200AfterBid!.hold).toBe('300')

      await Rounds.updateOne({ _id: round2!._id }, { $set: { end_at: new Date(Date.now() - 1000) } })
      const round2Fresh = await Rounds.findById(round2!._id)
      await finalizeRound(round2Fresh!.toObject())

      const bid200R2 = await Bids.findOne({ auction_id: auctionId, user_id: 200, round_id: round2!._id })
      expect(bid200R2!.status).toBe('won')

      const wallet200Final = await Wallets.findOne({ user_id: 200 })
      expect(wallet200Final!.balance).toBe('400')
      expect(wallet200Final!.hold).toBe('0')

      const gifts200 = await Gifts.find({ auction_id: auctionId, owner_id: 200 })
      expect(gifts200).toHaveLength(2)
    })
  })

  describe('idempotency', () => {
    it('finalizeRound is idempotent', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      const auctionId = await createAndStartAuction(100, {
        rounds_count: 1,
        items_per_round: 1,
        first_round_minutes: 60,
        min_bid: '100',
        bid_step: '10',
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '200' } })

      const round = await expireRound(auctionId)

      await finalizeRound(round.toObject())
      await finalizeRound(round.toObject())
      await finalizeRound(round.toObject())

      const bids = await Bids.find({ auction_id: auctionId, user_id: 200 })
      expect(bids).toHaveLength(1)
      expect(bids[0].status).toBe('won')

      const gifts = await Gifts.find({ auction_id: auctionId, owner_id: 200 })
      expect(gifts).toHaveLength(1)

      const captures = await LedgerEntries.find({ user_id: 200, type: 'capture' })
      expect(captures).toHaveLength(1)

      const wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.hold).toBe('0')
    })
  })
})
