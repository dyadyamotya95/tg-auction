import { loadRootDotenv, readEnv, readEnvNumber } from '@tac/env'

loadRootDotenv()

export const config = {
  mongo: {
    uri: readEnv(process.env, 'MONGO_URI') ?? 'mongodb://localhost:27017/tac',
  },
  api: {
    url: readEnv(process.env, 'API_URL') ?? 'http://localhost:3000',
  },
  bots: {
    enabled: readEnv(process.env, 'BOTS_ENABLED') !== 'false',
    poll_interval_ms: readEnvNumber(process.env, 'BOTS_POLL_INTERVAL_MS', 5000),
    delay_min_ms: readEnvNumber(process.env, 'BOTS_DELAY_MIN_MS', 100),
    delay_max_ms: readEnvNumber(process.env, 'BOTS_DELAY_MAX_MS', 300),
  },
}

export const BOT_PROFILES = [
  { id: 100001, authId: 1, name: 'Bot #1', photo: 'bot' },
  { id: 100002, authId: 2, name: 'Bot #2', photo: 'bot' },
  { id: 100003, authId: 3, name: 'Bot #3', photo: 'bot' },
  { id: 100004, authId: 4, name: 'Bot #4', photo: 'bot' },
  { id: 100005, authId: 5, name: 'Bot #5', photo: 'bot' },
]
