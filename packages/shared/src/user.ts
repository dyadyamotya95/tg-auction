/** Full user document (backend / admin). */
export type UserDTO = {
  telegram_user_id: number
  public_name: string
  public_photo: string
  is_anonymous: boolean
  anon_name: string
  anon_photo: string
  onboarding_done: boolean
  onboarding_done_at?: string | null
  created_at: string
  updated_at: string
}

/** Public user info (only what frontend needs). */
export type UserPublicDTO = {
  telegram_user_id: number
  public_name: string
  public_photo: string
  is_anonymous: boolean
  anon_name: string
  anon_photo: string
  onboarding_done: boolean
}
