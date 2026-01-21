import { loadRootDotenv, readEnv } from '@tac/env'

loadRootDotenv()

const env = process.env

const domain = readEnv(env, 'DOMAIN') ?? 'tg-auction-clone.online'

export const config = Object.freeze({
  telegram: Object.freeze({
    bot_token: readEnv(env, 'TELEGRAM_BOT_TOKEN') ?? '',
  }),
  webapp: Object.freeze({
    url: readEnv(env, 'WEBAPP_URL') ?? `https://${domain}/`,
  }),
})
