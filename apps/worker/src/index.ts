import { connectMongo } from '@tac/db'
import { initTgNotify } from '@tac/telegram'
import { config } from './config.js'
import { tick } from './finalize.js'

async function main() {
  await connectMongo(config.mongo.uri)
  initTgNotify(config.telegram.bot_token, config.webapp.url)
  console.log('Worker started, polling every', config.worker.interval_ms, 'ms')

  console.log('Running recovery tick...')
  await tick()

  const run = async () => {
    await tick()
    setTimeout(run, config.worker.interval_ms)
  }

  setTimeout(run, config.worker.interval_ms)
}

main().catch((err) => {
  console.error('Fatal error', err)
  process.exit(1)
})
