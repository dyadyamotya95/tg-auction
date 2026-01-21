import { loadRootDotenv, readEnv, readEnvNumber } from '@tac/env'

loadRootDotenv()

const env = process.env

export const config = Object.freeze({
  dev_mode: readEnv(env, 'DEV_MODE') === 'true',
  http: Object.freeze({
    port: readEnvNumber(env, 'PORT', 3000),
  }),
  mongo: Object.freeze({
    uri: readEnv(env, 'MONGO_URI') ?? '',
  }),
  telegram: Object.freeze({
    bot_token: readEnv(env, 'TELEGRAM_BOT_TOKEN') ?? '',
  }),
  webapp: Object.freeze({
    url: readEnv(env, 'WEBAPP_URL') ?? '',
  }),
})
