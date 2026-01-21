import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { verifyTelegramInitData } from '@tac/telegram'
import { Users } from '@tac/db'
import { generateAnonIdentity } from '@tac/core'
import { config } from './config.js'
import { authMiddleware, getAuth, type AuthEnv } from './middleware/auth.js'
import { toUserPublic } from './helpers/user.js'
import { auctions } from './routes/auctions.js'
import { wallet } from './routes/wallet.js'
import { gifts } from './routes/gifts.js'

export type AppOptions = {
  mongoReady?: boolean
  skipLogger?: boolean
}

export function createApp(options: AppOptions = {}) {
  const { mongoReady = false, skipLogger = false } = options
  let isMongoReady = mongoReady

  const app = new Hono()

  if (!skipLogger) {
    app.use('*', logger())
  }

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Init-Data'],
      maxAge: 86400,
    }),
  )

  app.get('/health', (c) => c.json({ ok: true, mongo: isMongoReady, dev_mode: config.dev_mode }))

  const apiV1 = new Hono()
  apiV1.use('*', async (c, next) => {
    if (!isMongoReady) {
      return c.json({ ok: false, error: 'mongo is not available' }, 503)
    }
    await next()
  })

  apiV1.post('/auth/telegram', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const initData = typeof body?.init_data === 'string' ? body.init_data : ''

    if (!initData) {
      return c.json({ ok: false, error: 'init_data is required' }, 400)
    }

    if (!config.telegram.bot_token) {
      return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' }, 500)
    }

    const res = verifyTelegramInitData(initData, config.telegram.bot_token, {
      max_age_seconds: 24 * 60 * 60,
    })

    if (!res.ok) {
      return c.json({ ok: false, error: res.error }, 401)
    }

    const tgUser = res.user
    if (!tgUser?.id) {
      return c.json({ ok: false, error: 'telegram user is missing' }, 400)
    }

    const publicName =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() ||
      tgUser.username ||
      `user_${tgUser.id}`

    const publicPhoto = tgUser.photo_url || ''

    const anon = generateAnonIdentity()

    const doc = await Users.findOneAndUpdate(
      { telegram_user_id: tgUser.id },
      {
        $setOnInsert: {
          telegram_user_id: tgUser.id,
          is_anonymous: false,
          anon_name: anon.anon_name,
          anon_photo: anon.anon_photo,
          onboarding_done: false,
        },
        $set: {
          public_name: publicName,
          public_photo: publicPhoto,
        },
      },
      { new: true, upsert: true },
    ).lean()

    return c.json({ ok: true, user: toUserPublic(doc!) })
  })

  const apiV1Protected = new Hono<AuthEnv>()
  apiV1Protected.use('*', authMiddleware)

  apiV1Protected.get('/me', (c) => {
    const { user } = getAuth(c)
    return c.json({ ok: true, user })
  })

  apiV1Protected.patch('/me', async (c) => {
    const { tgUser, user } = getAuth(c)

    const body = await c.req.json().catch(() => ({}))
    const is_anonymous = typeof body?.is_anonymous === 'boolean' ? body.is_anonymous : undefined
    const onboarding_done =
      typeof body?.onboarding_done === 'boolean' ? body.onboarding_done : undefined

    const update: Record<string, unknown> = {}

    if (typeof is_anonymous === 'boolean') {
      update.is_anonymous = is_anonymous
    }

    if (onboarding_done === true) {
      update.onboarding_done = true
      update.onboarding_done_at = new Date()
    }

    if (Object.keys(update).length === 0) {
      return c.json({ ok: true, user })
    }

    const doc = await Users.findOneAndUpdate(
      { telegram_user_id: tgUser.id },
      { $set: update },
      { new: true },
    ).lean()

    return c.json({ ok: true, user: toUserPublic(doc!) })
  })

  apiV1Protected.post('/me/randomize', async (c) => {
    const { tgUser } = getAuth(c)

    const anon = generateAnonIdentity()
    const doc = await Users.findOneAndUpdate(
      { telegram_user_id: tgUser.id },
      { $set: { anon_name: anon.anon_name, anon_photo: anon.anon_photo } },
      { new: true },
    ).lean()

    return c.json({ ok: true, user: toUserPublic(doc!) })
  })

  apiV1Protected.route('/auctions', auctions)
  apiV1Protected.route('/wallet', wallet)
  apiV1Protected.route('/gifts', gifts)

  apiV1.route('/', apiV1Protected)
  app.route('/api/v1', apiV1)

  return {
    app,
    setMongoReady: (ready: boolean) => {
      isMongoReady = ready
    },
  }
}
