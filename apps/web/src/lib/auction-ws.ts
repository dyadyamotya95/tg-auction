type LeaderboardEntry = {
  rank: number
  user_id: number
  display_name: string
  display_photo: string
  is_anonymous: boolean
  amount: string
  is_winner: boolean
}

type BidEvent = {
  type: 'bid'
  bid: {
    user_id: number
    display_name: string
    display_photo: string
    amount: string
    rank: number
    is_anonymous: boolean
  }
  leaderboard: LeaderboardEntry[]
  ts: number
}

type RoundExtendedEvent = {
  type: 'round_extended'
  round: {
    id: string
    end_at: string
    extensions_count: number
  }
  ts: number
}

type AuctionEvent = BidEvent | RoundExtendedEvent | { type: 'connected' | 'pong'; ts: number }

type Listener = (event: AuctionEvent) => void

export class AuctionWebSocket {
  private ws: WebSocket | null = null
  private listeners: Set<Listener> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private auctionId: string
  private initData: string

  constructor(auctionId: string, initData: string) {
    this.auctionId = auctionId
    this.initData = initData
  }

  connect() {
    if (this.ws) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/api/v1/ws/auction/${this.auctionId}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('[WS] connected, sending auth, initData length:', this.initData?.length)
      this.ws?.send(JSON.stringify({ type: 'auth', init_data: this.initData }))
    }

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as AuctionEvent
        if (event.type === 'connected') {
          this.startPing()
        }
        for (const listener of this.listeners) {
          listener(event)
        }
      } catch {
        // ignore
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.cleanup()
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cleanup()
    this.ws?.close()
    this.ws = null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private cleanup() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }
}
