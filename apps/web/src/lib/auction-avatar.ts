import { GRADIENTS } from './anon'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function createRandomAuctionPhotoId(): string {
  const gradientIdx = Math.floor(Math.random() * GRADIENTS.length) + 1
  return `g${pad2(gradientIdx)}`
}

export function parseAuctionPhoto(photo_id: string | undefined): {
  gradientCss: string
} {
  const fallback = {
    gradientCss: `linear-gradient(135deg, ${GRADIENTS[0][0]}, ${GRADIENTS[0][1]})`,
  }

  if (!photo_id) {
    return fallback
  }

  const match = photo_id.match(/^g(\d+)$/i)
  if (!match) {
    return fallback
  }

  const idx = Number(match[1])
  const safe = Number.isFinite(idx) && idx > 0 ? idx : 1
  const [a, b] = GRADIENTS[(safe - 1) % GRADIENTS.length]
  return { gradientCss: `linear-gradient(135deg, ${a}, ${b})` }
}

const AUCTION_ADJECTIVES = [
  'Grand',
  'Golden',
  'Royal',
  'Lucky',
  'Elite',
  'Prime',
  'Swift',
  'Bright',
  'Noble',
  'Epic',
  'Mega',
  'Super',
  'Flash',
  'Star',
  'Top',
  'Hot',
  'Cool',
  'Fire',
  'Neon',
  'Crystal',
] as const

const AUCTION_NOUNS = [
  'Bid',
  'Deal',
  'Drop',
  'Rush',
  'Hunt',
  'Wave',
  'Clash',
  'Race',
  'Spin',
  'Play',
  'Haul',
  'Win',
  'Grab',
  'Pick',
  'Shot',
] as const

export function generateRandomAuctionName(): string {
  const adj = AUCTION_ADJECTIVES[Math.floor(Math.random() * AUCTION_ADJECTIVES.length)]
  const noun = AUCTION_NOUNS[Math.floor(Math.random() * AUCTION_NOUNS.length)]
  return `${adj} ${noun}`
}
