import { z } from 'zod'
import { dateRange, discount, id, money, optText, paymentMethod, qty } from './common'

export const saleLineSchema = z.object({
  /** null/undefined = custom item typed by the cashier */
  variantId: id.nullish(),
  name: z.string().trim().max(160).optional(),
  qty,
  unitPrice: money,
  discount,
  serial: z.string().trim().max(40).nullish(),
  offerId: id.nullish()
})
export type SaleLineInput = z.input<typeof saleLineSchema>

export const completeSaleSchema = z.object({
  idempotencyKey: z.string().uuid(),
  kind: z.enum(['QUICK', 'INVOICE']).default('QUICK'),
  customerId: id.nullish(),
  lines: z.array(saleLineSchema).min(1).max(300),
  cartDiscount: discount,
  payments: z.array(z.object({ method: paymentMethod, amount: money, reference: optText })).max(6),
  redeemPoints: z.number().int().min(0).max(100_000_000).default(0),
  note: optText,
  overrideToken: z.string().max(100).nullish(),
  /** offers the cashier accepted/dismissed (analytics) */
  offerEvents: z
    .array(z.object({ offerId: id.nullish(), source: z.enum(['OFFER', 'AFFINITY', 'CLEARANCE', 'THRESHOLD']), event: z.enum(['SHOWN', 'ACCEPTED', 'DISMISSED']), productId: id.nullish() }))
    .max(100)
    .default([])
})
export type CompleteSaleInput = z.input<typeof completeSaleSchema>

export const refundSchema = z.object({
  saleId: id,
  items: z.array(z.object({ saleItemId: id, qty, restock: z.boolean().default(true) })).min(1).max(300),
  method: z.enum(['CASH', 'CARD', 'WALLET', 'TRANSFER', 'CREDIT']),
  reason: optText,
  overrideToken: z.string().max(100).nullish()
})
export type RefundInput = z.input<typeof refundSchema>

export const voidSaleSchema = z.object({ saleId: id, reason: z.string().trim().min(2).max(200), overrideToken: z.string().max(100).nullish() })
export type VoidSaleInput = z.input<typeof voidSaleSchema>

export const saleQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  q: z.string().max(60).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  userId: id.optional(),
  customerId: id.optional(),
  shiftId: id.optional(),
  status: z.enum(['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED']).optional(),
  kind: z.enum(['QUICK', 'INVOICE']).optional()
})
export type SaleQueryInput = z.input<typeof saleQuerySchema>

export const holdCartSchema = z.object({
  id: id.optional(),
  label: z.string().trim().max(60),
  customerId: id.nullish(),
  total: money,
  payload: z.string().max(200_000)
})
export type HoldCartInput = z.input<typeof holdCartSchema>

export const openShiftSchema = z.object({ openingCash: money })
export const closeShiftSchema = z.object({ countedCash: money, note: optText })
export const cashMovementSchema = z.object({ type: z.enum(['PAY_IN', 'PAY_OUT']), amount: money.min(1), reason: z.string().trim().min(2).max(200) })
export const shiftQuerySchema = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(30), ...dateRange.partial().shape })
export type ShiftQueryInput = z.input<typeof shiftQuerySchema>
