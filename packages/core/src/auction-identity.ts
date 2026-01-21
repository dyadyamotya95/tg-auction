import crypto from 'node:crypto'

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

export type AuctionName = string
export type AuctionPhotoId = string

function randomPick<T>(arr: readonly T[]): T {
  return arr[crypto.randomInt(0, arr.length)]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function generateAuctionName(): AuctionName {
  const adjective = randomPick(AUCTION_ADJECTIVES)
  const noun = randomPick(AUCTION_NOUNS)
  return `${adjective} ${noun}`
}

export function generateAuctionPhotoId(gradientCount = 16): AuctionPhotoId {
  const gradientIdx = crypto.randomInt(1, gradientCount + 1)
  return `g${pad2(gradientIdx)}`
}

export function generateAuctionIdentity(): {
  auction_name: AuctionName
  auction_photo: AuctionPhotoId
} {
  return {
    auction_name: generateAuctionName(),
    auction_photo: generateAuctionPhotoId(),
  }
}
