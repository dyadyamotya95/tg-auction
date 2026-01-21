import { Hono } from 'hono'
import Big from 'big.js'
import { mongoose, Wallets, LedgerEntries } from '@tac/db'
import { getTotal } from '@tac/core'
import type { WalletDTO } from '@tac/shared'
import { getAuth, type AuthEnv } from '../middleware/auth.js'

const wallet = new Hono<AuthEnv>()

function toWalletDTO(doc: { balance: string; hold: string }): WalletDTO {
  return {
    balance: getTotal(doc).toString(),
    hold: doc.hold,
    available: doc.balance,
  }
}

wallet.get('/', async (c) => {
  const { tgUser } = getAuth(c)

  let doc = await Wallets.findOne({ user_id: tgUser.id })
  if (!doc) {
    doc = await Wallets.create({ user_id: tgUser.id, balance: '0', hold: '0' })
  }

  return c.json({ ok: true, wallet: toWalletDTO(doc) })
})

wallet.post('/deposit', async (c) => {
  const { tgUser } = getAuth(c)
  const body = await c.req.json().catch(() => ({}))
  const amount = body?.amount

  if (!amount || typeof amount !== 'string') {
    return c.json({ ok: false, error: 'Amount required' }, 400)
  }

  let amountBig: Big
  try {
    amountBig = new Big(amount)
    if (!amountBig.eq(amountBig.round(0)) || amountBig.lte(0)) {
      throw new Error()
    }
  } catch {
    return c.json({ ok: false, error: 'Invalid amount' }, 400)
  }

  const MAX_ATTEMPTS = 3
  let lastErr: unknown = null

  const isRetryable = (err: unknown): boolean => {
    if (!err || typeof err !== 'object') {
      return false
    }
    const code = (err as { code?: unknown }).code
    if (code === 11000 || code === 112) {
      return true
    }
    const labels = (err as { errorLabels?: unknown }).errorLabels
    return (
      Array.isArray(labels) &&
      (labels.includes('TransientTransactionError') || labels.includes('UnknownTransactionCommitResult'))
    )
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const session = await mongoose.startSession()
    try {
      const updatedDoc = await session.withTransaction(async () => {
        const wallet = await Wallets.findOneAndUpdate(
          { user_id: tgUser.id },
          { $setOnInsert: { user_id: tgUser.id, balance: '0', hold: '0' } },
          { upsert: true, returnDocument: 'after', session },
        )

        if (!wallet) {
          throw new Error('Wallet upsert failed')
        }

        const nextBalance = new Big(wallet.balance).plus(amountBig).toString()
        const updated = await Wallets.findOneAndUpdate(
          { _id: wallet._id },
          { $set: { balance: nextBalance } },
          { returnDocument: 'after', session },
        )

        if (!updated) {
          throw new Error('Wallet update failed')
        }

        await LedgerEntries.create(
          [
            {
              user_id: tgUser.id,
              type: 'deposit',
              amount: amountBig.toString(),
              balance_after: updated.balance,
              hold_after: updated.hold,
              ref_type: 'manual',
              note: '',
            },
          ],
          { session },
        )

        return updated
      })

      return c.json({ ok: true, wallet: toWalletDTO(updatedDoc!) })
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS && isRetryable(err)) {
        continue
      }
      console.error('deposit failed', err)
      return c.json({ ok: false, error: 'Failed to deposit' }, 500)
    } finally {
      await session.endSession()
    }
  }

  console.error('deposit failed', lastErr)
  return c.json({ ok: false, error: 'Failed to deposit' }, 500)
})

wallet.get('/history', async (c) => {
  const { tgUser } = getAuth(c)
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)

  const entries = await LedgerEntries.find({ user_id: tgUser.id })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean()

  return c.json({
    ok: true,
    entries: entries.map((e) => ({
      id: String(e._id),
      type: e.type,
      amount: e.amount,
      balance_after: e.balance_after,
      hold_after: e.hold_after,
      note: e.note,
      created_at: e.created_at.toISOString(),
    })),
  })
})

export { wallet }
