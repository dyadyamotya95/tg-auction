import { Schema, model, Types } from 'mongoose'

export interface RoundConfig {
  round_number: number
  duration_minutes: number
  items_count: number
}

export interface AntiSnipingConfig {
  enabled: boolean
  threshold_seconds: number
  extension_seconds: number
  max_extensions: number
}

export interface AuctionDoc {
  _id: Types.ObjectId
  creator_id: number

  auction_name: string
  auction_photo: string

  total_items: number
  /** Internal counter for lazy gift creation. Increments on each awarded gift. */
  issued_gifts: number
  rounds_config: RoundConfig[]

  min_bid: string
  bid_step: string

  anti_sniping: AntiSnipingConfig
  status: 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled'
  start_at?: Date
  current_round: number
  unique_bidders: number
  highest_bid: string
  created_at: Date
  updated_at: Date
}

const RoundConfigSchema = new Schema({
  round_number: { type: Number, required: true },
  duration_minutes: { type: Number, required: true },
  items_count: { type: Number, required: true },
}, {
  _id: false,
})

const AntiSnipingConfigSchema = new Schema({
  enabled: { type: Boolean, default: true },
  threshold_seconds: { type: Number, default: 30 },
  extension_seconds: { type: Number, default: 30 },
  // 0 = без лимита (бесконечно)
  max_extensions: { type: Number, default: 0 },
}, { _id: false })

const AuctionSchema = new Schema({
  creator_id: { type: Number, required: true },
  auction_name: { type: String, required: true },
  auction_photo: { type: String, required: true },
  total_items: { type: Number, required: true },
  issued_gifts: { type: Number, default: 0 },
  rounds_config: { type: [RoundConfigSchema], required: true },
  min_bid: { type: String, required: true, default: '1' },
  bid_step: { type: String, required: true, default: '1' },
  anti_sniping: { type: AntiSnipingConfigSchema, default: () => ({}) },
  status: {
    type: String,
    enum: ['draft', 'upcoming', 'active', 'completed', 'cancelled'],
    default: 'draft',
  },
  start_at: { type: Date },
  current_round: { type: Number, default: 0 },
  unique_bidders: { type: Number, default: 0 },
  highest_bid: { type: String, default: '0' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})

AuctionSchema.index({ status: 1, start_at: 1 })
AuctionSchema.index({ creator_id: 1, created_at: -1 })

export const Auctions = model<AuctionDoc>('Auctions', AuctionSchema)
