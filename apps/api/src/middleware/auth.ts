import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { verifyTelegramInitData, type TelegramInitDataUser } from '@tac/telegram'
import { Users } from '@tac/db'
import { generateAnonIdentity } from '@tac/core'
import type { UserPublicDTO } from '@tac/shared'
import { config } from '../config.js'
import { toUserPublic } from '../helpers/user.js'

const DEV_USER_ID = 1
const DEV_INIT_DATA = 'dev'
const TEST_PREFIX = 'test:'

export type AuthData = {
  tgUser: TelegramInitDataUser
  user: UserPublicDTO
}

export type AuthEnv = {
  Variables: {
    auth: AuthData
  }
}

function readInitData(c: Context): string {
  const header = c.req.header('x-init-data') ?? c.req.header('X-Init-Data')
  if (typeof header === 'string' && header.length > 0) {
    return header
  }
  return ''
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const initData = readInitData(c)
  if (!initData) {
    return c.json({ ok: false, error: 'x-init-data header is required' }, 401)
  }

  // DEV_MODE: support "dev" (user_id=1) or "test:USER_ID" format
  if (config.dev_mode) {
    let devUserId: number | null = null

    if (initData === DEV_INIT_DATA) {
      devUserId = DEV_USER_ID
    } else if (initData.startsWith(TEST_PREFIX)) {
      const parsed = parseInt(initData.slice(TEST_PREFIX.length), 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        devUserId = parsed
      }
    }

    if (devUserId !== null) {
      const anon = generateAnonIdentity()
      const doc = await Users.findOneAndUpdate(
        { telegram_user_id: devUserId },
        {
          $setOnInsert: {
            telegram_user_id: devUserId,
            public_name: `Dev User ${devUserId}`,
            public_photo: '',
            is_anonymous: false,
            anon_name: anon.anon_name,
            anon_photo: anon.anon_photo,
            onboarding_done: false,
          },
        },
        { new: true, upsert: true },
      ).lean()

      const devTgUser: TelegramInitDataUser = {
        id: devUserId,
        first_name: 'Dev',
        last_name: `User ${devUserId}`,
        username: `devuser${devUserId}`,
        language_code: 'en',
        is_premium: false,
        allows_write_to_pm: true,
      }

      c.set('auth', { tgUser: devTgUser, user: toUserPublic(doc!) })
      await next()
      return
    }
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

  c.set('auth', { tgUser, user: toUserPublic(doc!) })
  await next()
})

export function createAuthRouter() {
  return new Hono<AuthEnv>()
}

export function getAuth(c: { get: (key: 'auth') => AuthData | undefined }): AuthData {
  const auth = c.get('auth')
  if (!auth) {
    throw new Error('Middleware not applied')
  }
  return auth
}
