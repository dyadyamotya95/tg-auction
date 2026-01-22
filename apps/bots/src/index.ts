import WebSocket from 'ws'
import { connectMongo, Auctions, Wallets } from '@tac/db'
import { config, BOT_PROFILES } from './config.js'

const triggeredAuctions = new Set<string>()
const auctionConnections = new Map<string, WebSocket>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(): number {
  return config.bots.delay_min_ms + Math.random() * (config.bots.delay_max_ms - config.bots.delay_min_ms)
}

async function api<T = unknown>(
  method: string,
  path: string,
  authId: number,
  body?: unknown,
): Promise<{ ok: boolean; error?: string } & T> {
  const res = await fetch(`${config.api.url}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': `bot:${authId}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function ensureBotWallets() {
  for (const bot of BOT_PROFILES) {
    const wallet = await Wallets.findOne({ user_id: bot.id })
    if (!wallet || parseFloat(wallet.balance) < 100000) {
      await api('POST', '/wallet/deposit', bot.authId, { amount: '1000000' })
      console.log(`[Bots] Wallet topped up for ${bot.name}`)
    }
  }
}

async function placeBotBids(auctionId: string, currentBidAmount: string) {
  const baseAmount = Math.ceil(parseFloat(currentBidAmount))
  
  const auction = await Auctions.findById(auctionId).lean()
  if (!auction) {
    return
  }
  
  const bidStep = Math.ceil(parseFloat(auction.bid_step))
  
  for (let i = 0; i < BOT_PROFILES.length; i++) {
    const bot = BOT_PROFILES[i]
    const amount = baseAmount + bidStep * (i + 1)
    
    await sleep(randomDelay())
    
    const result = await api('POST', `/auctions/${auctionId}/bid`, bot.authId, {
      amount: String(amount),
    })
    
    if (result.ok) {
      console.log(`[Bots] ${bot.name} bid ${amount} on auction ${auctionId.slice(-6)}`)
    } else {
      console.log(`[Bots] ${bot.name} failed: ${result.error}`)
    }
  }
}

function isBotUserId(userId: number | null): boolean {
  if (userId === null) {
    return false
  }
  return userId >= 100001 && userId <= 100005
}

function connectToAuction(auctionId: string) {
  if (auctionConnections.has(auctionId)) {
    return
  }
  
  const wsUrl = config.api.url.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsUrl}/api/v1/ws/auction/${auctionId}`)
  
  ws.on('open', () => {
    console.log(`[Bots] Connected to auction ${auctionId.slice(-6)}`)
    ws.send(JSON.stringify({ type: 'auth', init_data: 'bot:1' }))
  })
  
  ws.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString())
      
      if (event.type === 'bid' && !triggeredAuctions.has(auctionId)) {
        const bidUserId = event.bid?.user_id
        
        if (!isBotUserId(bidUserId)) {
          console.log(`[Bots] Real user bid detected on auction ${auctionId.slice(-6)}, triggering bots...`)
          triggeredAuctions.add(auctionId)
          
          await placeBotBids(auctionId, event.bid.amount)
        }
      }
    } catch {
      // ignore parse errors
    }
  })
  
  ws.on('close', () => {
    console.log(`[Bots] Disconnected from auction ${auctionId.slice(-6)}`)
    auctionConnections.delete(auctionId)
  })
  
  ws.on('error', () => {
    auctionConnections.delete(auctionId)
  })
  
  auctionConnections.set(auctionId, ws)
}

function disconnectFromAuction(auctionId: string) {
  const ws = auctionConnections.get(auctionId)
  if (ws) {
    ws.close()
    auctionConnections.delete(auctionId)
  }
}

async function pollActiveAuctions() {
  try {
    const activeAuctions = await Auctions.find({ status: 'active' }).lean()
    const activeIds = new Set(activeAuctions.map((a) => String(a._id)))
    
    for (const auction of activeAuctions) {
      const id = String(auction._id)
      if (!auctionConnections.has(id)) {
        connectToAuction(id)
      }
    }
    
    for (const [id] of auctionConnections) {
      if (!activeIds.has(id)) {
        disconnectFromAuction(id)
        triggeredAuctions.delete(id)
      }
    }
  } catch (err) {
    console.error('[Bots] Poll error:', err)
  }
}

async function main() {
  if (!config.bots.enabled) {
    console.log('[Bots] Disabled via BOTS_ENABLED=false')
    return
  }
  
  await connectMongo(config.mongo.uri)
  console.log('[Bots] Connected to MongoDB')
  
  await ensureBotWallets()
  console.log('[Bots] Bot wallets ready')
  
  console.log(`[Bots] Service started, polling every ${config.bots.poll_interval_ms}ms`)
  console.log(`[Bots] Delay between bots: ${config.bots.delay_min_ms}-${config.bots.delay_max_ms}ms`)
  
  const run = async () => {
    await pollActiveAuctions()
    setTimeout(run, config.bots.poll_interval_ms)
  }
  
  run()
}

main().catch((err) => {
  console.error('[Bots] Fatal error:', err)
  process.exit(1)
})
