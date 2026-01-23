import { connectMongo, Wallets, Bids, LedgerEntries, Gifts, Auctions } from '../packages/db/src/index.js'
import Big from 'big.js'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tac?replicaSet=rs0&directConnection=true'

interface AuditResult {
  ok: boolean
  checks: {
    name: string
    ok: boolean
    details?: string
  }[]
}

async function audit(): Promise<AuditResult> {
  await connectMongo(MONGO_URI)

  const checks: AuditResult['checks'] = []

  // Check: balance + hold >= 0 for all wallets
  const negativeWallets = await Wallets.find({
    $or: [
      { $expr: { $lt: [{ $toDouble: '$balance' }, 0] } },
      { $expr: { $lt: [{ $toDouble: '$hold' }, 0] } },
    ],
  }).lean()

  checks.push({
    name: 'No negative balance/hold',
    ok: negativeWallets.length === 0,
    details: negativeWallets.length > 0
      ? `Found ${negativeWallets.length} wallets with negative values: ${negativeWallets.map((w) => w.user_id).join(', ')}`
      : undefined,
  })

  // Check: hold == sum of active bids for each user
  const wallets = await Wallets.find().lean()
  const holdMismatches: string[] = []

  for (const wallet of wallets) {
    const activeBids = await Bids.find({ user_id: wallet.user_id, status: 'active' }).lean()
    const totalActiveBids = activeBids.reduce((sum, b) => sum.plus(b.amount), new Big(0))
    const walletHold = new Big(wallet.hold)

    if (!walletHold.eq(totalActiveBids)) {
      holdMismatches.push(
        `user ${wallet.user_id}: hold=${wallet.hold}, active_bids=${totalActiveBids.toString()}`,
      )
    }
  }

  checks.push({
    name: 'Hold equals active bids sum',
    ok: holdMismatches.length === 0,
    details: holdMismatches.length > 0 ? holdMismatches.join('; ') : undefined,
  })

  // Check: no duplicate capture for one bid
  const capturesByBid = await LedgerEntries.aggregate([
    { $match: { type: 'capture', ref_type: 'gift' } },
    { $group: { _id: '$ref_id', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ])

  checks.push({
    name: 'No duplicate captures',
    ok: capturesByBid.length === 0,
    details: capturesByBid.length > 0
      ? `Found ${capturesByBid.length} gifts with multiple captures`
      : undefined,
  })

  // Check: no duplicate release/refund for one bid
  const releasesByBid = await LedgerEntries.aggregate([
    { $match: { type: 'release', ref_type: 'bid' } },
    { $group: { _id: '$ref_id', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ])

  checks.push({
    name: 'No duplicate releases',
    ok: releasesByBid.length === 0,
    details: releasesByBid.length > 0
      ? `Found ${releasesByBid.length} bids with multiple releases`
      : undefined,
  })

  // Check: each gift with owner_id has a corresponding capture
  const ownedGifts = await Gifts.find({ owner_id: { $ne: null } }).lean()
  const giftsWithoutCapture: string[] = []

  for (const gift of ownedGifts) {
    const capture = await LedgerEntries.findOne({ ref_type: 'gift', ref_id: gift._id, type: 'capture' })
    if (!capture) {
      giftsWithoutCapture.push(`gift ${gift._id} (owner: ${gift.owner_id})`)
    }
  }

  checks.push({
    name: 'All owned gifts have capture entry',
    ok: giftsWithoutCapture.length === 0,
    details: giftsWithoutCapture.length > 0 ? giftsWithoutCapture.join('; ') : undefined,
  })

  // Check: all won bids have award_number
  const wonBidsWithoutAward = await Bids.find({ status: 'won', award_number: null }).lean()

  checks.push({
    name: 'All won bids have award_number',
    ok: wonBidsWithoutAward.length === 0,
    details: wonBidsWithoutAward.length > 0
      ? `Found ${wonBidsWithoutAward.length} won bids without award_number`
      : undefined,
  })

  // Check: quantity of gifts == issued_gifts in auction
  const auctions = await Auctions.find().lean()
  const giftCountMismatches: string[] = []

  for (const auction of auctions) {
    const giftsCount = await Gifts.countDocuments({ auction_id: auction._id })
    if (giftsCount !== auction.issued_gifts) {
      giftCountMismatches.push(
        `auction ${auction._id}: issued_gifts=${auction.issued_gifts}, actual=${giftsCount}`,
      )
    }
  }

  checks.push({
    name: 'Gifts count matches issued_gifts',
    ok: giftCountMismatches.length === 0,
    details: giftCountMismatches.length > 0 ? giftCountMismatches.join('; ') : undefined,
  })

  // completed auctions не имеют active bids
  const completedAuctions = await Auctions.find({ status: 'completed' }).lean()
  const completedWithActiveBids: string[] = []

  for (const auction of completedAuctions) {
    const activeBids = await Bids.countDocuments({ auction_id: auction._id, status: 'active' })
    if (activeBids > 0) {
      completedWithActiveBids.push(`auction ${auction._id}: ${activeBids} active bids`)
    }
  }

  checks.push({
    name: 'Completed auctions have no active bids',
    ok: completedWithActiveBids.length === 0,
    details: completedWithActiveBids.length > 0 ? completedWithActiveBids.join('; ') : undefined,
  })

  const allOk = checks.every((c) => c.ok)

  return { ok: allOk, checks }
}

async function main() {
  console.log('Running audit...')

  const result = await audit()
  for (const check of result.checks) {
    console.log(`${check.name}`)
    if (check.details) {
      console.log(`   ${check.details}`)
    }
  }

  console.log('')
  if (result.ok) {
    console.log('All invariants OK')
  } else {
    console.log('Some invariants FAILED')
    process.exit(1)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
