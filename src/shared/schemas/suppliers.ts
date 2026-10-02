import { z } from 'zod'
import { id, money, optLongText, optText, paging, paymentMethod } from './common'

export const supplierSaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  companyName: optText,
  phone: optText,
  phone2: optText,
  address: optText,
  notes: optLongText,
  /** positive = we already owe the supplier; negative = supplier owes us */
  openingBalance: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional()
})
export type SupplierSaveInput = z.input<typeof supplierSaveSchema>

export const supplierQuerySchema = paging.extend({ q: z.string().max(60).optional(), withBalance: z.boolean().optional() })
export type SupplierQueryInput = z.input<typeof supplierQuerySchema>

export const supplierPaymentSchema = z.object({
  supplierId: id,
  amount: money.min(1),
  method: paymentMethod,
  /** OUT = we pay the supplier; IN = supplier pays/refunds us */
  direction: z.enum(['OUT', 'IN']).default('OUT'),
  purchaseOrderId: id.nullish(),
  reference: optText,
  note: optText
})
export type SupplierPaymentInput = z.input<typeof supplierPaymentSchema>

const purchaseLine = z.object({ variantId: id, qty: z.number().int().min(1).max(100_000), unitCost: money })

export const purchaseSaveSchema = z.object({
  id: id.optional(),
  supplierId: id,
  supplierInvoiceNo: optText,
  notes: optLongText,
  items: z.array(purchaseLine).min(1).max(500),
  /** save as ORDERED (waiting for goods) or receive everything now */
  receiveNow: z.boolean().default(true),
  /** IMEIs per variant when receiving phones now */
  serials: z.record(z.string(), z.array(z.string().trim().min(4).max(40)).max(1000)).optional(),
  payment: z.object({ amount: money, method: paymentMethod }).nullish()
})
export type PurchaseSaveInput = z.input<typeof purchaseSaveSchema>

export const purchaseReceiveSchema = z.object({
  purchaseOrderId: id,
  note: optText,
  items: z
    .array(
      z.object({
        purchaseItemId: id,
        qtyReceived: z.number().int().min(0).max(100_000),
        qtyDamaged: z.number().int().min(0).max(100_000).default(0),
        unitCost: money.optional(),
        serials: z.array(z.string().trim().min(4).max(40)).max(1000).optional()
      })
    )
    .min(1)
    .max(500)
})
export type PurchaseReceiveInput = z.input<typeof purchaseReceiveSchema>

export const purchaseReturnSchema = z.object({
  supplierId: id,
  purchaseOrderId: id.nullish(),
  note: optText,
  items: z.array(z.object({ variantId: id, qty: z.number().int().min(1).max(100_000), unitCost: money, serials: z.array(z.string()).optional() })).min(1).max(500)
})
export type PurchaseReturnInput = z.input<typeof purchaseReturnSchema>

export const purchaseQuerySchema = paging.extend({
  supplierId: id.optional(),
  status: z.enum(['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED']).optional(),
  q: z.string().max(60).optional()
})
export type PurchaseQueryInput = z.input<typeof purchaseQuerySchema>
