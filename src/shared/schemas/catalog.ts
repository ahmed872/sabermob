import { z } from 'zod'
import { CATEGORY_KINDS, PRODUCT_TYPES } from '../constants/enums'
import { bp, id, money, optLongText, optText, paging } from './common'

export const brandSaveSchema = z.object({ id: id.optional(), name: z.string().trim().min(1).max(80) })
export type BrandSaveInput = z.input<typeof brandSaveSchema>

export const deviceModelSaveSchema = z.object({
  id: id.optional(),
  brandId: id,
  name: z.string().trim().min(1).max(80),
  aliases: optText
})
export type DeviceModelSaveInput = z.input<typeof deviceModelSaveSchema>

export const categorySaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(CATEGORY_KINDS).default('ACCESSORY'),
  parentId: id.nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  icon: z.string().max(40).nullish(),
  sortOrder: z.number().int().default(0)
})
export type CategorySaveInput = z.input<typeof categorySaveSchema>

const barcode = z.string().trim().min(3).max(64).regex(/^[\x21-\x7E]+$/, 'barcode')

export const variantInputSchema = z.object({
  id: id.optional(),
  name: optText,
  sku: z.string().trim().max(64).nullish().transform((v) => (v ? v : null)),
  color: optText,
  material: optText,
  size: optText,
  storage: optText,
  ram: optText,
  costPrice: money.default(0),
  sellPrice: money,
  minPrice: money.nullish(),
  wholesalePrice: money.nullish(),
  minStock: z.number().int().min(0).max(100000).nullish(),
  maxStock: z.number().int().min(0).max(1000000).nullish(),
  barcodes: z.array(barcode).max(10).default([]),
  /** opening quantity for new variants only */
  openingStock: z.number().int().min(0).max(1000000).default(0),
  /** IMEI/serials for tracked devices (opening stock) */
  serials: z.array(z.string().trim().min(4).max(40)).max(1000).optional(),
  remove: z.boolean().optional()
})
export type VariantInput = z.input<typeof variantInputSchema>

export const productSaveSchema = z.object({
  id: id.optional(),
  type: z.enum(PRODUCT_TYPES),
  name: z.string().trim().min(1).max(160),
  altName: optText,
  categoryId: id.nullish(),
  brandId: id.nullish(),
  deviceModelId: id.nullish(),
  supplierId: id.nullish(),
  taxBp: bp.nullish(),
  trackStock: z.boolean().default(true),
  trackSerials: z.boolean().default(false),
  warrantyDays: z.number().int().min(0).max(3650).nullish(),
  isFavorite: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: optLongText,
  imagePath: z.string().max(300).nullish(),
  variants: z.array(variantInputSchema).min(1).max(200)
})
export type ProductSaveInput = z.input<typeof productSaveSchema>

export const productQuerySchema = paging.extend({
  q: z.string().max(100).optional(),
  categoryId: id.optional(),
  brandId: id.optional(),
  deviceModelId: id.optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  stock: z.enum(['all', 'low', 'out', 'over', 'dead']).default('all'),
  favorites: z.boolean().optional(),
  includeInactive: z.boolean().default(false),
  sort: z.enum(['name', 'stock', 'price', 'recent']).default('name')
})
export type ProductQueryInput = z.input<typeof productQuerySchema>

export const posSearchSchema = z.object({
  q: z.string().max(100).default(''),
  categoryId: id.optional(),
  mode: z.enum(['search', 'favorites', 'recent', 'category']).default('search'),
  limit: z.number().int().min(1).max(100).default(40)
})
export type PosSearchInput = z.input<typeof posSearchSchema>

export const stockAdjustSchema = z.object({
  type: z.enum(['COUNT', 'DAMAGED', 'LOST', 'CORRECTION', 'OPENING']),
  note: optText,
  items: z
    .array(
      z.object({
        variantId: id,
        /** COUNT: the counted quantity. Others: quantity removed (DAMAGED/LOST) or signed delta (CORRECTION/OPENING) */
        qty: z.number().int().min(-1000000).max(1000000)
      })
    )
    .min(1)
    .max(500)
})
export type StockAdjustInput = z.input<typeof stockAdjustSchema>

export const movementQuerySchema = paging.extend({ variantId: id.optional(), type: z.string().max(30).optional() })
export type MovementQueryInput = z.input<typeof movementQuerySchema>
