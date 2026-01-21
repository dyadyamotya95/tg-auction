import { Schema, model, Types } from 'mongoose'

export interface LedgerEntryDoc {
  _id: Types.ObjectId
  user_id: number
  type: 'deposit' | 'hold' | 'release' | 'capture' | 'refund'
  amount: string
  balance_after: string
  hold_after: string
  ref_type: 'bid' | 'auction' | 'manual' | 'gift'
  ref_id?: Types.ObjectId
  note: string
  created_at: Date
}

const LedgerEntrySchema = new Schema({
  user_id: { type: Number, required: true },
  type: {
    type: String,
    enum: ['deposit', 'hold', 'release', 'capture', 'refund'],
    required: true,
  },
  amount: { type: String, required: true },
  balance_after: { type: String, required: true },
  hold_after: { type: String, required: true },
  ref_type: { type: String, enum: ['bid', 'auction', 'gift', 'manual'], default: 'manual' },
  ref_id: { type: Schema.Types.ObjectId },
  note: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  versionKey: false,
})

LedgerEntrySchema.index({ user_id: 1, created_at: -1 })

export const LedgerEntries = model<LedgerEntryDoc>('LedgerEntries', LedgerEntrySchema)
