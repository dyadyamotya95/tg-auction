import { connectMongo } from '@tac/db'
import { config } from './config.js'
import { tick } from './finalize.js'

async function main() {
  await connectMongo(config.mongo.uri)
  console.log('Worker started, polling every', config.worker.interval_ms, 'ms')

  const run = async () => {
    await tick()
    setTimeout(run, config.worker.interval_ms)
  }

  run()
}

main().catch((err) => {
  console.error('Fatal error', err)
  process.exit(1)
})
