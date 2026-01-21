import type { UserPublicDTO } from './user.js'

/** Base API response shape. */
export type ApiResponse<T> = ({ ok: true } & T) | { ok: false; error: string }

/** POST /auth/telegram */
export type AuthTelegramRequest = { init_data: string }
export type AuthTelegramResponse = ApiResponse<{ user: UserPublicDTO }>

/** GET /me */
export type GetMeResponse = ApiResponse<{ user: UserPublicDTO }>

/** PATCH /me */
export type PatchMeRequest = { is_anonymous?: boolean; onboarding_done?: boolean }
export type PatchMeResponse = ApiResponse<{ user: UserPublicDTO }>

/** POST /me/randomize */
export type RandomizeResponse = ApiResponse<{ user: UserPublicDTO }>

/** Ledger entry (transaction history) */
export type LedgerEntryDTO = {
  id: string
  type: 'deposit' | 'hold' | 'release' | 'capture' | 'refund'
  amount: string
  balance_after: string
  hold_after: string
  note: string
  created_at: string
}

/** GET /wallet/history */
export type GetHistoryResponse = ApiResponse<{ entries: LedgerEntryDTO[] }>
