export interface SupplierListItem {
  id: string
  name: string
  companyName: string | null
  phone: string | null
  /** > 0: we owe the supplier. < 0: the supplier owes us. */
  balance: number
  totalPurchases: number
  lastPurchaseAt: string | null
}

export interface SupplierDto extends SupplierListItem {
  phone2: string | null
  address: string | null
  notes: string | null
  createdAt: string
  totalPaid: number
}

export interface SupplierLedgerDto {
  id: string
  type: string
  amount: number
  balanceAfter: number
  refType: string | null
  refId: string | null
  note: string | null
  userName: string | null
  createdAt: string
}

export interface PurchaseItemDto {
  id: string
  variantId: string
  name: string
  trackSerials: boolean
  qtyOrdered: number
  qtyReceived: number
  qtyDamaged: number
  qtyReturned: number
  unitCost: number
}

export interface PurchaseDto {
  id: string
  number: string
  supplierId: string
  supplierName: string
  status: string
  supplierInvoiceNo: string | null
  total: number
  orderedValue: number
  paid: number
  notes: string | null
  userName: string
  orderedAt: string
  receivedAt: string | null
  items: PurchaseItemDto[]
  receipts: Array<{ id: string; createdAt: string; userName: string | null; note: string | null; lines: number }>
}

export interface PurchaseListItem {
  id: string
  number: string
  supplierName: string
  status: string
  supplierInvoiceNo: string | null
  total: number
  orderedValue: number
  paid: number
  orderedAt: string
  itemCount: number
}

export interface SupplierPaymentDto {
  id: string
  amount: number
  direction: string
  method: string
  reference: string | null
  note: string | null
  purchaseNumber: string | null
  userName: string | null
  createdAt: string
  voidedAt: string | null
}
