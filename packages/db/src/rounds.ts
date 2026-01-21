import { Schema, model, Types } from 'mongoose'

export interface RoundDoc {
  _id: Types.ObjectId
  auction_id: Types.ObjectId
  round_number: number
  items_count: number
  start_at: Date
  end_at: Date
  extensions_count: number
  status: 'pending' | 'active' | 'finalizing' | 'completed'
  winners_count: number
  transferred_count: number
  created_at: Date
  updated_at: Date
}

const RoundSchema = new Schema({
  auction_id: { type: Schema.Types.ObjectId, required: true },
  round_number: { type: Number, required: true },
  items_count: { type: Number, required: true },
  start_at: { type: Date, required: true },
  end_at: { type: Date, required: true },
  extensions_count: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'active', 'finalizing', 'completed'],
    default: 'pending',
  },
  winners_count: { type: Number, default: 0 },
  transferred_count: { type: Number, default: 0 },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})

RoundSchema.index({ auction_id: 1, round_number: 1 }, { unique: true })
RoundSchema.index({ status: 1, end_at: 1 })

export const Rounds = model<RoundDoc>('Rounds', RoundSchema)
