import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Rounds, Bids, Wallets, LedgerEntries } from '@tac/db'
import {
  setupTestDB,
  teardownTestDB,
  clearCollections,
  createTestApp,
  createTestUser,
  apiRequest,
} from './setup.js'

describe('auctions API', () => {
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

  describe('POST /api/v1/auctions (create)', () => {
    it('creates auction successfully', async () => {
      await createTestUser(100)

      const { status, json } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Test Auction',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 3,
          items_per_round: 10,
          first_round_minutes: 60,
          other_rounds_minutes: 5,
          min_bid: '100',
          bid_step: '10',
        },
      })

      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.auction.auction_name).toBe('Test Auction')
      expect(json.auction.total_items).toBe(30) // 3 rounds * 10 items
      expect(json.auction.status).toBe('draft')
      expect(json.auction.min_bid).toBe('100')
      expect(json.auction.bid_step).toBe('10')
    })

    it('rejects auction without name', async () => {
      await createTestUser(100)

      const { status, json } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 1,
          items_per_round: 10,
          first_round_minutes: 60,
        },
      })

      expect(status).toBe(400)
      expect(json.ok).toBe(false)
      expect(json.error).toContain('name')
    })

    it('creates and starts auction immediately with past start_at', async () => {
      await createTestUser(100)

      const { status, json } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Immediate Auction',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 2,
          items_per_round: 5,
          first_round_minutes: 30,
          other_rounds_minutes: 10,
          start_at: new Date(Date.now() - 1000).toISOString(), // past
        },
      })

      expect(status).toBe(200)
      expect(json.auction.status).toBe('active')
      expect(json.auction.current_round).toBe(1)

      // Round should be created
      const round = await Rounds.findOne({ auction_id: json.auction.id })
      expect(round).not.toBeNull()
      expect(round!.round_number).toBe(1)
      expect(round!.status).toBe('active')
    })
  })

  describe('POST /api/v1/auctions/:id/start', () => {
    it('starts draft auction', async () => {
      await createTestUser(100)

      // Create draft auction
      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Draft Auction',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 2,
          items_per_round: 5,
          first_round_minutes: 60,
          other_rounds_minutes: 5,
        },
      })

      expect(createJson.auction.status).toBe('draft')

      // Start it
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, {
        userId: 100,
      })

      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.auction.status).toBe('active')
      expect(json.auction.current_round).toBe(1)
      expect(json.round).toBeDefined()
      expect(json.round.round_number).toBe(1)
    })

    it('rejects start from non-owner', async () => {
      await createTestUser(100)
      await createTestUser(200)

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Owner Test',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
        },
      })

      // Try to start as different user
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, {
        userId: 200,
      })

      expect(status).toBe(403)
      expect(json.ok).toBe(false)
    })
  })

  describe('POST /api/v1/auctions/:id/bid', () => {
    let auctionId: string

    beforeEach(async () => {
      await createTestUser(100, '1000') // Creator
      await createTestUser(200, '500')  // Bidder 1
      await createTestUser(300, '500')  // Bidder 2

      // Create and start auction
      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Bid Test Auction',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 1,
          items_per_round: 2,
          first_round_minutes: 60,
          min_bid: '100',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, {
        userId: 100,
      })

      auctionId = createJson.auction.id
    })

    it('places bid successfully', async () => {
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '100' },
      })

      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.bid.amount).toBe('100')
      expect(json.bid.user_id).toBe(200)

      // Check wallet hold
      const wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('400') // 500 - 100
      expect(wallet!.hold).toBe('100')

      // Check ledger entry
      const ledger = await LedgerEntries.findOne({ user_id: 200, type: 'hold' })
      expect(ledger).not.toBeNull()
      expect(ledger!.amount).toBe('100')
    })

    it('is idempotent for the same bid amount', async () => {
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '100' },
      })

      // Repeat same request (e.g. network retry) should not double-hold funds.
      const { status } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '100' },
      })

      expect(status).toBe(200)

      const wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('400')
      expect(wallet!.hold).toBe('100')

      const holds = await LedgerEntries.find({ user_id: 200, type: 'hold' })
      expect(holds).toHaveLength(1)
    })

    it('increases bid successfully', async () => {
      // First bid
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '100' },
      })

      // Increase bid
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '150' },
      })

      expect(status).toBe(200)
      expect(json.bid.amount).toBe('150')

      // Wallet should have additional 50 held
      const wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('350') // 500 - 150
      expect(wallet!.hold).toBe('150')

      // Should still be one active bid
      const bids = await Bids.find({ auction_id: auctionId, user_id: 200, status: 'active' })
      expect(bids).toHaveLength(1)
    })

    it('rejects bid below minimum', async () => {
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '50' }, // min is 100
      })

      expect(status).toBe(400)
      expect(json.ok).toBe(false)
      expect(json.error).toContain('Invalid bid')
    })

    it('rejects bid not aligned with step', async () => {
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '105' }, // step is 10, so 100, 110, 120... are valid
      })

      expect(status).toBe(400)
      expect(json.ok).toBe(false)
    })

    it('rejects bid with insufficient balance', async () => {
      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '600' }, // has only 500
      })

      expect(status).toBe(400)
      expect(json.ok).toBe(false)
      expect(json.error).toContain('Insufficient')
    })

    it('rejects bid increase less than step', async () => {
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '100' },
      })

      const { status, json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '105' }, // only +5, step is 10
      })

      expect(status).toBe(400)
      expect(json.ok).toBe(false)
    })

    it('calculates rank correctly with multiple bidders', async () => {
      // User 200 bids 100
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '100' },
      })

      // User 300 bids 200
      const { json: bid2Json } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 300,
        body: { amount: '200' },
      })

      // User 300 should be rank 1
      expect(bid2Json.bid.rank).toBe(1)

      // Get leaderboard
      const { json: lbJson } = await apiRequest(app, 'GET', `/api/v1/auctions/${auctionId}/leaderboard`, {
        userId: 200,
      })

      expect(lbJson.leaderboard).toHaveLength(2)
      expect(lbJson.leaderboard[0].user_id).toBe(300) // Higher bid
      expect(lbJson.leaderboard[0].rank).toBe(1)
      expect(lbJson.leaderboard[1].user_id).toBe(200)
      expect(lbJson.leaderboard[1].rank).toBe(2)
    })
  })

  describe('GET /api/v1/auctions/:id/leaderboard', () => {
    it('returns empty leaderboard for new auction', async () => {
      await createTestUser(100)

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Empty LB Test',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, {
        userId: 100,
      })

      const { status, json } = await apiRequest(app, 'GET', `/api/v1/auctions/${createJson.auction.id}/leaderboard`, {
        userId: 100,
      })

      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.leaderboard).toEqual([])
    })

    it('marks winners correctly based on items_count', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')
      await createTestUser(400, '500')

      // Create auction with 2 items (so 2 winners)
      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Winners Test',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 1,
          items_per_round: 2,
          first_round_minutes: 60,
          min_bid: '10',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, {
        userId: 100,
      })

      const auctionId = createJson.auction.id

      // 3 bidders
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '200' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 400, body: { amount: '150' } })

      const { json } = await apiRequest(app, 'GET', `/api/v1/auctions/${auctionId}/leaderboard`, {
        userId: 200,
      })

      // Order: 300 (200), 400 (150), 200 (100)
      expect(json.leaderboard[0].user_id).toBe(300)
      expect(json.leaderboard[0].is_winner).toBe(true)
      expect(json.leaderboard[1].user_id).toBe(400)
      expect(json.leaderboard[1].is_winner).toBe(true)
      expect(json.leaderboard[2].user_id).toBe(200)
      expect(json.leaderboard[2].is_winner).toBe(false) // Only 2 winners
    })
  })

  describe('anti-sniping', () => {
    it('extends round when bid in threshold', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      // Create auction with anti-sniping
      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Sniping Test',
          auction_photo: 'https://example.com/photo.png',
          rounds_count: 1,
          items_per_round: 1,
          first_round_minutes: 1, // 1 minute
          min_bid: '10',
          bid_step: '10',
          anti_sniping: {
            enabled: true,
            threshold_seconds: 60, // Entire round is in threshold
            extension_seconds: 30,
            max_extensions: 5,
          },
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, {
        userId: 100,
      })

      const auctionId = createJson.auction.id

      // Get initial round end time
      const roundBefore = await Rounds.findOne({ auction_id: auctionId })
      const endBefore = roundBefore!.end_at.getTime()

      // Place bid (should trigger extension since entire round is in threshold)
      const { json: bidJson } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 200,
        body: { amount: '10' },
      })

      // Round should be extended
      const roundAfter = await Rounds.findOne({ auction_id: auctionId })
      const endAfter = roundAfter!.end_at.getTime()

      expect(endAfter).toBeGreaterThan(endBefore)
      expect(roundAfter!.extensions_count).toBe(1)
      expect(bidJson.round.extensions_count).toBe(1)
    })
  })

  describe('GET /api/v1/auctions', () => {
    it('returns list of auctions', async () => {
      await createTestUser(100)

      // Create a few auctions
      await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Auction 1',
          auction_photo: 'https://example.com/1.png',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
        },
      })

      await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Auction 2',
          auction_photo: 'https://example.com/2.png',
          rounds_count: 2,
          items_per_round: 10,
          first_round_minutes: 30,
          other_rounds_minutes: 5,
          start_at: new Date(Date.now() - 1000).toISOString(), // Start immediately
        },
      })

      const { status, json } = await apiRequest(app, 'GET', '/api/v1/auctions', {
        userId: 100,
      })

      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      // Draft auctions not in default list (only upcoming, active, completed)
      expect(json.auctions.some((a: { auction_name: string }) => a.auction_name === 'Auction 2')).toBe(true)
    })

    it('filters by status', async () => {
      await createTestUser(100)

      // Create draft
      await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Draft',
          auction_photo: 'https://example.com/1.png',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
        },
      })

      // Create active
      await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Active',
          auction_photo: 'https://example.com/2.png',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
          start_at: new Date(Date.now() - 1000).toISOString(),
        },
      })

      const { json: draftJson } = await apiRequest(app, 'GET', '/api/v1/auctions?status=draft', {
        userId: 100,
      })
      expect(draftJson.auctions).toHaveLength(1)
      expect(draftJson.auctions[0].auction_name).toBe('Draft')

      const { json: activeJson } = await apiRequest(app, 'GET', '/api/v1/auctions?status=active', {
        userId: 100,
      })
      expect(activeJson.auctions).toHaveLength(1)
      expect(activeJson.auctions[0].auction_name).toBe('Active')
    })
  })

  describe('GET /api/v1/auctions/:id', () => {
    it('returns auction details', async () => {
      await createTestUser(100)

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Detail Test',
          auction_photo: 'https://example.com/detail.png',
          rounds_count: 3,
          items_per_round: 10,
          first_round_minutes: 60,
          other_rounds_minutes: 10,
          min_bid: '50',
          bid_step: '5',
        },
      })

      const { status, json } = await apiRequest(app, 'GET', `/api/v1/auctions/${createJson.auction.id}`, {
        userId: 100,
      })

      expect(status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.auction.auction_name).toBe('Detail Test')
      expect(json.auction.total_items).toBe(30)
      expect(json.auction.min_bid).toBe('50')
      expect(json.auction.rounds_config).toHaveLength(3)
    })

    it('returns 404 for non-existent auction', async () => {
      await createTestUser(100)

      const { status, json } = await apiRequest(app, 'GET', '/api/v1/auctions/000000000000000000000000', {
        userId: 100,
      })

      expect(status).toBe(404)
      expect(json.ok).toBe(false)
    })
  })

  describe('complex scenarios', () => {
    it('tie-breaker: earlier bid wins on equal amounts', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Tie Test',
          auction_photo: 'g01',
          rounds_count: 1,
          items_per_round: 1,
          first_round_minutes: 60,
          min_bid: '100',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, { userId: 100 })
      const auctionId = createJson.auction.id

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })
      await new Promise((r) => setTimeout(r, 10))
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '100' } })

      const { json: lbJson } = await apiRequest(app, 'GET', `/api/v1/auctions/${auctionId}/leaderboard`, { userId: 100 })

      expect(lbJson.leaderboard[0].user_id).toBe(200)
      expect(lbJson.leaderboard[0].is_winner).toBe(true)
      expect(lbJson.leaderboard[1].user_id).toBe(300)
      expect(lbJson.leaderboard[1].is_winner).toBe(false)
    })

    it('concurrent bids: both succeed with correct holds', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Concurrent Test',
          auction_photo: 'g01',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
          min_bid: '100',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, { userId: 100 })
      const auctionId = createJson.auction.id

      const [res1, res2] = await Promise.all([
        apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '200' } }),
        apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 300, body: { amount: '150' } }),
      ])

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      const wallet200 = await Wallets.findOne({ user_id: 200 })
      const wallet300 = await Wallets.findOne({ user_id: 300 })

      expect(wallet200!.balance).toBe('300')
      expect(wallet200!.hold).toBe('200')
      expect(wallet300!.balance).toBe('350')
      expect(wallet300!.hold).toBe('150')
    })

    it('bid idempotency: same amount twice does not double hold', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Idempotency Test',
          auction_photo: 'g01',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
          min_bid: '100',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, { userId: 100 })
      const auctionId = createJson.auction.id

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })
      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })

      const wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('400')
      expect(wallet!.hold).toBe('100')

      const holds = await LedgerEntries.find({ user_id: 200, type: 'hold' })
      expect(holds).toHaveLength(1)
    })

    it('bid increase: delta correctly held', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Increase Test',
          auction_photo: 'g01',
          rounds_count: 1,
          items_per_round: 5,
          first_round_minutes: 60,
          min_bid: '100',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, { userId: 100 })
      const auctionId = createJson.auction.id

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })

      let wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('400')
      expect(wallet!.hold).toBe('100')

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '150' } })

      wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('350')
      expect(wallet!.hold).toBe('150')

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '300' } })

      wallet = await Wallets.findOne({ user_id: 200 })
      expect(wallet!.balance).toBe('200')
      expect(wallet!.hold).toBe('300')

      const bids = await Bids.find({ auction_id: auctionId, user_id: 200, status: 'active' })
      expect(bids).toHaveLength(1)
      expect(bids[0].amount).toBe('300')
    })

    it('leaderboard returned in bid response', async () => {
      await createTestUser(100, '1000')
      await createTestUser(200, '500')
      await createTestUser(300, '500')

      const { json: createJson } = await apiRequest(app, 'POST', '/api/v1/auctions', {
        userId: 100,
        body: {
          auction_name: 'Leaderboard Response Test',
          auction_photo: 'g01',
          rounds_count: 1,
          items_per_round: 2,
          first_round_minutes: 60,
          min_bid: '100',
          bid_step: '10',
        },
      })

      await apiRequest(app, 'POST', `/api/v1/auctions/${createJson.auction.id}/start`, { userId: 100 })
      const auctionId = createJson.auction.id

      await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, { userId: 200, body: { amount: '100' } })

      const { json: bidJson } = await apiRequest(app, 'POST', `/api/v1/auctions/${auctionId}/bid`, {
        userId: 300,
        body: { amount: '200' },
      })

      expect(bidJson.leaderboard).toBeDefined()
      expect(bidJson.leaderboard).toHaveLength(2)
      expect(bidJson.leaderboard[0].user_id).toBe(300)
      expect(bidJson.leaderboard[0].amount).toBe('200')
      expect(bidJson.leaderboard[0].is_winner).toBe(true)
      expect(bidJson.leaderboard[1].user_id).toBe(200)
      expect(bidJson.leaderboard[1].is_winner).toBe(true)
    })
  })
})
