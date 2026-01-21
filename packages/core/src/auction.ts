import Big from 'big.js'

export type RoundConfig = {
  round_number: number
  duration_minutes: number
  items_count: number
}

export type AntiSnipingConfig = {
  enabled: boolean
  threshold_seconds: number
  extension_seconds: number
  max_extensions: number
}

export const DEFAULT_ANTI_SNIPING: AntiSnipingConfig = {
  enabled: true,
  threshold_seconds: 30,
  extension_seconds: 30,
  // 0 = без лимита (бесконечно)
  max_extensions: 0,
}

export function validateRoundsConfig(rounds: RoundConfig[]): { ok: boolean; error?: string } {
  if (!rounds.length) {
    return { ok: false, error: 'At least one round required' }
  }

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]
    if (r.round_number !== i + 1) {
      return { ok: false, error: `Round ${i + 1} has wrong round_number` }
    }
    if (r.duration_minutes < 1) {
      return { ok: false, error: `Round ${i + 1} duration must be at least 1 minute` }
    }
    if (r.items_count < 1) {
      return { ok: false, error: `Round ${i + 1} must have at least 1 item` }
    }
  }

  return { ok: true }
}

export function calculateTotalItems(rounds: RoundConfig[]): number {
  return rounds.reduce((sum, r) => sum + r.items_count, 0)
}

export function isValidBidAmount(amount: string, minBid: string, bidStep: string): boolean {
  try {
    const a = new Big(amount)
    const min = new Big(minBid)
    const step = new Big(bidStep)

    if (!a.eq(a.round(0)) || a.lte(0)) {
      return false
    }

    if (a.lt(min)) {
      return false
    }

    const diff = a.minus(min)
    const remainder = diff.mod(step)
    return remainder.eq(0)
  } catch {
    return false
  }
}

export function isValidBidIncrease(
  currentAmount: string,
  newAmount: string,
  bidStep: string,
): boolean {
  try {
    const current = new Big(currentAmount)
    const next = new Big(newAmount)
    const step = new Big(bidStep)

    const diff = next.minus(current)
    return diff.gte(step)
  } catch {
    return false
  }
}

export function shouldExtendRound(
  endAt: Date,
  now: Date,
  thresholdSeconds: number,
  currentExtensions: number,
  maxExtensions: number,
): boolean {
  // maxExtensions <= 0 => без лимита
  if (maxExtensions > 0 && currentExtensions >= maxExtensions) {
    return false
  }

  const msToEnd = endAt.getTime() - now.getTime()
  const secondsToEnd = msToEnd / 1000

  return secondsToEnd <= thresholdSeconds && secondsToEnd > 0
}

export function compareBids(
  a: { amount: string; amount_reached_at: Date; _id?: unknown },
  b: { amount: string; amount_reached_at: Date; _id?: unknown },
): number {
  const amountA = new Big(a.amount)
  const amountB = new Big(b.amount)

  if (!amountA.eq(amountB)) {
    return amountB.minus(amountA).toNumber()
  }

  const timeDiff = a.amount_reached_at.getTime() - b.amount_reached_at.getTime()
  if (timeDiff !== 0) {
    return timeDiff
  }

  const aId = a._id ? String(a._id) : ''
  const bId = b._id ? String(b._id) : ''
  if (aId && bId && aId !== bId) {
    return aId < bId ? -1 : 1
  }

  return 0
}

export function rankBids<T extends { amount: string; amount_reached_at: Date }>(bids: T[]): T[] {
  return [...bids].sort(compareBids)
}

export function getTopK<T>(ranked: T[], k: number): { winners: T[]; rest: T[] } {
  return {
    winners: ranked.slice(0, k),
    rest: ranked.slice(k),
  }
}
