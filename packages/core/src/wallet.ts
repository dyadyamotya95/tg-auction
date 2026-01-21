import Big from 'big.js'

/**
 * Wallet model:
 * - balance = available for spending (liquid)
 * - hold = frozen for active bids
 */
export type WalletState = {
  balance: string
  hold: string
}

export function getTotal(wallet: WalletState): Big {
  return new Big(wallet.balance).plus(wallet.hold)
}

export function getAvailable(wallet: WalletState): Big {
  return new Big(wallet.balance)
}

export function canHold(wallet: WalletState, amount: string): boolean {
  return new Big(wallet.balance).gte(new Big(amount))
}

export function applyHold(wallet: WalletState, amount: string): WalletState {
  const amountBig = new Big(amount)
  const balance = new Big(wallet.balance).minus(amountBig)
  const hold = new Big(wallet.hold).plus(amountBig)
  return {
    balance: balance.lt(0) ? '0' : balance.toString(),
    hold: hold.toString(),
  }
}

export function applyRelease(wallet: WalletState, amount: string): WalletState {
  const amountBig = new Big(amount)
  const balance = new Big(wallet.balance).plus(amountBig)
  const hold = new Big(wallet.hold).minus(amountBig)
  return {
    balance: balance.toString(),
    hold: hold.lt(0) ? '0' : hold.toString(),
  }
}

export function applyCapture(wallet: WalletState, amount: string): WalletState {
  const hold = new Big(wallet.hold).minus(amount)
  return {
    balance: wallet.balance,
    hold: hold.lt(0) ? '0' : hold.toString(),
  }
}

export function applyDeposit(wallet: WalletState, amount: string): WalletState {
  const balance = new Big(wallet.balance).plus(amount)
  return {
    balance: balance.toString(),
    hold: wallet.hold,
  }
}

export function applyWithdraw(wallet: WalletState, amount: string): WalletState | null {
  const balanceBig = new Big(wallet.balance)
  const amountBig = new Big(amount)
  if (balanceBig.lt(amountBig)) {
    return null
  }
  return {
    balance: balanceBig.minus(amountBig).toString(),
    hold: wallet.hold,
  }
}
