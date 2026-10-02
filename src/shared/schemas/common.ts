import { z } from 'zod'

export const id = z.string().min(1).max(64)
export const money = z.number().int().min(0).max(1_000_000_000_00)
export const signedMoney = z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00)
export const qty = z.number().int().min(1).max(100_000)
export const bp = z.number().int().min(0).max(10_000)
export const shortText = z.string().trim().max(200)
export const longText = z.string().trim().max(4000)
export const optText = z.string().trim().max(200).nullish().transform((v) => (v ? v : null))
export const optLongText = z.string().trim().max(4000).nullish().transform((v) => (v ? v : null))
export const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
export const paymentMethod = z.enum(['CASH', 'CARD', 'WALLET', 'TRANSFER'])
export const empty = z.object({}).strict().optional().default({})
export const byId = z.object({ id })
export const paging = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(1).max(200).default(50)
})
export const dateRange = z.object({ from: isoDate, to: isoDate })
export const discount = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('PERCENT'), bp }),
    z.object({ type: z.literal('AMOUNT'), amount: money })
  ])
  .nullish()
