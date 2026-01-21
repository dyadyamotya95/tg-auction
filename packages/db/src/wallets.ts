import { Schema, model, Types } from 'mongoose'

export interface WalletDoc {
  _id: Types.ObjectId
  user_id: number
  balance: string
  hold: string
  created_at: Date
  updated_at: Date
}

const WalletSchema = new Schema({
  user_id: { type: Number, required: true },
  balance: { type: String, required: true, default: '0' },
  hold: { type: String, required: true, default: '0' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})

WalletSchema.index({ user_id: 1 }, { unique: true })

export const Wallets = model<WalletDoc>('Wallets', WalletSchema)
