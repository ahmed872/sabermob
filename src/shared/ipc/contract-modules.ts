/** Contract for suppliers, purchases and repairs (and later modules). */
import type { Paged } from '../types/catalog'
import type { SupplierDto, SupplierLedgerDto, SupplierListItem, SupplierPaymentDto, PurchaseDto, PurchaseListItem } from '../types/suppliers'
import type { RepairDto, RepairListItem, RepairStatusDto, WarrantyMatch } from '../types/repairs'
import type {
  PurchaseQueryInput,
  PurchaseReceiveInput,
  PurchaseReturnInput,
  PurchaseSaveInput,
  SupplierPaymentInput,
  SupplierQueryInput,
  SupplierSaveInput
} from '../schemas/suppliers'
import type { RepairCreateInput, RepairPartInput, RepairQueryInput, RepairStatusInput, RepairStatusSaveInput, RepairUpdateInput } from '../schemas/repairs'
import type { LaterContract } from './contract-later'

type Empty = Record<string, never> | undefined

export interface SupplierContract {
  'suppliers.list': { in: SupplierQueryInput; out: Paged<SupplierListItem> }
  'suppliers.get': { in: { id: string }; out: SupplierDto }
  'suppliers.save': { in: SupplierSaveInput; out: SupplierDto }
  'suppliers.delete': { in: { id: string }; out: { ok: true } }
  'suppliers.ledger': { in: { id: string }; out: SupplierLedgerDto[] }
  'suppliers.payments': { in: { id: string }; out: SupplierPaymentDto[] }
  'suppliers.pay': { in: SupplierPaymentInput; out: SupplierPaymentDto }
  'suppliers.voidPayment': { in: { id: string; reason: string }; out: { ok: true } }
  'purchases.list': { in: PurchaseQueryInput; out: Paged<PurchaseListItem> }
  'purchases.get': { in: { id: string }; out: PurchaseDto }
  'purchases.create': { in: PurchaseSaveInput; out: PurchaseDto }
  'purchases.receive': { in: PurchaseReceiveInput; out: PurchaseDto }
  'purchases.cancel': { in: { id: string }; out: PurchaseDto }
  'purchases.return': { in: PurchaseReturnInput; out: { id: string; number: string; total: number } }
}

export interface RepairContract {
  'repairs.statuses': { in: Empty; out: RepairStatusDto[] }
  'repairs.saveStatus': { in: RepairStatusSaveInput; out: RepairStatusDto }
  'repairs.list': { in: RepairQueryInput; out: Paged<RepairListItem> }
  'repairs.get': { in: { id: string }; out: RepairDto }
  'repairs.create': { in: RepairCreateInput; out: RepairDto }
  'repairs.update': { in: RepairUpdateInput; out: RepairDto }
  'repairs.setStatus': { in: RepairStatusInput; out: RepairDto }
  'repairs.addPart': { in: RepairPartInput; out: RepairDto }
  'repairs.removePart': { in: { id: string; restock: boolean }; out: RepairDto }
  'repairs.addPayment': { in: { repairId: string; amount: number; method: string }; out: RepairDto }
  'repairs.addPhoto': { in: { repairId: string; kind: string; dataUrl: string; note?: string | null }; out: RepairDto }
  'repairs.removePhoto': { in: { id: string }; out: RepairDto }
  'repairs.delete': { in: { id: string }; out: { ok: true } }
  'repairs.passcode': { in: { id: string }; out: { passcode: string | null } }
  'repairs.checkWarranty': { in: { imei?: string | null; phone?: string | null; model?: string | null }; out: WarrantyMatch[] }
  'repairs.technicians': { in: Empty; out: Array<{ id: string; fullName: string }> }
}

export interface ModuleContract extends SupplierContract, RepairContract, LaterContract {}
