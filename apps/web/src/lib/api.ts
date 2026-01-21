import type {
  UserPublicDTO,
  AuthTelegramResponse,
  GetMeResponse,
  PatchMeResponse,
  PatchMeRequest,
  RandomizeResponse,
  AuctionDTO,
  AuctionListItemDTO,
  RoundDTO,
  BidDTO,
  BidLeaderboardItemDTO,
  WalletDTO,
  CreateAuctionRequest,
  LedgerEntryDTO,
} from '@tac/shared'

export type { LedgerEntryDTO }

export type { UserPublicDTO }

// Empty string = relative path (works with Vite proxy & tunnel)
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''
const API_BASE_URL = `${API_BASE}/api/v1`

type ApiResult<T> = { ok: true } & T

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  method: string,
  path: string,
  opts?: { body?: unknown; initData?: string },
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}

  if (opts?.body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  if (opts?.initData) {
    headers['x-init-data'] = opts.initData
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  const data: unknown = await res.json().catch(() => null)

  if (!res.ok || !isRecord(data) || data.ok !== true) {
    const msg =
      isRecord(data) && typeof data.error === 'string' && data.error.trim()
        ? data.error
        : `HTTP ${res.status}`
    throw new ApiError(msg, res.status)
  }

  return data as ApiResult<T>
}

export async function apiAuthTelegram(
  initData: string,
): Promise<AuthTelegramResponse & { ok: true }> {
  return request<Omit<AuthTelegramResponse & { ok: true }, 'ok'>>('POST', '/auth/telegram', {
    body: { init_data: initData },
  })
}

export async function apiGetMe(initData: string): Promise<UserPublicDTO> {
  const res = await request<Omit<GetMeResponse & { ok: true }, 'ok'>>('GET', '/me', { initData })
  return res.user
}

export async function apiPatchMe(initData: string, patch: PatchMeRequest): Promise<UserPublicDTO> {
  const res = await request<Omit<PatchMeResponse & { ok: true }, 'ok'>>('PATCH', '/me', {
    initData,
    body: patch,
  })
  return res.user
}

export async function apiRandomize(initData: string): Promise<UserPublicDTO> {
  const res = await request<Omit<RandomizeResponse & { ok: true }, 'ok'>>('POST', '/me/randomize', {
    initData,
  })
  return res.user
}

export async function apiGetAuctions(
  initData: string,
  status?: string,
): Promise<AuctionListItemDTO[]> {
  const query = status ? `?status=${status}` : ''
  const res = await request<{ auctions: AuctionListItemDTO[] }>('GET', `/auctions${query}`, {
    initData,
  })
  return res.auctions
}

export async function apiGetAuction(initData: string, id: string): Promise<AuctionDTO> {
  const res = await request<{ auction: AuctionDTO }>('GET', `/auctions/${id}`, { initData })
  return res.auction
}

export async function apiCreateAuction(
  initData: string,
  data: CreateAuctionRequest,
): Promise<AuctionDTO> {
  const res = await request<{ auction: AuctionDTO }>('POST', '/auctions', {
    initData,
    body: data,
  })
  return res.auction
}

export async function apiStartAuction(
  initData: string,
  id: string,
): Promise<{ auction: AuctionDTO; round: RoundDTO }> {
  const res = await request<{ auction: AuctionDTO; round: RoundDTO }>('POST', `/auctions/${id}/start`, {
    initData,
  })
  return res
}

export async function apiGetAuctionRound(initData: string, id: string): Promise<RoundDTO> {
  const res = await request<{ round: RoundDTO }>('GET', `/auctions/${id}/round`, { initData })
  return res.round
}

export async function apiGetLeaderboard(
  initData: string,
  id: string,
): Promise<{ leaderboard: BidLeaderboardItemDTO[]; my_bid?: BidDTO }> {
  const res = await request<{ leaderboard: BidLeaderboardItemDTO[]; my_bid?: BidDTO }>(
    'GET',
    `/auctions/${id}/leaderboard`,
    { initData },
  )
  return res
}

export async function apiPlaceBid(
  initData: string,
  auctionId: string,
  amount: string,
): Promise<{ bid: BidDTO; round: RoundDTO; leaderboard: BidLeaderboardItemDTO[] }> {
  const res = await request<{ bid: BidDTO; round: RoundDTO; leaderboard: BidLeaderboardItemDTO[] }>('POST', `/auctions/${auctionId}/bid`, {
    initData,
    body: { amount },
  })
  return res
}

export async function apiGetMyBid(initData: string, auctionId: string): Promise<BidDTO | null> {
  const res = await request<{ bid: BidDTO | null }>('GET', `/auctions/${auctionId}/my-bid`, {
    initData,
  })
  return res.bid
}

export async function apiGetWallet(initData: string): Promise<WalletDTO> {
  const res = await request<{ wallet: WalletDTO }>('GET', '/wallet', { initData })
  return res.wallet
}

export async function apiDeposit(initData: string, amount: string): Promise<WalletDTO> {
  const res = await request<{ wallet: WalletDTO }>('POST', '/wallet/deposit', {
    initData,
    body: { amount },
  })
  return res.wallet
}

export type GiftItemDTO = {
  id: string
  auction_id: string
  auction_name: string
  auction_photo: string
  gift_number: number
  gift_name: string
  claimed_at: string | null
}

export async function apiGetMyGifts(initData: string): Promise<GiftItemDTO[]> {
  const res = await request<{ gifts: GiftItemDTO[] }>('GET', '/gifts/my', { initData })
  return res.gifts
}

export async function apiGetHistory(initData: string, limit = 50): Promise<LedgerEntryDTO[]> {
  const res = await request<{ entries: LedgerEntryDTO[] }>('GET', `/wallet/history?limit=${limit}`, { initData })
  return res.entries
}
