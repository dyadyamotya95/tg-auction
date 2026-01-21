import { Hono } from 'hono'
import { Gifts, Auctions } from '@tac/db'
import { getAuth, type AuthEnv } from '../middleware/auth.js'

const gifts = new Hono<AuthEnv>()

gifts.get('/my', async (c) => {
  const { tgUser } = getAuth(c)

  const docs = await Gifts.find({ owner_id: tgUser.id })
    .sort({ claimed_at: -1 })
    .limit(100)
    .lean()

  const auctionIds = [...new Set(docs.map((d) => d.auction_id))]
  const auctions = await Auctions.find({ _id: { $in: auctionIds } }).lean()
  const auctionMap = new Map(auctions.map((a) => [String(a._id), a]))

  const items = docs.map((d) => {
    const auction = auctionMap.get(String(d.auction_id))
    return {
      id: String(d._id),
      auction_id: String(d.auction_id),
      auction_name: auction?.auction_name || 'Unknown',
      auction_photo: auction?.auction_photo || '',
      gift_number: d.gift_number,
      gift_name: `${auction?.auction_name || 'Gift'} #${d.gift_number}`,
      claimed_at: d.claimed_at?.toISOString() || null,
    }
  })

  return c.json({ ok: true, gifts: items })
})

gifts.get('/:id', async (c) => {
  const id = c.req.param('id')

  const gift = await Gifts.findById(id).lean()
  if (!gift) {
    return c.json({ ok: false, error: 'Gift not found' }, 404)
  }

  const auction = await Auctions.findById(gift.auction_id).lean()

  return c.json({
    ok: true,
    gift: {
      id: String(gift._id),
      auction_id: String(gift.auction_id),
      auction_name: auction?.auction_name || 'Unknown',
      auction_photo: auction?.auction_photo || '',
      gift_number: gift.gift_number,
      gift_name: `${auction?.auction_name || 'Gift'} #${gift.gift_number}`,
      owner_id: gift.owner_id,
      claimed_at: gift.claimed_at?.toISOString() || null,
    },
  })
})

export { gifts }
