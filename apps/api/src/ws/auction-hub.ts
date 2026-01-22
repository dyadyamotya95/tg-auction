import type { WSContext } from 'hono/ws'

type AuctionClient = {
  ws: WSContext
  auctionId: string
  userId: number
}

const clients = new Map<WSContext, AuctionClient>()
const auctionRooms = new Map<string, Set<WSContext>>()

export function addClient(ws: WSContext, auctionId: string, userId: number) {
  clients.set(ws, { ws, auctionId, userId })

  let room = auctionRooms.get(auctionId)
  if (!room) {
    room = new Set()
    auctionRooms.set(auctionId, room)
  }
  room.add(ws)
}

export function removeClient(ws: WSContext) {
  const client = clients.get(ws)
  if (client) {
    const room = auctionRooms.get(client.auctionId)
    if (room) {
      room.delete(ws)
      if (room.size === 0) {
        auctionRooms.delete(client.auctionId)
      }
    }
  }
  clients.delete(ws)
}

export function broadcastToAuction(auctionId: string, message: object) {
  const room = auctionRooms.get(auctionId)
  if (!room) {
    return
  }

  const data = JSON.stringify(message)
  for (const ws of room) {
    try {
      if (ws.readyState !== 1) {
        removeClient(ws)
        continue
      }
      ws.send(data)
    } catch {
      removeClient(ws)
    }
  }
}

export type LeaderboardEntry = {
  rank: number
  user_id: number
  display_name: string
  display_photo: string
  is_anonymous: boolean
  amount: string
  is_winner: boolean
}

export type LeaderboardEntryPublic = Omit<LeaderboardEntry, 'user_id'> & {
  user_id: number | null
}

export function maskLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntryPublic[] {
  return entries.map((e) => ({
    ...e,
    user_id: e.is_anonymous ? null : e.user_id,
  }))
}

export function notifyBid(auctionId: string, bid: {
  user_id: number
  display_name: string
  display_photo: string
  amount: string
  rank: number
  is_anonymous: boolean
}, leaderboard: LeaderboardEntry[]) {
  broadcastToAuction(auctionId, {
    type: 'bid',
    bid: {
      ...bid,
      user_id: bid.is_anonymous ? null : bid.user_id,
    },
    leaderboard: maskLeaderboard(leaderboard),
    ts: Date.now(),
  })
}

export function notifyRoundExtended(auctionId: string, round: {
  id: string
  end_at: string
  extensions_count: number
}) {
  broadcastToAuction(auctionId, {
    type: 'round_extended',
    round,
    ts: Date.now(),
  })
}

export function getAuctionViewers(auctionId: string): number {
  return auctionRooms.get(auctionId)?.size || 0
}
