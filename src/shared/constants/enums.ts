export const PRODUCT_TYPES = ['ACCESSORY', 'DEVICE', 'USED_DEVICE', 'SERVICE', 'PART', 'CUSTOM'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export const CATEGORY_KINDS = ['ACCESSORY', 'DEVICE', 'SERVICE', 'PART', 'OTHER'] as const

export const PAYMENT_METHODS = ['CASH', 'CARD', 'WALLET', 'TRANSFER'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const CUSTOMER_TYPES = ['REGULAR', 'VIP', 'WHOLESALE'] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]

export const STOCK_MOVEMENT_TYPES = [
  'OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT',
  'DAMAGED', 'LOST', 'REPAIR_USE', 'REPAIR_RETURN', 'CORRECTION'
] as const
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]

export const ADJUSTMENT_TYPES = ['COUNT', 'DAMAGED', 'LOST', 'CORRECTION', 'OPENING'] as const
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number]

export const SALE_STATUSES = ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

export const PURCHASE_STATUSES = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number]

export const REPAIR_SYSTEM_STATUSES = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_CUSTOMER', 'WAITING_PARTS', 'REPAIRING', 'TESTING', 'READY', 'DELIVERED', 'CANCELLED'
] as const

export const REPAIR_ACCESSORIES = ['CHARGER', 'SIM', 'MEMORY_CARD', 'CASE', 'BOX', 'CABLE', 'EARPHONES', 'STYLUS'] as const

export const REPAIR_PHOTO_KINDS = ['BEFORE', 'AFTER', 'DAMAGE'] as const

export const OFFER_TYPES = [
  'PERCENT', 'FIXED', 'BUNDLE', 'BUY_X_GET_Y', 'QTY_DISCOUNT', 'CART_THRESHOLD', 'CLEARANCE', 'CROSS_SELL'
] as const
export type OfferType = (typeof OFFER_TYPES)[number]

export const LICENSE_TIERS = ['TRIAL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'] as const
export type LicenseTier = (typeof LICENSE_TIERS)[number]

export const PAPER_SIZES = ['58mm', '80mm', 'A4'] as const
export type PaperSize = (typeof PAPER_SIZES)[number]
