import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { connectMongo } from '@tac/db'
import { verifyTelegramInitData } from '@tac/telegram'
import { config } from './config.js'
import { createApp } from './app.js'
import { addClient, removeClient } from './ws/auction-hub.js'

const { app: baseApp, setMongoReady } = createApp()

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.route('/', baseApp)

function verifyWsInitData(initData: string): { ok: true; userId: number } | { ok: false; error: string } {
  if (!initData) {
    return { ok: false, error: 'init_data is required' }
  }

  if (config.dev_mode) {
    if (initData === 'dev') {
      return { ok: true, userId: 1 }
    }
    if (initData.startsWith('test:')) {
      const parsed = parseInt(initData.slice(5), 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        return { ok: true, userId: parsed }
      }
    }
  }

  if (!config.telegram.bot_token) {
    return { ok: false, error: 'bot token not configured' }
  }

  const res = verifyTelegramInitData(initData, config.telegram.bot_token, {
    max_age_seconds: 24 * 60 * 60,
  })

  if (!res.ok) {
    return { ok: false, error: res.error }
  }

  if (!res.user?.id) {
    return { ok: false, error: 'user missing in init_data' }
  }

  return { ok: true, userId: res.user.id }
}

app.get(
  '/api/v1/ws/auction/:id',
  upgradeWebSocket((c) => {
    const auctionId = c.req.param('id')
    const initData = c.req.query('init_data') || ''

    const authResult = verifyWsInitData(initData)
    if (!authResult.ok) {
      return {
        onOpen(_event, ws) {
          ws.send(JSON.stringify({ type: 'error', error: authResult.error, ts: Date.now() }))
          ws.close(4001, authResult.error)
        },
      }
    }

    const userId = authResult.userId

    return {
      onOpen(_event, ws) {
        addClient(ws, auctionId, userId)
        ws.send(JSON.stringify({ type: 'connected', auction_id: auctionId, ts: Date.now() }))
      },
      onMessage(event, ws) {
        try {
          const msg = JSON.parse(String(event.data))
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
          }
        } catch {
          // ignore
        }
      },
      onClose(_event, ws) {
        removeClient(ws)
      },
    }
  }),
)

async function main(): Promise<void> {
  if (config.dev_mode) {
    console.log('⚠️  DEV_MODE enabled — auth validation disabled')
  }

  if (config.mongo.uri) {
    try {
      await connectMongo(config.mongo.uri)
      setMongoReady(true)
      console.log('Mongo connected')
    } catch (err) {
      console.error('Mongo connect failed', err)
    }
  } else {
    console.warn('MONGO_URI is not set, Mongo is disabled')
  }

  const server = serve({ fetch: app.fetch, port: config.http.port })
  injectWebSocket(server)

  console.log(`API listening on http://localhost:${config.http.port}`)
}

main().catch((err) => {
  console.error('API_FATAL', err)
  process.exitCode = 1
})
