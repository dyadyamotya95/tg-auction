import { describe, it, expect } from 'vitest'
import {
  getTotal,
  getAvailable,
  canHold,
  applyHold,
  applyRelease,
  applyCapture,
  applyDeposit,
  applyWithdraw,
} from '../src/wallet.js'

describe('wallet', () => {
  describe('getTotal', () => {
    it('returns balance + hold', () => {
      expect(getTotal({ balance: '1000', hold: '200' }).toString()).toBe('1200')
    })

    it('handles zero hold', () => {
      expect(getTotal({ balance: '500', hold: '0' }).toString()).toBe('500')
    })

    it('handles zero balance', () => {
      expect(getTotal({ balance: '0', hold: '300' }).toString()).toBe('300')
    })
  })

  describe('getAvailable', () => {
    it('returns balance directly (new model)', () => {
      expect(getAvailable({ balance: '1000', hold: '200' }).toString()).toBe('1000')
    })
  })

  describe('canHold', () => {
    it('returns true when balance >= amount', () => {
      expect(canHold({ balance: '1000', hold: '0' }, '500')).toBe(true)
      expect(canHold({ balance: '1000', hold: '0' }, '1000')).toBe(true)
    })

    it('returns false when balance < amount', () => {
      expect(canHold({ balance: '1000', hold: '0' }, '1001')).toBe(false)
    })

    it('ignores hold (balance is already available)', () => {
      expect(canHold({ balance: '1000', hold: '500' }, '1000')).toBe(true)
    })
  })

  describe('applyHold', () => {
    it('moves money from balance to hold', () => {
      const result = applyHold({ balance: '1000', hold: '0' }, '300')
      expect(result.balance).toBe('700')
      expect(result.hold).toBe('300')
    })

    it('accumulates hold on multiple calls', () => {
      let wallet = { balance: '1000', hold: '0' }
      wallet = applyHold(wallet, '200')
      wallet = applyHold(wallet, '300')
      expect(wallet.balance).toBe('500')
      expect(wallet.hold).toBe('500')
    })

    it('clamps balance to 0 if overdraft', () => {
      const result = applyHold({ balance: '100', hold: '0' }, '200')
      expect(result.balance).toBe('0')
      expect(result.hold).toBe('200')
    })

    it('preserves total funds', () => {
      const before = { balance: '1000', hold: '200' }
      const after = applyHold(before, '300')
      expect(getTotal(before).toString()).toBe(getTotal(after).toString())
    })
  })

  describe('applyRelease', () => {
    it('moves money from hold back to balance', () => {
      const result = applyRelease({ balance: '700', hold: '300' }, '300')
      expect(result.balance).toBe('1000')
      expect(result.hold).toBe('0')
    })

    it('handles partial release', () => {
      const result = applyRelease({ balance: '500', hold: '500' }, '200')
      expect(result.balance).toBe('700')
      expect(result.hold).toBe('300')
    })

    it('clamps hold to 0 if over-release', () => {
      const result = applyRelease({ balance: '500', hold: '100' }, '200')
      expect(result.hold).toBe('0')
      expect(result.balance).toBe('700')
    })

    it('preserves total funds', () => {
      const before = { balance: '700', hold: '300' }
      const after = applyRelease(before, '300')
      expect(getTotal(before).toString()).toBe(getTotal(after).toString())
    })
  })

  describe('applyCapture', () => {
    it('removes money from hold only, balance unchanged', () => {
      const result = applyCapture({ balance: '700', hold: '300' }, '300')
      expect(result.balance).toBe('700')
      expect(result.hold).toBe('0')
    })

    it('reduces total funds (money is spent)', () => {
      const before = { balance: '700', hold: '300' }
      const after = applyCapture(before, '300')
      expect(getTotal(before).toString()).toBe('1000')
      expect(getTotal(after).toString()).toBe('700')
    })

    it('clamps hold to 0 if over-capture', () => {
      const result = applyCapture({ balance: '500', hold: '100' }, '200')
      expect(result.hold).toBe('0')
    })
  })

  describe('applyDeposit', () => {
    it('adds money to balance', () => {
      const result = applyDeposit({ balance: '1000', hold: '200' }, '500')
      expect(result.balance).toBe('1500')
      expect(result.hold).toBe('200')
    })

    it('works on empty wallet', () => {
      const result = applyDeposit({ balance: '0', hold: '0' }, '1000')
      expect(result.balance).toBe('1000')
    })
  })

  describe('applyWithdraw', () => {
    it('removes money from balance', () => {
      const result = applyWithdraw({ balance: '1000', hold: '0' }, '300')
      expect(result?.balance).toBe('700')
    })

    it('returns null if insufficient balance', () => {
      const result = applyWithdraw({ balance: '100', hold: '0' }, '200')
      expect(result).toBeNull()
    })

    it('does not touch hold', () => {
      const result = applyWithdraw({ balance: '1000', hold: '500' }, '300')
      expect(result?.hold).toBe('500')
    })
  })

  describe('full lifecycle', () => {
    it('deposit → hold → capture (win)', () => {
      let wallet = { balance: '0', hold: '0' }
      
      // User deposits 1000
      wallet = applyDeposit(wallet, '1000')
      expect(wallet.balance).toBe('1000')
      expect(wallet.hold).toBe('0')
      
      // User places bid of 300
      wallet = applyHold(wallet, '300')
      expect(wallet.balance).toBe('700')
      expect(wallet.hold).toBe('300')
      
      // User wins - money captured
      wallet = applyCapture(wallet, '300')
      expect(wallet.balance).toBe('700')
      expect(wallet.hold).toBe('0')
      expect(getTotal(wallet).toString()).toBe('700')
    })

    it('deposit → hold → release (lose)', () => {
      let wallet = { balance: '0', hold: '0' }
      
      // User deposits 1000
      wallet = applyDeposit(wallet, '1000')
      
      // User places bid of 300
      wallet = applyHold(wallet, '300')
      expect(wallet.balance).toBe('700')
      expect(wallet.hold).toBe('300')
      
      // User loses - money released
      wallet = applyRelease(wallet, '300')
      expect(wallet.balance).toBe('1000')
      expect(wallet.hold).toBe('0')
      expect(getTotal(wallet).toString()).toBe('1000')
    })

    it('multiple bids with mixed outcomes', () => {
      let wallet = { balance: '0', hold: '0' }
      
      wallet = applyDeposit(wallet, '1000')
      
      // Bid 1: 200
      wallet = applyHold(wallet, '200')
      // Bid 2: 300
      wallet = applyHold(wallet, '300')
      
      expect(wallet.balance).toBe('500')
      expect(wallet.hold).toBe('500')
      
      // Win bid 1
      wallet = applyCapture(wallet, '200')
      expect(wallet.hold).toBe('300')
      
      // Lose bid 2
      wallet = applyRelease(wallet, '300')
      expect(wallet.balance).toBe('800')
      expect(wallet.hold).toBe('0')
    })
  })
})
