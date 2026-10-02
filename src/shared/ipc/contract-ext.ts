/**
 * Contract for modules beyond the core: POS, shifts, customers, suppliers,
 * repairs, offers, reports, backup, printing.
 */
import type { CompleteSaleInput, HoldCartInput, RefundInput, SaleQueryInput, ShiftQueryInput, VoidSaleInput } from '../schemas/sales'
import type { CollectDebtInput, CustomerQueryInput, CustomerSaveInput } from '../schemas/customers'
import type { HeldCartDto, SaleDto, SaleListItem, ShiftSummary } from '../types/sales'
import type { CustomerDto, CustomerListItem, LedgerEntryDto } from '../types/customers'
import type { Paged } from '../types/catalog'
import type { ModuleContract } from './contract-modules'

type Empty = Record<string, never> | undefined

export interface PosContract {
  'pos.complete': { in: CompleteSaleInput; out: SaleDto }
  'pos.refund': { in: RefundInput; out: SaleDto }
  'pos.void': { in: VoidSaleInput; out: SaleDto }
  'pos.sale': { in: { id: string }; out: SaleDto }
  'pos.findSale': { in: { number: string }; out: SaleDto | null }
  'pos.sales': { in: SaleQueryInput; out: Paged<SaleListItem> }
  'pos.hold': { in: HoldCartInput; out: HeldCartDto }
  'pos.held': { in: Empty; out: HeldCartDto[] }
  'pos.takeHeld': { in: { id: string }; out: HeldCartDto }
  'pos.deleteHeld': { in: { id: string }; out: { ok: true } }
  'shifts.current': { in: Empty; out: ShiftSummary | null }
  'shifts.open': { in: { openingCash: number }; out: ShiftSummary }
  'shifts.close': { in: { countedCash: number; note?: string | null }; out: ShiftSummary }
  'shifts.cash': { in: { type: 'PAY_IN' | 'PAY_OUT'; amount: number; reason: string }; out: ShiftSummary }
  'shifts.list': { in: ShiftQueryInput; out: Paged<ShiftSummary> }
  'shifts.get': { in: { id: string }; out: ShiftSummary }
  'shifts.review': { in: { id: string }; out: ShiftSummary }
  'customers.list': { in: CustomerQueryInput; out: Paged<CustomerListItem> }
  'customers.find': { in: { q: string }; out: CustomerListItem[] }
  'customers.get': { in: { id: string }; out: CustomerDto }
  'customers.save': { in: CustomerSaveInput; out: CustomerDto }
  'customers.delete': { in: { id: string }; out: { ok: true } }
  'customers.ledger': { in: { id: string }; out: LedgerEntryDto[] }
  'customers.collect': { in: CollectDebtInput; out: { balance: number } }
  'customers.adjust': { in: { customerId: string; amount: number; note: string }; out: { balance: number } }
  'customers.adjustPoints': { in: { customerId: string; points: number; note: string }; out: { points: number } }
}

export interface ExtendedContract extends PosContract, ModuleContract {}
