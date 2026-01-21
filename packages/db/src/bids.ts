import { Schema, model, Types } from 'mongoose'

export interface BidDoc {
  _id: Types.ObjectId
  auction_id: Types.ObjectId
  round_id: Types.ObjectId
  user_id: number
  amount: string
  rank: number
  status: 'active' | 'won' | 'transferred' | 'refunded'
  amount_reached_at: Date
  award_number?: number
  won_at?: Date
  transferred_to_round_id?: Types.ObjectId
  transferred_at?: Date
  refunded_at?: Date
  created_at: Date
  updated_at: Date
}

const BidSchema = new Schema({
  auction_id: { type: Schema.Types.ObjectId, required: true },
  round_id: { type: Schema.Types.ObjectId, required: true },
  user_id: { type: Number, required: true },

  amount: { type: String, required: true },
  rank: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'won', 'transferred', 'refunded'],
    default: 'active',
  },
  amount_reached_at: { type: Date, required: true },
  award_number: { type: Number },
  won_at: { type: Date },
  transferred_to_round_id: { type: Schema.Types.ObjectId },
  transferred_at: { type: Date },
  refunded_at: { type: Date },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})

BidSchema.index({ round_id: 1, user_id: 1 }, { unique: true })
BidSchema.index({ auction_id: 1, user_id: 1 })
BidSchema.index({ round_id: 1, status: 1, amount: -1 })
BidSchema.index({ round_id: 1, amount: -1, amount_reached_at: 1 })

export const Bids = model<BidDoc>('Bids', BidSchema)
