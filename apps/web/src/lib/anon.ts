import {
  IconBat,
  IconBug,
  IconButterfly,
  IconCat,
  IconDeer,
  IconDog,
  IconFish,
  IconHorse,
  IconMouse,
  IconPaw,
  IconPig,
  IconUser,
} from '@tabler/icons-svelte'

export const GRADIENTS: Array<[string, string]> = [
  ['#24A2FF', '#7A5CFF'],
  ['#2BD9C7', '#26A8FF'],
  ['#FFB338', '#FF4D6D'],
  ['#FF5EA8', '#7A5CFF'],
  ['#26A8FF', '#00D1FF'],
  ['#6CFF8A', '#26A8FF'],
  ['#FF6A3D', '#FFB338'],
  ['#9B5CFF', '#24A2FF'],
  ['#FF4D6D', '#FF5EA8'],
  ['#00D1FF', '#2BD9C7'],
  ['#FFD66B', '#FF6A3D'],
  ['#7A5CFF', '#9B5CFF'],
  ['#24A2FF', '#2BD9C7'],
  ['#FFB338', '#FF5EA8'],
  ['#26A8FF', '#7A5CFF'],
  ['#2BD9C7', '#6CFF8A'],
]

export const ANIMALS = [
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

export type AnimalId = (typeof ANIMALS)[number]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function createRandomAnonPhotoId(): string {
  const gradientIdx = Math.floor(Math.random() * GRADIENTS.length) + 1
  const animalIdx = Math.floor(Math.random() * ANIMALS.length)
  return `g${pad2(gradientIdx)}-${ANIMALS[animalIdx]}`
}

export function parseAnonPhoto(anon_photo: string | undefined): {
  gradientCss: string
  animalId: string
} {
  const fallback = {
    gradientCss: `linear-gradient(135deg, ${GRADIENTS[0][0]}, ${GRADIENTS[0][1]})`,
    animalId: 'fish',
  }

  if (!anon_photo) {
    return fallback
  }

  const match = anon_photo.match(/^g(\d+)-(.+)$/i)
  if (!match) {
    return fallback
  }

  const idx = Number(match[1])
  const animalId = match[2]
  const safe = Number.isFinite(idx) && idx > 0 ? idx : 1
  const [a, b] = GRADIENTS[(safe - 1) % GRADIENTS.length]
  return { gradientCss: `linear-gradient(135deg, ${a}, ${b})`, animalId }
}

const ANIMAL_ICONS: Record<string, typeof IconUser> = {
  cat: IconCat,
  dog: IconDog,
  fish: IconFish,
  deer: IconDeer,
  horse: IconHorse,
  pig: IconPig,
  mouse: IconMouse,
  bat: IconBat,
  butterfly: IconButterfly,
  bug: IconBug,
  paw: IconPaw,
  user: IconUser,
}

export function getAnimalIconComponent(animalId: string) {
  return ANIMAL_ICONS[animalId] || IconUser
}
