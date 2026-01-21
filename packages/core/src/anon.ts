import crypto from 'node:crypto'

// Product decision: adjective + animal, stored in Users.anon_name
export const ANON_ADJECTIVES = [
  'Silent',
  'Neon',
  'Cosmic',
  'Gentle',
  'Swift',
  'Cozy',
  'Lucky',
  'Curious',
  'Sunny',
  'Misty',
  'Velvet',
  'Crystal',
  'Brave',
  'Chill',
  'Electric',
  'Golden',
  'Arctic',
  'Soft',
  'Tiny',
  'Wild',
] as const

// Animals that have icons in Tabler Icons
export const ANON_ANIMALS = [
  'cat',
  'dog',
  'fish',
  'deer',
  'horse',
  'pig',
  'mouse',
  'bat',
  'butterfly',
  'bug',
  'paw',
] as const

export type AnonAnimalId = (typeof ANON_ANIMALS)[number]
export type AnonName = string
export type AnonPhotoId = string // e.g. "g07-fish"

function randomPick<T>(arr: readonly T[]): T {
  return arr[crypto.randomInt(0, arr.length)]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Returns e.g. "Silent Lynx".
 * We keep it short and readable.
 */
export function generateAnonName(): AnonName {
  const adjective = randomPick(ANON_ADJECTIVES)
  const animal = randomPick(ANON_ANIMALS)

  // Capitalize animal id (fish -> Fish)
  const animalLabel = animal.charAt(0).toUpperCase() + animal.slice(1)
  return `${adjective} ${animalLabel}`
}

/**
 * Returns stablezed avatar id used in Users.anon_photo, e.g. "g07-fish".
 * We store final id so avatars never "shift" if we expand palette later.
 */
export function generateAnonPhotoId(options?: {
  gradient_count?: number
  animal_id?: AnonAnimalId
}): AnonPhotoId {
  const gradientCount = options?.gradient_count ?? 16 // Match frontend GRADIENTS array length
  const gradientIdx = crypto.randomInt(1, gradientCount + 1)
  const gradientId = `g${pad2(gradientIdx)}`

  const animalId = options?.animal_id ?? randomPick(ANON_ANIMALS)
  return `${gradientId}-${animalId}`
}

export function generateAnonIdentity(): { anon_name: AnonName; anon_photo: AnonPhotoId } {
  return {
    anon_name: generateAnonName(),
    anon_photo: generateAnonPhotoId(),
  }
}
