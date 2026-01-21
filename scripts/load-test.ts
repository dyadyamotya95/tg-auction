#!/usr/bin/env tsx
/**
 * LOAD TEST: 777 bots vs Anti-Sniping
 * 
 * 5 rounds × 15 seconds × 777 bets
 */

const API_URL = process.env.API_URL || 'http://localhost:3000'
const BOTS_COUNT = 777
const ROUNDS_COUNT = 5
const ITEMS_PER_ROUND = 10
const ROUND_MINUTES = 0.25
const ANTI_SNIPING_THRESHOLD = 10

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
}

function banner(text: string, color = c.cyan) {
  const line = '═'.repeat(60)
  console.log(`\n${color}${c.bold}${line}${c.reset}`)
  console.log(`${color}${c.bold}  ${text}${c.reset}`)
  console.log(`${color}${c.bold}${line}${c.reset}\n`)
}

function log(emoji: string, text: string, value?: string | number) {
  const v = value !== undefined ? `${c.bold}${c.white}${value}${c.reset}` : ''
  console.log(`  ${emoji}  ${text} ${v}`)
}

function progress(current: number, total: number, label: string) {
  const pct = Math.round((current / total) * 100)
  const filled = Math.round(pct / 5)
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
  process.stdout.write(`\r  ${c.cyan}${bar}${c.reset} ${pct}% ${label}`)
}

type LeaderboardItem = { rank: number; user_id: number; amount: string }

async function lastSecondAttack(
  auctionId: string,
  creatorId: number,
  botIds: number[],
  baseAmount: number,
  waitSeconds: number,
): Promise<{ successful: number; failed: number; durationMs: number }> {
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']

  console.log(`  ${c.dim}Waiting ${waitSeconds}s until last second...${c.reset}`)
  console.log()
  
  for (let i = waitSeconds; i > 0; i--) {
    const emoji = i <= 3 ? '🔥' : '⏳'
    const color = i <= 3 ? c.red : c.yellow
    process.stdout.write(`\r  ${emoji} ${color}${c.bold}${i}${c.reset}${color}s${c.reset} until ATTACK...   `)
    await sleep(1000)
  }
  console.log()
  console.log()

  console.log(`  ${c.bgRed}${c.white}${c.bold}  🚀🚀🚀 FIRING ${botIds.length} BIDS NOW! 🚀🚀🚀  ${c.reset}`)
  console.log()

  const startTime = Date.now()
  
  const bidPromises = botIds.map((userId, idx) => {
    const shuffledIdx = (idx * 137 + 42) % botIds.length // pseudo-shuffle
    const amount = String(baseAmount + shuffledIdx * 10)
    return api('POST', `/auctions/${auctionId}/bid`, userId, { amount })
      .then((res) => ({ ok: res.ok, error: res.error, userId, amount }))
      .catch((e) => ({ ok: false, error: String(e), userId, amount }))
  })

  const results = await Promise.all(bidPromises)
  const durationMs = Date.now() - startTime
  
  const successful = results.filter(r => r.ok).length
  const failedResults = results.filter(r => !r.ok)

  console.log(`  ${c.green}${c.bold}⚡ ${successful}${c.reset} bids landed in ${c.cyan}${durationMs}ms${c.reset}`)
  if (failedResults.length > 0) {
    console.log(`  ${c.red}✗ ${failedResults.length} failed${c.reset}`)
    const errorCounts = new Map<string, number>()
    for (const r of failedResults) {
      const err = r.error || 'unknown'
      errorCounts.set(err, (errorCounts.get(err) || 0) + 1)
    }
    for (const [err, count] of errorCounts) {
      console.log(`     ${c.dim}${err}: ${count}${c.reset}`)
    }
  }
  console.log(`  ${c.dim}Throughput: ${Math.round(successful / (durationMs / 1000))} bids/sec${c.reset}`)
  console.log()

  const lbRes = await api('GET', `/auctions/${auctionId}/leaderboard`, creatorId)
  const lb = (lbRes.leaderboard || []) as LeaderboardItem[]
  
  if (lb.length > 0) {
    console.log(`  ${c.yellow}${c.bold}🏆 TOP 5 AFTER ATTACK:${c.reset}`)
    lb.slice(0, 5).forEach((b, i) => {
      console.log(`     ${medals[i]} Bot#${b.user_id - 1000}: ${c.green}${b.amount}${c.reset}`)
    })
    console.log()
  }

  return { successful, failed: failedResults.length, durationMs }
}

interface ApiResponse<T = unknown> {
  ok: boolean
  error?: string
  auction?: T
  round?: T
  bid?: T
  leaderboard?: T[]
}

async function api<T>(
  method: string,
  path: string,
  userId: number,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': `test:${userId}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, error: text.slice(0, 100) }
  }
}

async function createWallet(userId: number, balance: string): Promise<void> {
  await api('POST', '/wallet/deposit', userId, { amount: balance })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log(`
${c.red}${c.bold}
    ██╗      ██████╗  █████╗ ██████╗     ████████╗███████╗███████╗████████╗
    ██║     ██╔═══██╗██╔══██╗██╔══██╗    ╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝
    ██║     ██║   ██║███████║██║  ██║       ██║   █████╗  ███████╗   ██║   
    ██║     ██║   ██║██╔══██║██║  ██║       ██║   ██╔══╝  ╚════██║   ██║   
    ███████╗╚██████╔╝██║  ██║██████╔╝       ██║   ███████╗███████║   ██║   
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝        ╚═╝   ╚══════╝╚══════╝   ╚═╝   
${c.reset}
${c.cyan}${c.bold}                    🔥 777 bots × 5 rounds × chaos 🔥${c.reset}
`)

  const CREATOR_ID = 999999
  const testStartTime = Date.now()
  const stats = {
    totalBids: 0,
    successfulBids: 0,
    failedBids: 0,
    extensions: 0,
    rounds: [] as { round: number; bids: number; duration: number; extended: boolean }[],
  }

  banner('PHASE 1: SETUP', c.blue)

  log('📦', 'Creating auction...')
  const createRes = await api('POST', '/auctions', CREATOR_ID, {
    auction_name: `Load Test ${new Date().toISOString()}`,
    auction_photo: 'g03',
    rounds_count: ROUNDS_COUNT,
    items_per_round: ITEMS_PER_ROUND,
    first_round_minutes: ROUND_MINUTES,
    other_rounds_minutes: ROUND_MINUTES,
    min_bid: '10',
    bid_step: '10',
    anti_sniping: {
      enabled: true,
      threshold_seconds: ANTI_SNIPING_THRESHOLD,
      extension_seconds: 5,
      max_extensions: 3,
    },
  })

  if (!createRes.ok) {
    console.log(`\n${c.red}${c.bold}  ❌ FAILED: ${createRes.error}${c.reset}`)
    process.exit(1)
  }

  const auctionId = (createRes.auction as { id: string })?.id
  if (!auctionId) {
    console.log(`\n${c.red}${c.bold}  ❌ FAILED: auction ID not returned${c.reset}`)
    process.exit(1)
  }
  log('✅', 'Auction created:', auctionId.slice(-8))

  log('💰', `Preparing ${BOTS_COUNT} bot wallets...`)
  const botIds = Array.from({ length: BOTS_COUNT }, (_, i) => 1000 + i)
  
  const BATCH_SIZE = 100
  for (let i = 0; i < botIds.length; i += BATCH_SIZE) {
    const batch = botIds.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map((id) => createWallet(id, '100000')))
    progress(Math.min(i + BATCH_SIZE, botIds.length), BOTS_COUNT, 'wallets')
  }
  console.log()
  log('✅', 'All wallets ready')

  log('▶️ ', 'Starting auction...')
  const startRes = await api('POST', `/auctions/${auctionId}/start`, CREATOR_ID)
  if (!startRes.ok) {
    console.log(`\n${c.red}${c.bold}  ❌ FAILED: ${startRes.error}${c.reset}`)
    process.exit(1)
  }
  log('✅', 'Auction started!')

  for (let roundNum = 1; roundNum <= ROUNDS_COUNT; roundNum++) {
    banner(`ROUND ${roundNum}/${ROUNDS_COUNT}`, c.magenta)

    let roundRes = await api('GET', `/auctions/${auctionId}/round`, CREATOR_ID)
    if (!roundRes.ok) {
      log('⚠️ ', 'Round not ready, waiting...')
      await sleep(3000)
      roundRes = await api('GET', `/auctions/${auctionId}/round`, CREATOR_ID)
      if (!roundRes.ok) {
        log('❌', 'Round still not ready, skipping')
        continue
      }
    }

    const round = roundRes.round as { end_at: string; extensions_count: number }
    const endAt = new Date(round.end_at)
    const now = Date.now()
    const timeToEnd = Math.max(5, Math.floor((endAt.getTime() - now) / 1000) - 2)

    log('⏰', 'Round ends at:', endAt.toLocaleTimeString())
    log('🎯', 'Items this round:', ITEMS_PER_ROUND)
    log('🤖', 'Bots ready:', BOTS_COUNT)
    console.log()

    console.log(`  ${c.bgRed}${c.white}${c.bold}  💣 LAST SECOND ATTACK: ${BOTS_COUNT} BOTS WAITING... 💣  ${c.reset}`)
    console.log()

    const baseAmount = roundNum * 10000
    const waitSeconds = Math.max(1, timeToEnd - 1) // Wait until 1 second left
    
    const { successful, failed, durationMs } = await lastSecondAttack(
      auctionId,
      CREATOR_ID,
      botIds,
      baseAmount,
      waitSeconds,
    )

    const bidDuration = durationMs

    stats.totalBids += BOTS_COUNT
    stats.successfulBids += successful
    stats.failedBids += failed

    const updatedRoundRes = await api('GET', `/auctions/${auctionId}/round`, CREATOR_ID)
    const updatedRound = updatedRoundRes.round as { end_at: string; extensions_count: number } | undefined
    const wasExtended = updatedRound && new Date(updatedRound.end_at) > endAt
    if (wasExtended) {
      stats.extensions++
    }

    stats.rounds.push({
      round: roundNum,
      bids: successful,
      duration: bidDuration,
      extended: !!wasExtended,
    })

    const lbRes = await api('GET', `/auctions/${auctionId}/leaderboard`, CREATOR_ID)
    const lb = (lbRes.leaderboard || []) as LeaderboardItem[]

    const ratePerSec = Math.round(successful / (bidDuration / 1000))
    console.log(`  ${c.green}┌─────────────────────────────────────────────┐${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  ${c.bold}ROUND ${roundNum} RESULTS${c.reset}                          ${c.green}│${c.reset}`)
    console.log(`  ${c.green}├─────────────────────────────────────────────┤${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  ✅ Successful:  ${c.bold}${successful.toString().padStart(4)}${c.reset} / ${BOTS_COUNT}             ${c.green}│${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  ❌ Failed:      ${c.bold}${failed.toString().padStart(4)}${c.reset}                       ${c.green}│${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  ⏱️  Duration:    ${c.bold}${bidDuration.toString().padStart(4)}${c.reset} ms                    ${c.green}│${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  📈 Throughput:  ${c.bold}${ratePerSec.toString().padStart(4)}${c.reset} bids/sec            ${c.green}│${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  🛡️  Extended:    ${wasExtended ? `${c.green}YES ✓${c.reset}` : `${c.dim}NO${c.reset}`}                       ${c.green}│${c.reset}`)
    console.log(`  ${c.green}│${c.reset}  📊 Total bids:  ${c.bold}${lb.length.toString().padStart(4)}${c.reset}                       ${c.green}│${c.reset}`)
    console.log(`  ${c.green}└─────────────────────────────────────────────┘${c.reset}`)

    log('⏳', 'Waiting for worker to finalize round...')
    
    let finalized = false
    for (let i = 0; i < 90; i++) {
      await sleep(1000)
      const checkRes = await api('GET', `/auctions/${auctionId}`, CREATOR_ID)
      const auction = checkRes.auction as { current_round: number; status: string } | undefined
      if (auction && (auction.current_round > roundNum || auction.status === 'completed')) {
        log('✅', 'Round finalized!')
        finalized = true
        break
      }
      process.stdout.write(`  ⏳  Waiting... ${i + 1}s\r`)
    }
    console.log()

    if (finalized) {
      console.log(`  ${c.yellow}${c.bold}🔍 VERIFYING FINANCIAL INTEGRITY...${c.reset}`)
      console.log()
      
      const winners = lb.slice(0, ITEMS_PER_ROUND)
      const losers = lb.slice(ITEMS_PER_ROUND)
      const isLastRound = roundNum === ROUNDS_COUNT

      let integrityOk = true

      console.log(`  ${c.cyan}📦 GIFTS CHECK:${c.reset}`)
      let giftsReceived = 0
      for (const winner of winners) {
        const giftsRes = await api('GET', '/gifts/my', winner.user_id)
        const gifts = (giftsRes as { gifts?: { id: string }[] }).gifts || []
        if (gifts.length > 0) {
          giftsReceived++
        }
      }
      const giftsOk = giftsReceived === winners.length
      console.log(`     ${giftsOk ? c.green + '✓' : c.red + '✗'}${c.reset} Winners received gifts: ${giftsReceived}/${winners.length}`)
      if (!giftsOk) {
        integrityOk = false
      }

      console.log(`  ${c.cyan}💰 WINNERS WALLETS:${c.reset}`)
      for (const winner of winners.slice(0, 3)) {
        const walletRes = await api('GET', '/wallet', winner.user_id)
        const wallet = (walletRes as { wallet?: { balance: string; hold: string; available: string } }).wallet
        if (wallet) {
          const total = parseFloat(wallet.balance)
          const hold = parseFloat(wallet.hold)
          const available = parseFloat(wallet.available)
          const bidAmount = parseFloat(winner.amount)
          const expectedTotal = 100000 - bidAmount // Initial deposit - bid
          const totalOk = Math.abs(total - expectedTotal) < 1
          console.log(`     Bot#${winner.user_id - 1000}: total=${total} hold=${hold} avail=${available} ${totalOk ? c.green + '✓' : c.yellow + '~'}${c.reset}`)
        }
      }

      console.log(`  ${c.cyan}💸 LOSERS WALLETS:${c.reset}`)
      if (isLastRound) {
        let refundOk = 0
        for (const loser of losers.slice(0, 5)) {
          const walletRes = await api('GET', '/wallet', loser.user_id)
          const wallet = (walletRes as { wallet?: { balance: string; hold: string; available: string } }).wallet
          if (wallet) {
            const hold = parseFloat(wallet.hold)
            const total = parseFloat(wallet.balance)
            if (hold === 0 && total === 100000) {
              refundOk++
              console.log(`     Bot#${loser.user_id - 1000}: total=${total} hold=${hold} ${c.green}✓ REFUNDED${c.reset}`)
            } else {
              console.log(`     Bot#${loser.user_id - 1000}: total=${total} hold=${hold} ${c.red}✗ NOT REFUNDED${c.reset}`)
              integrityOk = false
            }
          }
        }
        console.log(`     ${refundOk > 0 ? c.green + '✓' : c.red + '✗'}${c.reset} Refunded: ${refundOk}/5 sampled`)
      } else {
        let transferOk = 0
        for (const loser of losers.slice(0, 5)) {
          const walletRes = await api('GET', '/wallet', loser.user_id)
          const wallet = (walletRes as { wallet?: { balance: string; hold: string; available: string } }).wallet
          if (wallet) {
            const hold = parseFloat(wallet.hold)
            const bidAmount = parseFloat(loser.amount)
            if (hold >= bidAmount) {
              transferOk++
              console.log(`     Bot#${loser.user_id - 1000}: hold=${hold} bid=${bidAmount} ${c.green}✓ TRANSFERRED${c.reset}`)
            } else {
              console.log(`     Bot#${loser.user_id - 1000}: hold=${hold} bid=${bidAmount} ${c.yellow}? CHECK${c.reset}`)
            }
          }
        }
        console.log(`     ${transferOk > 0 ? c.green + '✓' : c.yellow + '?'}${c.reset} Transferred: ${transferOk}/5 sampled`)
      }

      console.log()
      if (integrityOk) {
        console.log(`  ${c.bgGreen}${c.white}${c.bold}  ✅ INTEGRITY CHECK PASSED  ${c.reset}`)
      } else {
        console.log(`  ${c.bgRed}${c.white}${c.bold}  ⚠️  INTEGRITY ISSUES DETECTED  ${c.reset}`)
      }
      console.log()
    }

    if (roundNum >= ROUNDS_COUNT) {
      break
    }
  }

  banner('FINAL RESULTS', c.green)

  const totalDuration = Math.round((Date.now() - testStartTime) / 1000)

  console.log(`
  ${c.cyan}╔═══════════════════════════════════════════════════════════╗${c.reset}
  ${c.cyan}║${c.reset}                                                           ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}🤖 BOTS${c.reset}                           ${c.bold}${BOTS_COUNT.toString().padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}🔄 ROUNDS${c.reset}                          ${c.bold}${ROUNDS_COUNT.toString().padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}📨 TOTAL BIDS${c.reset}                      ${c.bold}${stats.totalBids.toString().padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}✅ SUCCESSFUL${c.reset}                      ${c.green}${c.bold}${stats.successfulBids.toString().padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}❌ FAILED${c.reset}                          ${stats.failedBids > 0 ? c.red : c.green}${c.bold}${stats.failedBids.toString().padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}🛡️  EXTENSIONS${c.reset}                      ${c.bold}${stats.extensions.toString().padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}   ${c.bold}⏱️  DURATION${c.reset}                        ${c.bold}${(totalDuration + 's').padStart(15)}${c.reset}   ${c.cyan}║${c.reset}
  ${c.cyan}║${c.reset}                                                           ${c.cyan}║${c.reset}
  ${c.cyan}╚═══════════════════════════════════════════════════════════╝${c.reset}
`)

  console.log(`  ${c.dim}Per-round breakdown:${c.reset}`)
  stats.rounds.forEach((r) => {
    const status = r.bids === BOTS_COUNT ? `${c.green}✓${c.reset}` : `${c.yellow}~${c.reset}`
    const ext = r.extended ? `${c.magenta}+ext${c.reset}` : ''
    console.log(`    Round ${r.round}: ${status} ${r.bids}/${BOTS_COUNT} in ${r.duration}ms ${ext}`)
  })

  const successRate = (stats.successfulBids / stats.totalBids) * 100
  console.log()
  
  if (successRate === 100) {
    console.log(`  ${c.bgGreen}${c.white}${c.bold}  🎉 PERFECT! 100% SUCCESS RATE  ${c.reset}`)
  } else if (successRate >= 95) {
    console.log(`  ${c.bgGreen}${c.white}${c.bold}  ✅ PASSED! ${successRate.toFixed(1)}% SUCCESS RATE  ${c.reset}`)
  } else if (successRate >= 80) {
    console.log(`  ${c.bgYellow}${c.white}${c.bold}  ⚠️  ACCEPTABLE: ${successRate.toFixed(1)}% SUCCESS  ${c.reset}`)
  } else {
    console.log(`  ${c.bgRed}${c.white}${c.bold}  ❌ NEEDS WORK: ${successRate.toFixed(1)}% SUCCESS  ${c.reset}`)
  }

  console.log()
}

async function rpsTest() {
  const RPS_BOTS = 1000 // Realistic number for single-node test
  const CONCURRENCY = 50 // Parallel requests at any time
  const RPS_CREATOR_ID = 99999

  banner('MAX RPS TEST', c.magenta)
  console.log(`  ${c.dim}Bots: ${RPS_BOTS}, Concurrency: ${CONCURRENCY}${c.reset}`)
  console.log()

  // Create auction
  log('🎯', 'Creating auction...')
  const auctionRes = await api('POST', '/auctions', RPS_CREATOR_ID, {
    auction_name: 'RPS Stress Test',
    auction_photo: 'g12',
    rounds_count: 1,
    items_per_round: 100,
    first_round_minutes: 10,
    other_rounds_minutes: 10,
    min_bid: '10',
    bid_step: '10',
    anti_sniping_enabled: false,
  })

  if (!auctionRes.ok) {
    console.log(`  ${c.red}Failed: ${auctionRes.error}${c.reset}`)
    return
  }

  const auctionId = (auctionRes.auction as { id: string })?.id
  if (!auctionId) {
    console.log(`  ${c.red}Failed: no auction ID${c.reset}`)
    return
  }
  log('✅', 'Created:', auctionId.slice(-8))

  // Start
  const startRes = await api('POST', `/auctions/${auctionId}/start`, RPS_CREATOR_ID)
  if (!startRes.ok) {
    console.log(`  ${c.red}Failed to start: ${startRes.error}${c.reset}`)
    return
  }
  log('✅', 'Started')

  // Prepare wallets
  log('💰', `Creating ${RPS_BOTS} wallets...`)
  const botIds = Array.from({ length: RPS_BOTS }, (_, i) => 100000 + i)
  
  for (let i = 0; i < botIds.length; i += 100) {
    const batch = botIds.slice(i, i + 100)
    await Promise.all(batch.map((id) => api('POST', '/wallet/deposit', id, { amount: '1000000' })))
    progress(Math.min(i + 100, botIds.length), botIds.length, 'wallets')
  }
  console.log()
  log('✅', 'Wallets ready')
  console.log()

  // RPS Test with controlled concurrency (worker pool pattern)
  console.log(`  ${c.bgMagenta}${c.white}${c.bold}  🚀 STRESS TEST: ${RPS_BOTS} BIDS  ${c.reset}`)
  console.log()

  let completed = 0
  let successful = 0
  let failed = 0
  const errors = new Map<string, number>()
  const startTime = Date.now()
  
  let nextBotIdx = 0

  const sendBid = async (botIdx: number) => {
    const userId = botIds[botIdx]
    const amount = String(100 + botIdx * 10)
    try {
      const res = await api('POST', `/auctions/${auctionId}/bid`, userId, { amount })
      if (res.ok) {
        successful++
      } else {
        failed++
        const err = res.error || 'unknown'
        errors.set(err, (errors.get(err) || 0) + 1)
      }
    } catch {
      failed++
      errors.set('fetch failed', (errors.get('fetch failed') || 0) + 1)
    }
    completed++
  }

  const worker = async () => {
    while (nextBotIdx < botIds.length) {
      const idx = nextBotIdx++
      await sendBid(idx)
    }
  }

  // Progress reporter
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000
    const rps = Math.round(completed / elapsed)
    const pct = Math.round((completed / RPS_BOTS) * 100)
    process.stdout.write(`\r  📊 ${completed}/${RPS_BOTS} (${pct}%) | ✅ ${successful} ❌ ${failed} | ${c.cyan}${rps} rps${c.reset}   `)
  }, 200)

  // Start workers
  const workers = Array.from({ length: CONCURRENCY }, () => worker())
  await Promise.all(workers)
  
  clearInterval(progressInterval)
  console.log()

  const durationMs = Date.now() - startTime
  const durationSec = durationMs / 1000
  const rps = Math.round(successful / durationSec)

  // Results
  const successRate = Math.round((successful / RPS_BOTS) * 100)
  const avgLatency = Math.round(durationMs / RPS_BOTS * CONCURRENCY)
  
  console.log()
  console.log(`  ${c.cyan}╔═════════════════════════════════════════════════╗${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   ${c.bold}📊 RPS TEST RESULTS${c.reset}                        ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}╠═════════════════════════════════════════════════╣${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   Requests:     ${RPS_BOTS.toString().padStart(8)}                    ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   Concurrency:  ${CONCURRENCY.toString().padStart(8)}                    ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   Duration:     ${(durationSec.toFixed(1) + 's').padStart(8)}                    ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   Success:      ${(successRate + '%').padStart(8)} ${successful}/${RPS_BOTS}          ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   Avg latency:  ${(avgLatency + 'ms').padStart(8)}                    ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}╠═════════════════════════════════════════════════╣${c.reset}`)
  console.log(`  ${c.cyan}║${c.reset}   ${c.bold}🚀 THROUGHPUT: ${rps.toString().padStart(5)} req/sec${c.reset}              ${c.cyan}║${c.reset}`)
  console.log(`  ${c.cyan}╚═════════════════════════════════════════════════╝${c.reset}`)

  // Error breakdown
  if (failed > 0 && errors.size > 0) {
    console.log(`  ${c.dim}Error breakdown:${c.reset}`)
    for (const [err, count] of Array.from(errors.entries()).slice(0, 5)) {
      console.log(`    ${c.red}${count}x${c.reset} ${err}`)
    }
    console.log()
  }

  // Performance tier (for single node / dev environment)
  if (rps >= 500) {
    console.log(`  ${c.bgGreen}${c.white}${c.bold}  🏆 EXCELLENT: ${rps} RPS  ${c.reset}`)
  } else if (rps >= 150) {
    console.log(`  ${c.bgGreen}${c.white}${c.bold}  ✅ GOOD: ${rps} RPS (dev environment)  ${c.reset}`)
  } else if (rps >= 50) {
    console.log(`  ${c.bgYellow}${c.black}${c.bold}  ⚠️  ACCEPTABLE: ${rps} RPS  ${c.reset}`)
  } else {
    console.log(`  ${c.bgRed}${c.white}${c.bold}  ❌ SLOW: ${rps} RPS  ${c.reset}`)
  }

  console.log()
}

// Run both tests
async function runAll() {
  const args = process.argv.slice(2)
  
  if (args.includes('--rps-only')) {
    await rpsTest()
  } else if (args.includes('--rps')) {
    await main()
    await rpsTest()
  } else {
    await main()
  }
}

runAll().catch((err) => {
  console.error(`\n${c.red}Fatal error:${c.reset}`, err)
  process.exit(1)
})
