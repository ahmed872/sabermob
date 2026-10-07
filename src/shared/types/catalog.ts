import type { ProductType } from '../constants/enums'

export interface BrandDto {
  id: string
  name: string
  modelCount: number
}

export interface DeviceModelDto {
  id: string
  brandId: string
  brandName: string
  name: string
  aliases: string | null
}

export interface CategoryDto {
  id: string
  name: string
  kind: string
  parentId: string | null
  color: string | null
  icon: string | null
  sortOrder: number
  productCount: number
}

/** One sellable row (variant) — used by inventory lists and POS. */
export interface VariantListItem {
  variantId: string
  productId: string
  type: ProductType
  name: string
  productName: string
  variantName: string | null
  sku: string | null
  barcode: string | null
  sellPrice: number
  minPrice: number | null
  wholesalePrice: number | null
  /** null when the viewer lacks view_cost */
  costPrice: number | null
  stockQty: number
  minStock: number
  maxStock: number | null
  trackStock: boolean
  trackSerials: boolean
  taxBp: number | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  brandName: string | null
  modelName: string | null
  isFavorite: boolean
  isActive: boolean
  warrantyDays: number | null
  lastSoldAt: string | null
  /** app://media/... photo, null when none */
  imageUrl: string | null
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface VariantDto {
  id: string
  name: string | null
  isDefault: boolean
  sku: string | null
  color: string | null
  material: string | null
  size: string | null
  storage: string | null
  ram: string | null
  costPrice: number | null
  sellPrice: number
  minPrice: number | null
  wholesalePrice: number | null
  stockQty: number
  minStock: number
  maxStock: number | null
  barcodes: string[]
  serialsInStock: number
}

export interface ProductDto {
  id: string
  type: ProductType
  name: string
  altName: string | null
  categoryId: string | null
  brandId: string | null
  deviceModelId: string | null
  supplierId: string | null
  taxBp: number | null
  trackStock: boolean
  trackSerials: boolean
  warrantyDays: number | null
  isFavorite: boolean
  isActive: boolean
  notes: string | null
  imagePath: string | null
  imageUrl: string | null
  createdAt: string
  updatedAt: string
  variants: VariantDto[]
}

export interface StockMovementDto {
  id: string
  variantId: string
  productName: string
  type: string
  qty: number
  unitCost: number | null
  balanceAfter: number
  refType: string | null
  refId: string | null
  reason: string | null
  userName: string | null
  createdAt: string
}

export interface StockAlerts {
  low: number
  out: number
  over: number
  dead: number
}

export interface InventoryValuation {
  totalUnits: number
  costValue: number
  retailValue: number
  skuCount: number
}

export interface SerialDto {
  id: string
  serial: string
  status: string
  costPrice: number | null
}
