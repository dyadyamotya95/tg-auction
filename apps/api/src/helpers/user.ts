import type { UserDoc } from '@tac/db'
import type { UserPublicDTO } from '@tac/shared'

export function toUserPublic(doc: UserDoc): UserPublicDTO {
  return {
    telegram_user_id: doc.telegram_user_id,
    public_name: doc.public_name,
    public_photo: doc.public_photo || '',
    is_anonymous: doc.is_anonymous,
    anon_name: doc.anon_name,
    anon_photo: doc.anon_photo,
    onboarding_done: doc.onboarding_done,
  }
}
