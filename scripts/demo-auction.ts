#!/usr/bin/env tsx
// Creates a demo auction with anonymous bidders for screenshots

import { connectMongo, Users } from '../packages/db/src/index.js'
import { config } from '../packages/env/src/index.js'

const API_URL = process.env.API_URL || 'http://localhost:3000'

const DEMO_BIDDERS = [
  { id: 90001, name: 'Cosmic Cat', photo: 'g03-cat', amount: '2450' },
  { id: 90002, name: 'Silent Fish', photo: 'g07-fish', amount: '1890' },
  { id: 90003, name: 'Neon Deer', photo: 'g12-deer', amount: '1200' },
  { id: 90004, name: 'Swift Horse', photo: 'g05-horse', amount: '950' },
  { id: 90005, name: 'Lucky Butterfly', photo: 'g09-butterfly', amount: '720' },
]

async function api<T = unknown>(
  method: string,
  path: string,
  userId: number,
  body?: unknown,
): Promise<{ ok: boolean; error?: string } & T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': `test:${userId}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function main() {
  await connectMongo(config.mongo.uri)
  
  const creatorId = 89999

  console.log('Creating demo auction...')
  const auctionRes = await api<{ auction: { id: string } }>('POST', '/auctions', creatorId, {
    auction_name: 'Plush Pepe',
    auction_photo: 'g05',
    rounds_count: 3,
    items_per_round: 5,
    first_round_minutes: 30,
    other_rounds_minutes: 5,
    min_bid: '100',
    bid_step: '10',
    anti_sniping: {
      enabled: true,
      threshold_seconds: 30,
      extension_seconds: 60,
      max_extensions: 5,
    },
  })

  if (!auctionRes.ok) {
    console.error('Failed to create auction:', auctionRes.error)
    process.exit(1)
  }

  const auctionId = auctionRes.auction.id
  console.log('Auction created:', auctionId)

  console.log('Setting up bidders...')
  for (const bidder of DEMO_BIDDERS) {
    await api('POST', '/wallet/deposit', bidder.id, { amount: '10000' })
    
    await Users.updateOne(
      { telegram_user_id: bidder.id },
      {
        $set: {
          is_anonymous: true,
          anon_name: bidder.name,
          anon_photo: bidder.photo,
        },
      },
    )
  }

  console.log('Starting auction...')
  const startRes = await api('POST', `/auctions/${auctionId}/start`, creatorId)
  if (!startRes.ok) {
    console.error('Failed to start:', startRes.error)
    process.exit(1)
  }

  console.log('Placing bids...')
  for (const bidder of DEMO_BIDDERS) {
    const bidRes = await api('POST', `/auctions/${auctionId}/bid`, bidder.id, {
      amount: bidder.amount,
    })
    if (bidRes.ok) {
      console.log(`  ${bidder.name}: ${bidder.amount}`)
    } else {
      console.log(`  ${bidder.name}: FAILED - ${bidRes.error}`)
    }
  }

  console.log('\nDone!')
  process.exit(0)
}

main().catch(console.error)
