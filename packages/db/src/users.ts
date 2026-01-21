import { Schema, model, Types } from 'mongoose'

export interface UserDoc {
  _id: Types.ObjectId
  telegram_user_id: number
  public_name: string
  public_photo: string
  is_anonymous: boolean
  anon_name: string
  anon_photo: string
  onboarding_done: boolean
  onboarding_done_at?: Date
  created_at: Date
  updated_at: Date
}

const UserSchema = new Schema({
  telegram_user_id: { type: Number, required: true },
  public_name: { type: String, required: true },
  public_photo: { type: String, default: '' },
  is_anonymous: { type: Boolean, required: true, default: false },
  anon_name: { type: String, required: true },
  anon_photo: { type: String, required: true },
  onboarding_done: { type: Boolean, required: true, default: false },
  onboarding_done_at: { type: Date },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})

UserSchema.index({ telegram_user_id: 1 }, { unique: true })

export const Users = model<UserDoc>('Users', UserSchema)
