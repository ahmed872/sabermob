export interface SaleItemDto {
  id: string
  variantId: string | null
  productType: string
  name: string
  sku: string | null
  serial: string | null
  qty: number
  unitPrice: number
  unitCost: number | null
  discount: number
  taxBp: number
  tax: number
  total: number
  refundedQty: number
  warrantyDays: number | null
}

export interface PaymentDto {
  id: string
  method: string
  amount: number
  kind: string
  reference: string | null
  createdAt: string
}

export interface RefundDto {
  id: string
  number: string
  total: number
  method: string
  reason: string | null
  userName: string | null
  createdAt: string
  items: Array<{ saleItemId: string; qty: number; amount: number; restock: boolean }>
}

export interface SaleDto {
  id: string
  number: string
  invoiceNumber: string | null
  kind: 'QUICK' | 'INVOICE'
  status: string
  customer: { id: string; name: string; phone: string | null; balance: number } | null
  cashierName: string
  approvedByName: string | null
  pricesIncludeTax: boolean
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paidTotal: number
  changeDue: number
  creditAmount: number
  refundedTotal: number
  /** null without view_profit */
  profit: number | null
  currency: string
  note: string | null
  qrEnabled: boolean
  createdAt: string
  voidReason: string | null
  loyaltyEarned: number
  items: SaleItemDto[]
  payments: PaymentDto[]
  refunds: RefundDto[]
}

export interface SaleListItem {
  id: string
  number: string
  invoiceNumber: string | null
  kind: string
  status: string
  customerName: string | null
  cashierName: string
  itemCount: number
  total: number
  paidTotal: number
  creditAmount: number
  refundedTotal: number
  profit: number | null
  createdAt: string
}

export interface HeldCartDto {
  id: string
  label: string
  customerId: string | null
  total: number
  payload: string
  userName: string | null
  createdAt: string
}

export interface ShiftSummary {
  id: string
  number: string
  status: 'OPEN' | 'CLOSED'
  openedBy: string
  openedAt: string
  closedAt: string | null
  closedBy: string | null
  openingCash: number
  salesCount: number
  salesTotal: number
  refundsTotal: number
  discountsTotal: number
  byMethod: Record<string, number>
  cashIn: number
  cashOut: number
  supplierPayments: number
  expectedCash: number
  countedCash: number | null
  difference: number | null
  note: string | null
  reviewedBy: string | null
  movements: Array<{ id: string; type: string; amount: number; reason: string; userName: string | null; createdAt: string }>
}
