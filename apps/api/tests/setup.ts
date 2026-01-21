import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { mongoose, Users, Wallets, Auctions, Rounds, Bids, LedgerEntries, Gifts } from '@tac/db'
import { createApp } from '../src/app.js'

let replSet: MongoMemoryReplSet | null = null

export async function setupTestDB() {
  // Use replica set for transaction support
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })
  const uri = replSet.getUri()
  await mongoose.connect(uri)
}

export async function teardownTestDB() {
  await mongoose.disconnect()
  if (replSet) {
    await replSet.stop()
    replSet = null
  }
}

export async function clearCollections() {
  await Promise.all([
    Users.deleteMany({}),
    Wallets.deleteMany({}),
    Auctions.deleteMany({}),
    Rounds.deleteMany({}),
    Bids.deleteMany({}),
    LedgerEntries.deleteMany({}),
    Gifts.deleteMany({}),
  ])
}

export function createTestApp() {
  return createApp({ mongoReady: true, skipLogger: true })
}

// Test user helper
export async function createTestUser(telegramId: number, balance = '0') {
  const user = await Users.create({
    telegram_user_id: telegramId,
    public_name: `Test User ${telegramId}`,
    public_photo: 'https://example.com/photo.png',
    is_anonymous: false,
    anon_name: `Anon ${telegramId}`,
    anon_photo: 'https://example.com/anon.png',
    onboarding_done: true,
  })

  const wallet = await Wallets.create({
    user_id: telegramId,
    balance,
    hold: '0',
  })

  return { user, wallet }
}

// Mock initData generator for DEV_MODE
export function mockInitData(userId: number): string {
  // In DEV_MODE, use "test:USER_ID" format
  return `test:${userId}`
}

// Request helper
export async function apiRequest(
  app: ReturnType<typeof createApp>['app'],
  method: string,
  path: string,
  options: {
    userId?: number
    body?: unknown
  } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.userId) {
    headers['X-Init-Data'] = mockInitData(options.userId)
  }

  const res = await app.request(path, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const json = await res.json()
  return { status: res.status, json }
}
