export interface RepairStatusDto {
  id: string
  key: string
  name: string
  nameAr: string
  color: string
  sortOrder: number
  isFinal: boolean
  isSystem: boolean
  isActive: boolean
  count?: number
}

export interface RepairListItem {
  id: string
  number: string
  customerName: string
  customerPhone: string
  deviceBrand: string | null
  deviceModel: string
  imei: string | null
  complaint: string
  statusId: string
  statusKey: string
  technicianName: string | null
  estimatedPrice: number
  finalPrice: number | null
  paidTotal: number
  receivedAt: string
  expectedAt: string | null
  deliveredAt: string | null
  overdue: boolean
  isWarrantyClaim: boolean
}

export interface RepairPartDto {
  id: string
  variantId: string | null
  name: string
  qty: number
  unitCost: number | null
  unitPrice: number
  returnedAt: string | null
}

export interface RepairDto extends RepairListItem {
  customerId: string | null
  serialNumber: string | null
  deviceColor: string | null
  deviceCondition: string | null
  hasPasscode: boolean
  diagnosis: string | null
  notes: string | null
  accessories: string[]
  serviceVariantId: string | null
  technicianId: string | null
  laborPrice: number
  partsTotal: number
  /** null without view_profit */
  partsCost: number | null
  profit: number | null
  balanceDue: number
  creditAmount: number
  warrantyDays: number
  warrantyUntil: string | null
  underWarranty: boolean
  parentRepairId: string | null
  parentRepairNumber: string | null
  receiveSignature: string | null
  deliverySignature: string | null
  createdBy: string
  parts: RepairPartDto[]
  payments: Array<{ id: string; method: string; amount: number; createdAt: string; userName: string | null }>
  history: Array<{ id: string; fromStatusId: string | null; toStatusId: string; note: string | null; userName: string | null; createdAt: string }>
  photos: Array<{ id: string; kind: string; url: string; createdAt: string }>
}

export interface WarrantyMatch {
  repairId: string
  number: string
  deviceModel: string
  deliveredAt: string | null
  warrantyUntil: string
  complaint: string
}
