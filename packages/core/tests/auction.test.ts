import { describe, it, expect } from 'vitest'
import {
  validateRoundsConfig,
  calculateTotalItems,
  isValidBidAmount,
  isValidBidIncrease,
  shouldExtendRound,
  compareBids,
  rankBids,
  getTopK,
} from '../src/auction.js'

describe('auction', () => {
  describe('validateRoundsConfig', () => {
    it('accepts valid config', () => {
      const rounds = [
        { round_number: 1, duration_minutes: 60, items_count: 10 },
        { round_number: 2, duration_minutes: 5, items_count: 10 },
      ]
      expect(validateRoundsConfig(rounds)).toEqual({ ok: true })
    })

    it('rejects empty rounds', () => {
      expect(validateRoundsConfig([])).toEqual({ ok: false, error: 'At least one round required' })
    })

    it('rejects wrong round_number sequence', () => {
      const rounds = [
        { round_number: 1, duration_minutes: 60, items_count: 10 },
        { round_number: 3, duration_minutes: 5, items_count: 10 }, // should be 2
      ]
      const result = validateRoundsConfig(rounds)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('wrong round_number')
    })

    it('rejects duration < 1', () => {
      const rounds = [{ round_number: 1, duration_minutes: 0, items_count: 10 }]
      const result = validateRoundsConfig(rounds)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('duration')
    })

    it('rejects items_count < 1', () => {
      const rounds = [{ round_number: 1, duration_minutes: 60, items_count: 0 }]
      const result = validateRoundsConfig(rounds)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('item')
    })
  })

  describe('calculateTotalItems', () => {
    it('sums items across rounds', () => {
      const rounds = [
        { round_number: 1, duration_minutes: 60, items_count: 10 },
        { round_number: 2, duration_minutes: 5, items_count: 5 },
        { round_number: 3, duration_minutes: 5, items_count: 5 },
      ]
      expect(calculateTotalItems(rounds)).toBe(20)
    })

    it('handles single round', () => {
      const rounds = [{ round_number: 1, duration_minutes: 60, items_count: 100 }]
      expect(calculateTotalItems(rounds)).toBe(100)
    })
  })

  describe('isValidBidAmount', () => {
    it('accepts valid bid at minimum', () => {
      expect(isValidBidAmount('100', '100', '10')).toBe(true)
    })

    it('accepts valid bid with correct step', () => {
      expect(isValidBidAmount('110', '100', '10')).toBe(true)
      expect(isValidBidAmount('200', '100', '10')).toBe(true)
    })

    it('rejects bid below minimum', () => {
      expect(isValidBidAmount('90', '100', '10')).toBe(false)
    })

    it('rejects bid not aligned with step', () => {
      expect(isValidBidAmount('105', '100', '10')).toBe(false)
      expect(isValidBidAmount('111', '100', '10')).toBe(false)
    })

    it('rejects non-integer amounts', () => {
      expect(isValidBidAmount('100.5', '100', '1')).toBe(false)
    })

    it('rejects zero or negative', () => {
      expect(isValidBidAmount('0', '100', '10')).toBe(false)
      expect(isValidBidAmount('-100', '100', '10')).toBe(false)
    })

    it('rejects invalid strings', () => {
      expect(isValidBidAmount('abc', '100', '10')).toBe(false)
      expect(isValidBidAmount('', '100', '10')).toBe(false)
    })
  })

  describe('isValidBidIncrease', () => {
    it('accepts increase by step', () => {
      expect(isValidBidIncrease('100', '110', '10')).toBe(true)
    })

    it('accepts increase by more than step', () => {
      expect(isValidBidIncrease('100', '200', '10')).toBe(true)
    })

    it('rejects increase less than step', () => {
      expect(isValidBidIncrease('100', '105', '10')).toBe(false)
    })

    it('rejects same amount', () => {
      expect(isValidBidIncrease('100', '100', '10')).toBe(false)
    })

    it('rejects decrease', () => {
      expect(isValidBidIncrease('100', '90', '10')).toBe(false)
    })
  })

  describe('shouldExtendRound', () => {
    const now = new Date('2026-01-15T12:00:00Z')

    it('returns true when within threshold', () => {
      const endAt = new Date('2026-01-15T12:00:20Z') // 20 seconds left
      expect(shouldExtendRound(endAt, now, 30, 0, 5)).toBe(true)
    })

    it('returns false when outside threshold', () => {
      const endAt = new Date('2026-01-15T12:01:00Z') // 60 seconds left
      expect(shouldExtendRound(endAt, now, 30, 0, 5)).toBe(false)
    })

    it('returns false when round already ended', () => {
      const endAt = new Date('2026-01-15T11:59:00Z') // already ended
      expect(shouldExtendRound(endAt, now, 30, 0, 5)).toBe(false)
    })

    it('returns false when max extensions reached', () => {
      const endAt = new Date('2026-01-15T12:00:20Z')
      expect(shouldExtendRound(endAt, now, 30, 5, 5)).toBe(false)
    })

    it('ignores max when maxExtensions = 0 (unlimited)', () => {
      const endAt = new Date('2026-01-15T12:00:20Z')
      expect(shouldExtendRound(endAt, now, 30, 100, 0)).toBe(true)
    })

    it('returns true at exactly threshold', () => {
      const endAt = new Date('2026-01-15T12:00:30Z') // exactly 30 seconds
      expect(shouldExtendRound(endAt, now, 30, 0, 5)).toBe(true)
    })
  })

  describe('compareBids', () => {
    it('ranks higher amount first', () => {
      const a = { amount: '200', amount_reached_at: new Date('2026-01-15T12:00:00Z') }
      const b = { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z') }
      expect(compareBids(a, b)).toBeLessThan(0) // a comes first
      expect(compareBids(b, a)).toBeGreaterThan(0)
    })

    it('ranks earlier time first on equal amounts', () => {
      const a = { amount: '100', amount_reached_at: new Date('2026-01-15T11:00:00Z') }
      const b = { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z') }
      expect(compareBids(a, b)).toBeLessThan(0) // a comes first (earlier)
    })

    it('uses _id as final tie-breaker', () => {
      const a = { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z'), _id: 'aaa' }
      const b = { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z'), _id: 'bbb' }
      expect(compareBids(a, b)).toBeLessThan(0) // 'aaa' < 'bbb'
    })

    it('returns 0 for identical bids without _id', () => {
      const a = { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z') }
      const b = { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z') }
      expect(compareBids(a, b)).toBe(0)
    })
  })

  describe('rankBids', () => {
    it('sorts bids by amount desc, time asc', () => {
      const bids = [
        { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z') },
        { amount: '300', amount_reached_at: new Date('2026-01-15T12:00:00Z') },
        { amount: '200', amount_reached_at: new Date('2026-01-15T11:00:00Z') },
        { amount: '200', amount_reached_at: new Date('2026-01-15T12:00:00Z') },
      ]

      const ranked = rankBids(bids)

      expect(ranked[0].amount).toBe('300')
      expect(ranked[1].amount).toBe('200')
      expect(ranked[1].amount_reached_at.getUTCHours()).toBe(11) // earlier
      expect(ranked[2].amount).toBe('200')
      expect(ranked[2].amount_reached_at.getUTCHours()).toBe(12) // later
      expect(ranked[3].amount).toBe('100')
    })

    it('does not mutate original array', () => {
      const bids = [
        { amount: '100', amount_reached_at: new Date() },
        { amount: '200', amount_reached_at: new Date() },
      ]
      const original = [...bids]
      rankBids(bids)
      expect(bids).toEqual(original)
    })

    it('handles empty array', () => {
      expect(rankBids([])).toEqual([])
    })

    it('handles single bid', () => {
      const bids = [{ amount: '100', amount_reached_at: new Date() }]
      expect(rankBids(bids)).toHaveLength(1)
    })
  })

  describe('getTopK', () => {
    it('splits ranked bids into winners and rest', () => {
      const ranked = [
        { id: 1, amount: '300' },
        { id: 2, amount: '200' },
        { id: 3, amount: '100' },
        { id: 4, amount: '50' },
      ]

      const { winners, rest } = getTopK(ranked, 2)

      expect(winners).toHaveLength(2)
      expect(winners[0].id).toBe(1)
      expect(winners[1].id).toBe(2)
      expect(rest).toHaveLength(2)
      expect(rest[0].id).toBe(3)
      expect(rest[1].id).toBe(4)
    })

    it('handles k greater than array length', () => {
      const ranked = [{ id: 1 }, { id: 2 }]
      const { winners, rest } = getTopK(ranked, 5)
      expect(winners).toHaveLength(2)
      expect(rest).toHaveLength(0)
    })

    it('handles k = 0', () => {
      const ranked = [{ id: 1 }, { id: 2 }]
      const { winners, rest } = getTopK(ranked, 0)
      expect(winners).toHaveLength(0)
      expect(rest).toHaveLength(2)
    })

    it('handles empty array', () => {
      const { winners, rest } = getTopK([], 5)
      expect(winners).toHaveLength(0)
      expect(rest).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('tie-breaker is deterministic across multiple sorts', () => {
      const bids = [
        { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z'), _id: 'c' },
        { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z'), _id: 'a' },
        { amount: '100', amount_reached_at: new Date('2026-01-15T12:00:00Z'), _id: 'b' },
      ]

      const ranked1 = rankBids(bids)
      const ranked2 = rankBids(bids)
      const ranked3 = rankBids([...bids].reverse())

      // All should produce same order
      expect(ranked1.map((b) => b._id)).toEqual(['a', 'b', 'c'])
      expect(ranked2.map((b) => b._id)).toEqual(['a', 'b', 'c'])
      expect(ranked3.map((b) => b._id)).toEqual(['a', 'b', 'c'])
    })

    it('large bid amounts work correctly', () => {
      const bids = [
        { amount: '999999999', amount_reached_at: new Date() },
        { amount: '1000000000', amount_reached_at: new Date() },
      ]
      const ranked = rankBids(bids)
      expect(ranked[0].amount).toBe('1000000000')
    })
  })
})
