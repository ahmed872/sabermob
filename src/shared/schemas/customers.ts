import { z } from 'zod'
import { CUSTOMER_TYPES } from '../constants/enums'
import { id, money, optLongText, optText, paging, paymentMethod } from './common'

export const customerSaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  phone: optText,
  phone2: optText,
  address: optText,
  notes: optLongText,
  type: z.enum(CUSTOMER_TYPES).default('REGULAR'),
  creditLimit: money.nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  openingBalance: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional()
})
export type CustomerSaveInput = z.input<typeof customerSaveSchema>

export const customerQuerySchema = paging.extend({
  q: z.string().max(60).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
  withBalance: z.boolean().optional(),
  sort: z.enum(['name', 'balance', 'recent']).default('recent')
})
export type CustomerQueryInput = z.input<typeof customerQuerySchema>

export const collectDebtSchema = z.object({ customerId: id, amount: money.min(1), method: paymentMethod, note: optText })
export type CollectDebtInput = z.input<typeof collectDebtSchema>

export const customerAdjustSchema = z.object({ customerId: id, amount: z.number().int().min(-1_000_000_000).max(1_000_000_000), note: z.string().trim().min(2).max(200) })
export const loyaltyAdjustSchema = z.object({ customerId: id, points: z.number().int().min(-10_000_000).max(10_000_000), note: z.string().trim().min(2).max(200) })
