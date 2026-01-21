import { parse, validate } from '@tma.js/init-data-node'

export type TelegramInitDataParsed = ReturnType<typeof parse>

export type TelegramInitDataUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  allows_write_to_pm?: boolean
  photo_url?: string
}

export type TelegramInitData = TelegramInitDataParsed

export type VerifyInitDataResult =
  | { ok: true; data: TelegramInitData; user?: TelegramInitDataUser }
  | { ok: false; error: string }

export type VerifyInitDataOptions = {
  /**
   * Max allowed age of initData, in seconds. If not provided, no age check.
   * Telegram sends `auth_date` as unix timestamp (seconds).
   */
  max_age_seconds?: number
}

/**
 * Verify Telegram WebApp initData signature.
 *
 * Uses `@tma.js/init-data-node` under the hood (typed parse + validate).
 */
export function verifyTelegramInitData(
  init_data: string,
  bot_token: string,
  options: VerifyInitDataOptions = {},
): VerifyInitDataResult {
  if (!init_data) {
    return { ok: false, error: 'init_data is empty' }
  }
  if (!bot_token) {
    return { ok: false, error: 'bot_token is empty' }
  }

  try {
    validate(init_data, bot_token, {
      expiresIn: options.max_age_seconds ?? 0,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'hash mismatch' }
  }

  let data: TelegramInitDataParsed
  try {
    data = parse(init_data)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'init_data parse failed' }
  }

  return { ok: true, data, user: data.user }
}
