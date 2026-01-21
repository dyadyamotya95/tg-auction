import { Schema, model, Types } from 'mongoose'

export interface GiftDoc {
  _id: Types.ObjectId
  auction_id: Types.ObjectId
  gift_number: number
  owner_id: number | null
  round_id: Types.ObjectId | null
  bid_id: Types.ObjectId | null
  claimed_at: Date | null
  created_at: Date
  updated_at: Date
}

const GiftSchema = new Schema({
  auction_id: { type: Schema.Types.ObjectId, required: true },
  gift_number: { type: Number, required: true },
  owner_id: { type: Number, default: null },
  round_id: { type: Schema.Types.ObjectId, default: null },
  bid_id: { type: Schema.Types.ObjectId, default: null },
  claimed_at: { type: Date, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})

GiftSchema.index({ auction_id: 1, gift_number: 1 }, { unique: true })
GiftSchema.index({ auction_id: 1, owner_id: 1 })
GiftSchema.index({ owner_id: 1 })
GiftSchema.index({ bid_id: 1 }, { unique: true, sparse: true })

export const Gifts = model<GiftDoc>('Gifts', GiftSchema)
