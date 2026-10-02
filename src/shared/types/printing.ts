import type { PaperSize } from '../constants/enums'
import type { SaleDto, ShiftSummary } from './sales'
import type { RepairDto } from './repairs'

export interface QrResolution {
  kind: 'sale' | 'repair' | 'product' | 'customer'
  id: string
  variantId?: string
  label: string
}

/** Store header shared by all printed documents. */
export interface PrintStore {
  name: string
  phone: string
  phone2: string
  address: string
  taxNumber: string
  commercialRegister: string
  logo: string | null
  currency: string
  currencyDecimals: number
  footer: string
  showCashier: boolean
  showTaxNumber: boolean
  taxLabel: string
  language: 'ar' | 'en'
}

export type PrintDocument =
  | { type: 'receipt'; paper: PaperSize; store: PrintStore; sale: SaleDto; qr: string | null; reprint: boolean }
  | { type: 'invoice'; paper: PaperSize; store: PrintStore; sale: SaleDto; qr: string | null; reprint: boolean }
  | { type: 'repairTicket'; paper: PaperSize; store: PrintStore; repair: RepairDto; qr: string | null; terms: string }
  | { type: 'shiftReport'; paper: PaperSize; store: PrintStore; shift: ShiftSummary }
  | {
      type: 'labels'
      paper: 'label'
      store: PrintStore
      widthMm: number
      heightMm: number
      labels: Array<{ name: string; price: number; barcode: string | null; qr: string | null }>
    }
  | { type: 'test'; paper: PaperSize; store: PrintStore }

export type PrintRequest =
  | { type: 'receipt' | 'invoice'; saleId: string; reprint?: boolean; paper?: PaperSize }
  | { type: 'repairTicket'; repairId: string }
  | { type: 'shiftReport'; shiftId: string }
  | { type: 'labels'; items: Array<{ variantId: string; qty: number }> }
  | { type: 'test'; paper?: PaperSize }
