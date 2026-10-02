export interface CustomerListItem {
  id: string
  name: string
  phone: string | null
  type: string
  balance: number
  loyaltyPoints: number
  tags: string[]
  lastPurchaseAt: string | null
  totalSpent: number
}

export interface CustomerDto extends CustomerListItem {
  phone2: string | null
  address: string | null
  notes: string | null
  creditLimit: number | null
  createdAt: string
  salesCount: number
  repairsCount: number
}

export interface LedgerEntryDto {
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
