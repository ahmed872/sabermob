export interface DashboardData {
  today: { sales: number; count: number; profit: number | null; avgTicket: number }
  yesterdaySales: number
  pendingRepairs: number
  overdueRepairs: number
  readyRepairs: number
  lowStock: number
  outOfStock: number
  deadStock: number
  supplierDebt: number | null
  customerDebt: number | null
  trend: Array<{ day: string; sales: number; profit: number | null }>
  topProducts: Array<{ name: string; qty: number; revenue: number }>
  pendingRepairList: Array<{ id: string; number: string; deviceModel: string; customerName: string; statusKey: string; technicianName: string | null; overdue: boolean; receivedAt: string }>
  technicians: Array<{ name: string; open: number }>
  topOffers: Array<{ name: string; profit: number; accepted: number }>
  unreviewedShiftDiffs: number
}

export type ReportRange = { from: string; to: string }
export type ReportGroup = 'day' | 'week' | 'month' | 'year'

export interface SalesReport {
  totals: { count: number; revenue: number; tax: number; discount: number; refunds: number; cost: number | null; profit: number | null; avgTicket: number }
  series: Array<{ period: string; count: number; revenue: number; profit: number | null }>
  byMethod: Array<{ method: string; amount: number }>
  byCategory: Array<{ name: string; qty: number; revenue: number; profit: number | null }>
  topProducts: Array<{ name: string; qty: number; revenue: number; profit: number | null }>
}

export interface ProfitReport {
  productProfit: number
  serviceProfit: number
  repairProfit: number
  repairRevenue: number
  grossProfit: number
  expenses: number
  discounts: number
  estimatedNet: number
  series: Array<{ period: string; profit: number }>
}

export interface InventoryReport {
  valuation: { units: number; cost: number; retail: number; items: number }
  low: Array<{ name: string; stock: number; minStock: number }>
  dead: Array<{ name: string; stock: number; value: number; lastSoldAt: string | null }>
  fast: Array<{ name: string; qty: number; stock: number }>
  slow: Array<{ name: string; qty: number; stock: number }>
}

export interface RepairReport {
  byStatus: Array<{ statusId: string; name: string; nameAr: string; color: string; count: number }>
  received: number
  delivered: number
  cancelled: number
  delayed: number
  revenue: number
  profit: number | null
  avgDays: number
  technicians: Array<{ name: string; delivered: number; open: number; revenue: number; avgDays: number }>
}

export interface SupplierReport {
  balances: Array<{ id: string; name: string; balance: number }>
  totalOwed: number
  totalOwedToUs: number
  purchases: number
  payments: number
}

export interface EmployeeReport {
  rows: Array<{ userId: string; name: string; sales: number; revenue: number; discounts: number; refunds: number; voids: number; actions: number }>
}

export interface GlobalSearchResult {
  products: Array<{ id: string; variantId: string; name: string; price: number; stock: number | null }>
  customers: Array<{ id: string; name: string; phone: string | null; balance: number }>
  repairs: Array<{ id: string; number: string; deviceModel: string; customerName: string; statusKey: string }>
  sales: Array<{ id: string; number: string; total: number; createdAt: string; customerName: string | null }>
  suppliers: Array<{ id: string; name: string; phone: string | null }>
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'
export interface ExportTable {
  title: string
  subtitle?: string
  columns: Array<{ key: string; header: string; type?: 'money' | 'number' | 'text' | 'date' }>
  rows: Array<Record<string, string | number | null>>
}
