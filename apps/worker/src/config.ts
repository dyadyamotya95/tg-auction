import { loadRootDotenv, readEnv } from '@tac/env'

loadRootDotenv()

const env = process.env

export const config = Object.freeze({
  mongo: Object.freeze({
    uri: readEnv(env, 'MONGO_URI') ?? '',
  }),
  worker: Object.freeze({
    interval_ms: parseInt(readEnv(env, 'WORKER_INTERVAL_MS') ?? '100'),
  }),
  telegram: Object.freeze({
    bot_token: readEnv(env, 'TELEGRAM_BOT_TOKEN') ?? '',
  }),
  webapp: Object.freeze({
    url: readEnv(env, 'WEBAPP_URL') ?? '',
  }),
})
