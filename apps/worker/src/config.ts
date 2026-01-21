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
})
