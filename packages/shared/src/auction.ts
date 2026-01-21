export type RoundConfigDTO = {
  round_number: number
  duration_minutes: number
  items_count: number
}

export type AntiSnipingConfigDTO = {
  enabled: boolean
  threshold_seconds: number
  extension_seconds: number
  max_extensions: number
}

export type AuctionStatus = 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled'

export type AuctionDTO = {
  id: string
  creator_id: number
  auction_name: string
  auction_photo: string
  total_items: number
  /** How many gifts were already distributed (claimed) in this auction. */
  distributed_items: number
  rounds_config: RoundConfigDTO[]
  min_bid: string
  bid_step: string
  anti_sniping: AntiSnipingConfigDTO
  status: AuctionStatus
  start_at: string | null
  current_round: number
  unique_bidders: number
  highest_bid: string
  created_at: string
}

export type AuctionListItemDTO = {
  id: string
  auction_name: string
  auction_photo: string
  total_items: number
  /** How many gifts were already distributed (claimed) in this auction. */
  distributed_items: number
  status: AuctionStatus
  start_at: string | null
  current_round: number
  total_rounds: number
  highest_bid: string
}

export type RoundStatus = 'pending' | 'active' | 'finalizing' | 'completed'

export type RoundDTO = {
  id: string
  auction_id: string
  round_number: number
  items_count: number
  start_at: string
  end_at: string
  extensions_count: number
  status: RoundStatus
  winners_count: number
  transferred_count: number
}

export type BidStatus = 'active' | 'won' | 'transferred' | 'refunded'

export type BidDTO = {
  id: string
  auction_id: string
  round_id: string
  user_id: number
  amount: string
  rank: number
  status: BidStatus
  award_number?: number
  created_at: string
}

export type BidLeaderboardItemDTO = {
  rank: number
  user_id: number
  display_name: string
  display_photo: string
  is_anonymous: boolean
  amount: string
  is_winner: boolean
}

export type WalletDTO = {
  balance: string
  hold: string
  available: string
}

export type CreateAuctionRequest = {
  auction_name: string
  auction_photo: string
  rounds_count: number
  items_per_round: number
  first_round_minutes: number
  other_rounds_minutes: number
  min_bid?: string
  bid_step?: string
  anti_sniping?: Partial<AntiSnipingConfigDTO>
  start_at?: string
}

export type PlaceBidRequest = {
  amount: string
}

export type AuctionResponse = { ok: true; auction: AuctionDTO }
export type AuctionListResponse = { ok: true; auctions: AuctionListItemDTO[] }
export type RoundResponse = { ok: true; round: RoundDTO }
export type BidResponse = { ok: true; bid: BidDTO }
export type LeaderboardResponse = { ok: true; leaderboard: BidLeaderboardItemDTO[]; my_bid?: BidDTO }
export type WalletResponse = { ok: true; wallet: WalletDTO }
