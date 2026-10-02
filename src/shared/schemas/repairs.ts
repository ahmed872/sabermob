import { z } from 'zod'
import { REPAIR_ACCESSORIES, REPAIR_PHOTO_KINDS } from '../constants/enums'
import { id, money, optLongText, optText, paymentMethod } from './common'

const imageDataUrl = z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'image')

export const repairCreateSchema = z.object({
  customerId: id.nullish(),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(3).max(30),
  deviceBrand: optText,
  deviceModel: z.string().trim().min(1).max(120),
  imei: z.string().trim().max(40).nullish().transform((v) => v || null),
  serialNumber: optText,
  deviceColor: optText,
  deviceCondition: optLongText,
  passcode: z.string().max(60).nullish(),
  complaint: z.string().trim().min(1).max(2000),
  accessories: z.array(z.enum(REPAIR_ACCESSORIES)).max(20).default([]),
  serviceVariantId: id.nullish(),
  technicianId: id.nullish(),
  estimatedPrice: money.default(0),
  expectedAt: z.string().nullish(),
  warrantyDays: z.number().int().min(0).max(3650).nullish(),
  parentRepairId: id.nullish(),
  deposit: z.object({ amount: money.min(1), method: paymentMethod }).nullish(),
  signature: imageDataUrl.nullish(),
  photos: z.array(z.object({ kind: z.enum(REPAIR_PHOTO_KINDS), dataUrl: imageDataUrl })).max(12).default([])
})
export type RepairCreateInput = z.input<typeof repairCreateSchema>

export const repairUpdateSchema = z.object({
  id,
  deviceBrand: optText.optional(),
  deviceModel: z.string().trim().min(1).max(120).optional(),
  imei: z.string().trim().max(40).nullish(),
  serialNumber: optText.optional(),
  deviceColor: optText.optional(),
  deviceCondition: optLongText.optional(),
  passcode: z.string().max(60).nullish(),
  complaint: z.string().trim().min(1).max(2000).optional(),
  diagnosis: optLongText.optional(),
  notes: optLongText.optional(),
  technicianId: id.nullish(),
  estimatedPrice: money.optional(),
  laborPrice: money.optional(),
  finalPrice: money.nullish(),
  expectedAt: z.string().nullish(),
  warrantyDays: z.number().int().min(0).max(3650).optional()
})
export type RepairUpdateInput = z.input<typeof repairUpdateSchema>

export const repairStatusSchema = z.object({
  id,
  statusId: id,
  note: optText,
  /** delivery only */
  payments: z.array(z.object({ method: paymentMethod, amount: money })).max(4).default([]),
  signature: imageDataUrl.nullish(),
  /** cancel only: give the deposit back */
  refundDeposit: z.boolean().default(false)
})
export type RepairStatusInput = z.input<typeof repairStatusSchema>

export const repairPartSchema = z.object({
  repairId: id,
  variantId: id.nullish(),
  name: z.string().trim().max(160).optional(),
  qty: z.number().int().min(1).max(100),
  unitPrice: money.optional(),
  unitCost: money.optional()
})
export type RepairPartInput = z.input<typeof repairPartSchema>

export const repairPaymentSchema = z.object({ repairId: id, amount: money.min(1), method: paymentMethod })
export const repairPhotoSchema = z.object({ repairId: id, kind: z.enum(REPAIR_PHOTO_KINDS), dataUrl: imageDataUrl, note: optText })

export const repairQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
  q: z.string().max(60).optional(),
  statusId: id.optional(),
  technicianId: id.optional(),
  open: z.boolean().optional(),
  overdue: z.boolean().optional()
})
export type RepairQueryInput = z.input<typeof repairQuerySchema>

export const repairStatusSaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
})
export type RepairStatusSaveInput = z.input<typeof repairStatusSaveSchema>
