/** Contract for reports, search, backup and import/export. */
import type { DashboardData, EmployeeReport, ExportFormat, ExportTable, GlobalSearchResult, InventoryReport, ProfitReport, RepairReport, ReportGroup, SalesReport, SupplierReport } from '../types/reports'
import type { DataContract } from './contract-data'

type Empty = Record<string, never> | undefined
type Range = { from: string; to: string }

export interface ReportContract {
  'reports.dashboard': { in: Empty; out: DashboardData }
  'reports.sales': { in: Range & { group: ReportGroup }; out: SalesReport }
  'reports.profit': { in: Range & { group: ReportGroup }; out: ProfitReport }
  'reports.inventory': { in: Empty; out: InventoryReport }
  'reports.repairs': { in: Range; out: RepairReport }
  'reports.suppliers': { in: Range; out: SupplierReport }
  'reports.employees': { in: Range; out: EmployeeReport }
  'reports.export': { in: { table: ExportTable; format: ExportFormat }; out: { path: string | null } }
  'search.global': { in: { q: string }; out: GlobalSearchResult }
}

export interface FinalContract extends ReportContract, DataContract {}
