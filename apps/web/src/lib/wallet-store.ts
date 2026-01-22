import { derived, get, writable } from 'svelte/store'
import type { WalletDTO } from '@tac/shared'
import { apiDeposit, apiGetWallet } from './api'
import { getInitData } from './init-data'

type WalletStoreState = {
  wallet: WalletDTO | null
  loading: boolean
  last_updated_at: number
}

const state = writable<WalletStoreState>({
  wallet: null,
  loading: false,
  last_updated_at: 0,
})

let inFlight: Promise<WalletDTO | null> | null = null

async function refresh(): Promise<WalletDTO | null> {
  if (inFlight) {
    return inFlight
  }

  inFlight = (async () => {
    state.update((s) => ({ ...s, loading: true }))
    try {
      const initData = getInitData()
      if (!initData) {
        return null
      }

      const wallet = await apiGetWallet(initData)
      state.set({ wallet, loading: false, last_updated_at: Date.now() })
      return wallet
    } catch {
      state.update((s) => ({ ...s, loading: false }))
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

async function ensure(): Promise<WalletDTO | null> {
  const s = get(state)
  if (s.wallet) {
    return s.wallet
  }
  
  return await refresh()
}

async function deposit(amount: number): Promise<WalletDTO | null> {
  state.update((s) => ({ ...s, loading: true }))
  try {
    const initData = getInitData()
    if (!initData) {
      return null
    }
    
    const wallet = await apiDeposit(initData, String(amount))
    state.set({ wallet, loading: false, last_updated_at: Date.now() })
    return wallet
  } catch {
    state.update((s) => ({ ...s, loading: false }))
    return null
  }
}

export const walletStore = {
  subscribe: state.subscribe,
  refresh,
  ensure,
  deposit,
  set(wallet: WalletDTO) {
    state.set({ wallet, loading: false, last_updated_at: Date.now() })
  },
  clear() {
    state.set({ wallet: null, loading: false, last_updated_at: 0 })
  },
}

export const walletView = derived(state, ($s) => {
  // API returns: balance = total, available = liquid funds, hold = frozen
  const balance = $s.wallet ? Math.floor(parseFloat($s.wallet.balance)) || 0 : 0
  const hold = $s.wallet ? Math.floor(parseFloat($s.wallet.hold || '0')) || 0 : 0
  const available = $s.wallet ? Math.floor(parseFloat($s.wallet.available || '0')) || 0 : 0

  return {
    wallet: $s.wallet,
    loading: $s.loading,
    last_updated_at: $s.last_updated_at,
    balance,  // total funds
    hold,     // frozen
    available, // can spend now
  }
})

