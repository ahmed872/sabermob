import type {
  DashboardData,
  EmployeeReport,
  GlobalSearchResult,
  InventoryReport,
  ProfitReport,
  RepairReport,
  ReportGroup,
  ReportRange,
  SalesReport,
  SupplierReport
} from '@shared/types/reports'
import { normalizePhone } from '@shared/text'
import { rawQuery, type Db } from '../database/client'
import type { Actor } from './auth-service'
import type { CatalogService } from './catalog-service'
import type { CustomerService } from './customer-service'
import type { SettingsService } from './settings-service'

const DAY = 86_400_000

/**
 * Read-only reporting over the transactional tables. Amounts follow these
 * rules: revenue = what customers pay (incl. tax) minus returns; profit =
 * revenue excluding tax minus cost of goods actually kept by customers.
 * Periods are grouped by the computer's local date.
 */
export class ReportService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly customers: CustomerService,
    private readonly now: () => Date
  ) {}

  #iso(d: string | Date): string {
    return (typeof d === 'string' ? new Date(d) : d).toISOString()
  }

  #fmt(group: ReportGroup): string {
    return group === 'year' ? '%Y' : group === 'month' ? '%Y-%m' : group === 'week' ? '%Y-W%W' : '%Y-%m-%d'
  }

  /** Net (after returns) revenue, tax, cost per sale item, grouped. */
  #itemNet = `CAST(ROUND(i.total * (i.qty - i.refundedQty) * 1.0 / i.qty) AS INTEGER)`
  #itemNetTax = `CAST(ROUND(i.tax * (i.qty - i.refundedQty) * 1.0 / i.qty) AS INTEGER)`
  #itemNetCost = `(i.unitCost * (i.qty - i.refundedQty))`

  async dashboard(actor: Actor): Promise<DashboardData> {
    const can = (p: string) => actor.permissions.has(p as never)
    const now = this.now()
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startYesterday = new Date(startToday.getTime() - DAY)
    const sales = async (from: Date, to: Date) => {
      const [r] = await rawQuery<{ n: number; total: number; profit: number }>(
        this.db,
        `SELECT COUNT(DISTINCT s.id) AS n, COALESCE(SUM(${this.#itemNet}), 0) AS total,
                COALESCE(SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}), 0) AS profit
         FROM Sale s JOIN SaleItem i ON i.saleId = s.id WHERE s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ?`,
        from.toISOString(),
        to.toISOString()
      )
      return r ?? { n: 0, total: 0, profit: 0 }
    }
    const today = await sales(startToday, new Date(startToday.getTime() + DAY))
    const yesterday = await sales(startYesterday, startToday)
    const alerts = await rawQuery<{ low: number; out: number; dead: number }>(
      this.db,
      `SELECT SUM(CASE WHEN v.stockQty > 0 AND v.stockQty <= v.minStock THEN 1 ELSE 0 END) AS low,
              SUM(CASE WHEN v.stockQty <= 0 THEN 1 ELSE 0 END) AS out,
              SUM(CASE WHEN v.stockQty > 0 AND COALESCE(v.lastSoldAt, v.createdAt) < ? THEN 1 ELSE 0 END) AS dead
       FROM ProductVariant v JOIN Product p ON p.id = v.productId
       WHERE v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.isActive = 1 AND p.trackStock = 1`,
      new Date(now.getTime() - this.settings.get('inventory').deadStockDays * DAY).toISOString()
    )
    const [rep] = await rawQuery<{ pending: number; overdue: number; ready: number }>(
      this.db,
      `SELECT SUM(CASE WHEN st.isFinal = 0 THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN st.isFinal = 0 AND r.expectedAt IS NOT NULL AND r.expectedAt < ? THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN st.key = 'READY' THEN 1 ELSE 0 END) AS ready
       FROM Repair r JOIN RepairStatus st ON st.id = r.statusId WHERE r.deletedAt IS NULL`,
      now.toISOString()
    )
    const [sup] = await rawQuery<{ debt: number }>(
      this.db,
      `SELECT COALESCE(SUM(b), 0) AS debt FROM (SELECT SUM(amount) AS b FROM SupplierLedger GROUP BY supplierId HAVING b > 0)`
    )
    const [cust] = await rawQuery<{ debt: number }>(
      this.db,
      `SELECT COALESCE(SUM(b), 0) AS debt FROM (SELECT SUM(amount) AS b FROM CustomerLedger GROUP BY customerId HAVING b > 0)`
    )
    const trendFrom = new Date(startToday.getTime() - 13 * DAY)
    const trendRows = await rawQuery<{ day: string; sales: number; profit: number }>(
      this.db,
      `SELECT date(s.createdAt, 'localtime') AS day, COALESCE(SUM(${this.#itemNet}), 0) AS sales,
              COALESCE(SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}), 0) AS profit
       FROM Sale s JOIN SaleItem i ON i.saleId = s.id WHERE s.status <> 'VOIDED' AND s.createdAt >= ? GROUP BY day ORDER BY day`,
      trendFrom.toISOString()
    )
    const trend: DashboardData['trend'] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(trendFrom.getTime() + i * DAY)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const row = trendRows.find((r) => r.day === key)
      trend.push({ day: key, sales: row?.sales ?? 0, profit: can('view_profit') ? (row?.profit ?? 0) : null })
    }
    const topProducts = await rawQuery<{ name: string; qty: number; revenue: number }>(
      this.db,
      `SELECT i.name, SUM(i.qty - i.refundedQty) AS qty, SUM(${this.#itemNet}) AS revenue
       FROM SaleItem i JOIN Sale s ON s.id = i.saleId WHERE s.status <> 'VOIDED' AND s.createdAt >= ?
       GROUP BY COALESCE(i.variantId, i.name) ORDER BY qty DESC LIMIT 6`,
      new Date(now.getTime() - 30 * DAY).toISOString()
    )
    const pendingRepairList = await rawQuery<{ id: string; number: string; deviceModel: string; customerName: string; statusKey: string; technicianName: string | null; overdue: number; receivedAt: string | Date }>(
      this.db,
      `SELECT r.id, r.number, r.deviceModel, r.customerName, st.key AS statusKey, u.fullName AS technicianName,
              (CASE WHEN r.expectedAt IS NOT NULL AND r.expectedAt < ? THEN 1 ELSE 0 END) AS overdue, r.receivedAt
       FROM Repair r JOIN RepairStatus st ON st.id = r.statusId LEFT JOIN User u ON u.id = r.technicianId
       WHERE r.deletedAt IS NULL AND st.isFinal = 0 ORDER BY overdue DESC, r.receivedAt ASC LIMIT 6`,
      now.toISOString()
    )
    const technicians = await rawQuery<{ name: string; open: number }>(
      this.db,
      `SELECT COALESCE(u.fullName, '—') AS name, COUNT(*) AS open FROM Repair r JOIN RepairStatus st ON st.id = r.statusId
       LEFT JOIN User u ON u.id = r.technicianId WHERE r.deletedAt IS NULL AND st.isFinal = 0 GROUP BY r.technicianId ORDER BY open DESC LIMIT 6`
    )
    const topOffers = can('view_offer_analytics')
      ? await rawQuery<{ name: string; profit: number; accepted: number }>(
          this.db,
          `SELECT o.name, COALESCE(SUM(CASE WHEN e.event = 'CONVERTED' THEN e.profit ELSE 0 END), 0) AS profit,
                  SUM(CASE WHEN e.event = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted
           FROM OfferEvent e JOIN Offer o ON o.id = e.offerId WHERE e.createdAt >= ? GROUP BY e.offerId ORDER BY profit DESC LIMIT 3`,
          new Date(now.getTime() - 30 * DAY).toISOString()
        )
      : []
    const unreviewed = await this.db.shift.count({ where: { status: 'CLOSED', reviewedAt: null, NOT: { difference: 0 } } })
    return {
      today: { sales: today.total, count: today.n, profit: can('view_profit') ? today.profit : null, avgTicket: today.n ? Math.round(today.total / today.n) : 0 },
      yesterdaySales: yesterday.total,
      pendingRepairs: rep?.pending ?? 0,
      overdueRepairs: rep?.overdue ?? 0,
      readyRepairs: rep?.ready ?? 0,
      lowStock: alerts[0]?.low ?? 0,
      outOfStock: alerts[0]?.out ?? 0,
      deadStock: alerts[0]?.dead ?? 0,
      supplierDebt: can('view_supplier_balances') ? (sup?.debt ?? 0) : null,
      customerDebt: can('view_customer_data') && can('view_reports') ? (cust?.debt ?? 0) : null,
      trend,
      topProducts,
      pendingRepairList: pendingRepairList.map((r) => ({ ...r, overdue: !!r.overdue, receivedAt: this.#iso(r.receivedAt) })),
      technicians,
      topOffers,
      unreviewedShiftDiffs: can('view_all_shifts') ? unreviewed : 0
    }
  }

  async sales(range: ReportRange, group: ReportGroup, actor: Actor): Promise<SalesReport> {
    const canProfit = actor.permissions.has('view_profit')
    const p = [this.#iso(range.from), this.#iso(range.to)]
    const base = `FROM Sale s JOIN SaleItem i ON i.saleId = s.id WHERE s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ?`
    const [tot] = await rawQuery<{ count: number; revenue: number; tax: number; discount: number; cost: number }>(
      this.db,
      `SELECT COUNT(DISTINCT s.id) AS count, COALESCE(SUM(${this.#itemNet}), 0) AS revenue, COALESCE(SUM(${this.#itemNetTax}), 0) AS tax,
              COALESCE(SUM(i.discount), 0) AS discount, COALESCE(SUM(${this.#itemNetCost}), 0) AS cost ${base}`,
      ...p
    )
    const [ref] = await rawQuery<{ refunds: number }>(this.db, `SELECT COALESCE(SUM(total), 0) AS refunds FROM Refund WHERE createdAt >= ? AND createdAt < ?`, ...p)
    const series = await rawQuery<{ period: string; count: number; revenue: number; profit: number }>(
      this.db,
      `SELECT strftime('${this.#fmt(group)}', s.createdAt, 'localtime') AS period, COUNT(DISTINCT s.id) AS count, COALESCE(SUM(${this.#itemNet}), 0) AS revenue,
              COALESCE(SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}), 0) AS profit
       ${base} GROUP BY period ORDER BY period`,
      ...p
    )
    const byMethod = await rawQuery<{ method: string; amount: number }>(
      this.db,
      // How the period's sales were settled: adds up to net sales (repairs and debt
      // collections are cash-drawer receipts, not sales, and appear in shift reports).
      `SELECT method, SUM(amount) AS amount FROM (
         SELECT p.method AS method, p.amount AS amount FROM Payment p JOIN Sale s ON s.id = p.saleId
         WHERE s.createdAt >= ? AND s.createdAt < ? AND s.status <> 'VOIDED' AND p.kind IN ('SALE', 'REFUND')
         UNION ALL
         SELECT 'ON_CREDIT', creditAmount FROM Sale WHERE createdAt >= ? AND createdAt < ? AND status <> 'VOIDED' AND creditAmount > 0
       ) GROUP BY method HAVING SUM(amount) <> 0 ORDER BY amount DESC`,
      ...p,
      ...p
    )
    const byCategory = await rawQuery<{ name: string; qty: number; revenue: number; profit: number }>(
      this.db,
      `SELECT COALESCE(c.name, '—') AS name, SUM(i.qty - i.refundedQty) AS qty, SUM(${this.#itemNet}) AS revenue,
              SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}) AS profit
       ${base.replace('JOIN SaleItem i ON i.saleId = s.id', 'JOIN SaleItem i ON i.saleId = s.id LEFT JOIN ProductVariant v ON v.id = i.variantId LEFT JOIN Product pr ON pr.id = v.productId LEFT JOIN Category c ON c.id = pr.categoryId')}
       GROUP BY c.id ORDER BY revenue DESC`,
      ...p
    )
    const topProducts = await rawQuery<{ name: string; qty: number; revenue: number; profit: number }>(
      this.db,
      `SELECT i.name, SUM(i.qty - i.refundedQty) AS qty, SUM(${this.#itemNet}) AS revenue, SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}) AS profit
       ${base} GROUP BY COALESCE(i.variantId, i.name) ORDER BY revenue DESC LIMIT 20`,
      ...p
    )
    const count = tot?.count ?? 0
    return {
      totals: {
        count,
        revenue: tot?.revenue ?? 0,
        tax: tot?.tax ?? 0,
        discount: tot?.discount ?? 0,
        refunds: ref?.refunds ?? 0,
        cost: actor.permissions.has('view_cost') ? (tot?.cost ?? 0) : null,
        profit: canProfit ? (tot?.revenue ?? 0) - (tot?.tax ?? 0) - (tot?.cost ?? 0) : null,
        avgTicket: count ? Math.round((tot?.revenue ?? 0) / count) : 0
      },
      series: series.map((s) => ({ ...s, profit: canProfit ? s.profit : null })),
      byMethod,
      byCategory: byCategory.map((c) => ({ ...c, profit: canProfit ? c.profit : null })),
      topProducts: topProducts.map((c) => ({ ...c, profit: canProfit ? c.profit : null }))
    }
  }

  async profit(range: ReportRange, group: ReportGroup): Promise<ProfitReport> {
    const p = [this.#iso(range.from), this.#iso(range.to)]
    const split = await rawQuery<{ kind: string; profit: number }>(
      this.db,
      `SELECT CASE WHEN i.productType = 'SERVICE' THEN 'service' ELSE 'product' END AS kind,
              COALESCE(SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}), 0) AS profit
       FROM Sale s JOIN SaleItem i ON i.saleId = s.id WHERE s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ? GROUP BY kind`,
      ...p
    )
    const [rep] = await rawQuery<{ revenue: number; cost: number }>(
      this.db,
      `SELECT COALESCE(SUM(r.finalPrice), 0) AS revenue,
              COALESCE(SUM((SELECT COALESCE(SUM(rp.qty * rp.unitCost), 0) FROM RepairPart rp WHERE rp.repairId = r.id AND rp.returnedAt IS NULL)), 0) AS cost
       FROM Repair r JOIN RepairStatus st ON st.id = r.statusId WHERE st.key = 'DELIVERED' AND r.deletedAt IS NULL AND r.deliveredAt >= ? AND r.deliveredAt < ?`,
      ...p
    )
    const [exp] = await rawQuery<{ out: number }>(this.db, `SELECT COALESCE(SUM(amount), 0) AS out FROM CashMovement WHERE type = 'PAY_OUT' AND createdAt >= ? AND createdAt < ?`, ...p)
    const [disc] = await rawQuery<{ d: number }>(this.db, `SELECT COALESCE(SUM(discountTotal), 0) AS d FROM Sale WHERE status <> 'VOIDED' AND createdAt >= ? AND createdAt < ?`, ...p)
    const series = await rawQuery<{ period: string; profit: number }>(
      this.db,
      `SELECT strftime('${this.#fmt(group)}', s.createdAt, 'localtime') AS period, COALESCE(SUM(${this.#itemNet} - ${this.#itemNetTax} - ${this.#itemNetCost}), 0) AS profit
       FROM Sale s JOIN SaleItem i ON i.saleId = s.id WHERE s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ? GROUP BY period ORDER BY period`,
      ...p
    )
    const productProfit = split.find((x) => x.kind === 'product')?.profit ?? 0
    const serviceProfit = split.find((x) => x.kind === 'service')?.profit ?? 0
    const repairProfit = (rep?.revenue ?? 0) - (rep?.cost ?? 0)
    const gross = productProfit + serviceProfit + repairProfit
    return {
      productProfit,
      serviceProfit,
      repairProfit,
      repairRevenue: rep?.revenue ?? 0,
      grossProfit: gross,
      expenses: exp?.out ?? 0,
      discounts: disc?.d ?? 0,
      estimatedNet: gross - (exp?.out ?? 0),
      series
    }
  }

  async inventory(actor: Actor): Promise<InventoryReport> {
    const canCost = actor.permissions.has('view_cost')
    const now = this.now()
    const [val] = await rawQuery<{ units: number; cost: number; retail: number; items: number }>(
      this.db,
      `SELECT COALESCE(SUM(CASE WHEN v.stockQty > 0 THEN v.stockQty ELSE 0 END), 0) AS units,
              COALESCE(SUM(CASE WHEN v.stockQty > 0 THEN v.stockQty * v.costPrice ELSE 0 END), 0) AS cost,
              COALESCE(SUM(CASE WHEN v.stockQty > 0 THEN v.stockQty * v.sellPrice ELSE 0 END), 0) AS retail, COUNT(*) AS items
       FROM ProductVariant v JOIN Product p ON p.id = v.productId WHERE v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.trackStock = 1`
    )
    const name = `CASE WHEN v.name IS NULL THEN p.name ELSE p.name || ' — ' || v.name END`
    const live = `v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.isActive = 1 AND p.trackStock = 1`
    const low = await rawQuery<{ name: string; stock: number; minStock: number }>(
      this.db,
      `SELECT ${name} AS name, v.stockQty AS stock, v.minStock FROM ProductVariant v JOIN Product p ON p.id = v.productId WHERE ${live} AND v.stockQty <= v.minStock ORDER BY v.stockQty LIMIT 100`
    )
    const dead = await rawQuery<{ name: string; stock: number; value: number; lastSoldAt: string | Date | null }>(
      this.db,
      `SELECT ${name} AS name, v.stockQty AS stock, v.stockQty * v.costPrice AS value, v.lastSoldAt FROM ProductVariant v JOIN Product p ON p.id = v.productId
       WHERE ${live} AND v.stockQty > 0 AND COALESCE(v.lastSoldAt, v.createdAt) < ? ORDER BY value DESC LIMIT 100`,
      new Date(now.getTime() - this.settings.get('inventory').deadStockDays * DAY).toISOString()
    )
    const since = new Date(now.getTime() - this.settings.get('inventory').fastMovingDays * DAY).toISOString()
    const moving = await rawQuery<{ name: string; qty: number; stock: number }>(
      this.db,
      `SELECT ${name} AS name, COALESCE((SELECT SUM(-m.qty) FROM StockMovement m WHERE m.variantId = v.id AND m.type = 'SALE' AND m.createdAt >= ?), 0) AS qty, v.stockQty AS stock
       FROM ProductVariant v JOIN Product p ON p.id = v.productId WHERE ${live} ORDER BY qty DESC`,
      since
    )
    return {
      valuation: { units: val?.units ?? 0, cost: canCost ? (val?.cost ?? 0) : 0, retail: val?.retail ?? 0, items: val?.items ?? 0 },
      low,
      dead: dead.map((d) => ({ ...d, value: canCost ? d.value : 0, lastSoldAt: d.lastSoldAt ? this.#iso(d.lastSoldAt) : null })),
      fast: moving.filter((m) => m.qty > 0).slice(0, 20),
      slow: moving.filter((m) => m.stock > 0).reverse().slice(0, 20)
    }
  }

  async repairs(range: ReportRange, actor: Actor): Promise<RepairReport> {
    const p = [this.#iso(range.from), this.#iso(range.to)]
    const byStatus = await rawQuery<{ statusId: string; name: string; nameAr: string; color: string; count: number }>(
      this.db,
      `SELECT st.id AS statusId, st.name, st.nameAr, st.color, COUNT(r.id) AS count FROM RepairStatus st
       LEFT JOIN Repair r ON r.statusId = st.id AND r.deletedAt IS NULL GROUP BY st.id ORDER BY st.sortOrder`
    )
    const [agg] = await rawQuery<{ received: number; delivered: number; cancelled: number; revenue: number; cost: number; avgDays: number }>(
      this.db,
      `SELECT (SELECT COUNT(*) FROM Repair WHERE deletedAt IS NULL AND receivedAt >= ? AND receivedAt < ?) AS received,
              SUM(CASE WHEN st.key = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN st.key = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
              COALESCE(SUM(CASE WHEN st.key = 'DELIVERED' THEN r.finalPrice ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN st.key = 'DELIVERED' THEN (SELECT COALESCE(SUM(rp.qty * rp.unitCost), 0) FROM RepairPart rp WHERE rp.repairId = r.id AND rp.returnedAt IS NULL) ELSE 0 END), 0) AS cost,
              COALESCE(AVG(CASE WHEN st.key = 'DELIVERED' THEN julianday(r.deliveredAt) - julianday(r.receivedAt) END), 0) AS avgDays
       FROM Repair r JOIN RepairStatus st ON st.id = r.statusId WHERE r.deletedAt IS NULL AND COALESCE(r.deliveredAt, r.updatedAt) >= ? AND COALESCE(r.deliveredAt, r.updatedAt) < ?`,
      ...p,
      ...p
    )
    const [delayed] = await rawQuery<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM Repair r JOIN RepairStatus st ON st.id = r.statusId WHERE r.deletedAt IS NULL AND st.isFinal = 0 AND r.expectedAt < ?`,
      this.now().toISOString()
    )
    const technicians = await rawQuery<{ name: string; delivered: number; open: number; revenue: number; avgDays: number }>(
      this.db,
      `SELECT COALESCE(u.fullName, '—') AS name,
              SUM(CASE WHEN st.key = 'DELIVERED' AND r.deliveredAt >= ? AND r.deliveredAt < ? THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN st.isFinal = 0 THEN 1 ELSE 0 END) AS open,
              COALESCE(SUM(CASE WHEN st.key = 'DELIVERED' AND r.deliveredAt >= ? AND r.deliveredAt < ? THEN r.finalPrice ELSE 0 END), 0) AS revenue,
              COALESCE(AVG(CASE WHEN st.key = 'DELIVERED' THEN julianday(r.deliveredAt) - julianday(r.receivedAt) END), 0) AS avgDays
       FROM Repair r JOIN RepairStatus st ON st.id = r.statusId LEFT JOIN User u ON u.id = r.technicianId
       WHERE r.deletedAt IS NULL GROUP BY r.technicianId ORDER BY delivered DESC`,
      ...p,
      ...p
    )
    return {
      byStatus,
      received: agg?.received ?? 0,
      delivered: agg?.delivered ?? 0,
      cancelled: agg?.cancelled ?? 0,
      delayed: delayed?.n ?? 0,
      revenue: agg?.revenue ?? 0,
      profit: actor.permissions.has('view_profit') ? (agg?.revenue ?? 0) - (agg?.cost ?? 0) : null,
      avgDays: Math.round((agg?.avgDays ?? 0) * 10) / 10,
      technicians: technicians.map((x) => ({ ...x, avgDays: Math.round(x.avgDays * 10) / 10 }))
    }
  }

  async suppliers(range: ReportRange): Promise<SupplierReport> {
    const p = [this.#iso(range.from), this.#iso(range.to)]
    const balances = await rawQuery<{ id: string; name: string; balance: number }>(
      this.db,
      `SELECT s.id, s.name, COALESCE(SUM(l.amount), 0) AS balance FROM Supplier s LEFT JOIN SupplierLedger l ON l.supplierId = s.id
       WHERE s.deletedAt IS NULL GROUP BY s.id HAVING balance <> 0 ORDER BY balance DESC`
    )
    const [pur] = await rawQuery<{ v: number }>(this.db, `SELECT COALESCE(SUM(amount), 0) AS v FROM SupplierLedger WHERE type = 'PURCHASE' AND createdAt >= ? AND createdAt < ?`, ...p)
    const [pay] = await rawQuery<{ v: number }>(
      this.db,
      `SELECT COALESCE(SUM(amount), 0) AS v FROM SupplierPayment WHERE direction = 'OUT' AND voidedAt IS NULL AND createdAt >= ? AND createdAt < ?`,
      ...p
    )
    return {
      balances,
      totalOwed: balances.filter((b) => b.balance > 0).reduce((a, b) => a + b.balance, 0),
      totalOwedToUs: -balances.filter((b) => b.balance < 0).reduce((a, b) => a + b.balance, 0),
      purchases: pur?.v ?? 0,
      payments: pay?.v ?? 0
    }
  }

  async employees(range: ReportRange): Promise<EmployeeReport> {
    const p = [this.#iso(range.from), this.#iso(range.to)]
    const rows = await rawQuery<EmployeeReport['rows'][number]>(
      this.db,
      `SELECT u.id AS userId, u.fullName AS name,
         (SELECT COUNT(*) FROM Sale s WHERE s.userId = u.id AND s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ?) AS sales,
         (SELECT COALESCE(SUM(s.total - s.refundedTotal), 0) FROM Sale s WHERE s.userId = u.id AND s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ?) AS revenue,
         (SELECT COALESCE(SUM(s.discountTotal), 0) FROM Sale s WHERE s.userId = u.id AND s.status <> 'VOIDED' AND s.createdAt >= ? AND s.createdAt < ?) AS discounts,
         (SELECT COALESCE(SUM(r.total), 0) FROM Refund r WHERE r.userId = u.id AND r.createdAt >= ? AND r.createdAt < ?) AS refunds,
         (SELECT COUNT(*) FROM Sale s WHERE s.voidedById = u.id AND s.voidedAt >= ? AND s.voidedAt < ?) AS voids,
         (SELECT COUNT(*) FROM AuditLog a WHERE a.userId = u.id AND a.createdAt >= ? AND a.createdAt < ?) AS actions
       FROM User u WHERE u.deletedAt IS NULL ORDER BY revenue DESC`,
      ...p,
      ...p,
      ...p,
      ...p,
      ...p,
      ...p
    )
    return { rows }
  }

  /** Ctrl+K search across products, customers, repairs, receipts and suppliers. */
  async search(q: string, actor: Actor): Promise<GlobalSearchResult> {
    const text = q.trim()
    const can = (perm: string) => actor.permissions.has(perm as never)
    const empty: GlobalSearchResult = { products: [], customers: [], repairs: [], sales: [], suppliers: [] }
    if (text.length < 2) return empty
    const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const phone = normalizePhone(text)
    const products = can('view_inventory') || can('create_sale') ? (await this.catalog.posSearch({ q: text, limit: 6 }, false)).map((p) => ({ id: p.productId, variantId: p.variantId, name: p.name, price: p.sellPrice, stock: p.trackStock ? p.stockQty : null })) : []
    const customers = can('view_customer_data') ? (await this.customers.quickFind(text)).slice(0, 5).map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: c.balance })) : []
    const repairs = can('view_repairs')
      ? await rawQuery<GlobalSearchResult['repairs'][number]>(
          this.db,
          `SELECT r.id, r.number, r.deviceModel, r.customerName, st.key AS statusKey FROM Repair r JOIN RepairStatus st ON st.id = r.statusId
           WHERE r.deletedAt IS NULL AND (r.number LIKE ? ESCAPE '\\' OR r.customerPhone LIKE ? ESCAPE '\\' OR r.imei LIKE ? ESCAPE '\\' OR r.customerName LIKE ? ESCAPE '\\')
           ORDER BY r.receivedAt DESC LIMIT 5`,
          like.toUpperCase(),
          phone ? `%${phone}%` : like,
          like,
          like
        )
      : []
    const sales =
      can('view_sales') || can('create_sale')
        ? (
            await rawQuery<{ id: string; number: string; total: number; createdAt: string | Date; customerName: string | null }>(
              this.db,
              `SELECT s.id, COALESCE(s.invoiceNumber, s.number) AS number, s.total, s.createdAt, c.name AS customerName FROM Sale s LEFT JOIN Customer c ON c.id = s.customerId
               WHERE (s.number LIKE ? ESCAPE '\\' OR s.invoiceNumber LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\') ${can('view_sales') ? '' : 'AND s.userId = ?'}
               ORDER BY s.createdAt DESC LIMIT 5`,
              like.toUpperCase(),
              like.toUpperCase(),
              phone ? `%${phone}%` : like,
              ...(can('view_sales') ? [] : [actor.userId])
            )
          ).map((s) => ({ ...s, createdAt: this.#iso(s.createdAt) }))
        : []
    const suppliers = can('manage_suppliers') || can('view_supplier_balances')
      ? await rawQuery<GlobalSearchResult['suppliers'][number]>(
          this.db,
          `SELECT id, name, phone FROM Supplier WHERE deletedAt IS NULL AND (searchText LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\') LIMIT 5`,
          like.toLowerCase(),
          phone ? `%${phone}%` : like
        )
      : []
    return { products, customers, repairs, sales, suppliers }
  }
}
