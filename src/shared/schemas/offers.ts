import { z } from 'zod'
import { CUSTOMER_TYPES, OFFER_TYPES } from '../constants/enums'
import { bp, id, money, optText } from './common'

export const offerSaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  description: optText,
  type: z.enum(OFFER_TYPES),
  isActive: z.boolean().default(true),
  autoApply: z.boolean().default(false),
  priority: z.number().int().min(0).max(10).default(0),
  discountBp: bp.nullish(),
  discountAmount: money.nullish(),
  bundlePrice: money.nullish(),
  buyQty: z.number().int().min(1).max(100).nullish(),
  getQty: z.number().int().min(1).max(100).nullish(),
  minQty: z.number().int().min(1).max(1000).nullish(),
  minCartTotal: money.nullish(),
  customerType: z.enum(CUSTOMER_TYPES).nullish(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
  hourFrom: z.number().int().min(0).max(23).nullish(),
  hourTo: z.number().int().min(0).max(24).nullish(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  maxUses: z.number().int().min(1).nullish(),
  triggers: z.object({ productIds: z.array(id).max(200).default([]), categoryIds: z.array(id).max(50).default([]) }).default({ productIds: [], categoryIds: [] }),
  targets: z.object({ productIds: z.array(id).max(200).default([]), categoryIds: z.array(id).max(50).default([]) }).default({ productIds: [], categoryIds: [] })
})
export type OfferSaveInput = z.input<typeof offerSaveSchema>

export const suggestSchema = z.object({
  customerId: id.nullish(),
  lines: z.array(z.object({ variantId: id, qty: z.number().int().min(1).max(100000), unitPrice: money })).max(300),
  dismissed: z.array(z.string().max(200)).max(200).default([])
})
export type SuggestInput = z.input<typeof suggestSchema>
