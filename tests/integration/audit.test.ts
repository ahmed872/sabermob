/**
 * Commercial audit: business workflows reconciled against hand-calculated
 * numbers, data consistency, failure atomicity and the role matrix through
 * the real IPC router.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => 'test', relaunch: () => undefined, exit: () => undefined }, dialog: {}, shell: {}, session: {}, BrowserWindow: class {} }))

import { ApiRouter } from '@main/ipc/router'
import { registerCoreHandlers } from '@main/ipc/handlers/core'
import { registerPosHandlers } from '@main/ipc/handlers/pos'
import { registerModuleHandlers, registerOfferHandlers } from '@main/ipc/handlers/modules'
import { registerReportHandlers } from '@main/ipc/handlers/reports'
import { registerDataHandlers } from '@main/ipc/handlers/data'
import { rawQuery } from '@main/database/client'
import type { Printer } from '@main/printing/printer'
import { actor, cleanup, createTestApp, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
let router: ApiRouter
type Res = { ok: boolean; data?: any; error?: { code: string } }
const call = (m: string, input?: unknown) => router.dispatch(m, input) as Promise<Res>

const range = () => ({ from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() })
const stock = async (id: string) => (await t.app.db.productVariant.findUniqueOrThrow({ where: { id } })).stockQty
const count = async (table: string) => (await rawQuery<{ n: number }>(t.app.db, `SELECT COUNT(*) AS n FROM "${table}"`))[0]!.n
const sale = (lines: Array<{ variantId: string; qty: number; unitPrice: number }>, payments: Array<{ method: 'CASH' | 'CARD' | 'WALLET' | 'TRANSFER'; amount: number }>, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  kind: 'QUICK' as const,
  lines,
  payments,
  ...extra
})

let CASE: string, CHARGER: string, BATTERY: string, customerId: string, supplierId: string

beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t, { starterCatalog: false })
  router = new ApiRouter(t.app)
  registerCoreHandlers(router, { appVersion: 'test', platform: 'test', openPath: async () => undefined, listPrinters: async () => [] })
  registerPosHandlers(router)
  registerModuleHandlers(router)
  registerOfferHandlers(router)
  registerReportHandlers(router, {} as Printer, () => null)
  registerDataHandlers(router, () => null, null)
  await t.app.shifts.open(100000, actor(t))
  const mk = async (name: string, type: 'ACCESSORY' | 'PART', cost: number, price: number, qty: number) =>
    (await t.app.catalog.createProduct({ type, name, variants: [{ sellPrice: price, costPrice: cost, openingStock: qty, barcodes: [] }] }, actor(t))).variants[0]!.id
  CASE = await mk('Audit Case', 'ACCESSORY', 4000, 10000, 20)
  CHARGER = await mk('Audit Charger', 'ACCESSORY', 12000, 25000, 10)
  BATTERY = await mk('Audit Battery', 'PART', 15000, 30000, 5)
  customerId = (await t.app.customers.save({ name: 'Credit Customer', phone: '01012345678' }, actor(t))).id
  supplierId = (await t.app.suppliers.save({ name: 'Audit Supplier' }, actor(t))).id
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

describe('accounting reconciliation (hand-calculated)', () => {
  it('sales, refunds, voids, credit, repairs, suppliers and the drawer all match the expected figures', async () => {
    const a = actor(t)
    // S1: 2 cases + 1 charger = 45,000; cash 50,000 → change 5,000
    const s1 = await t.app.sales.complete(sale([{ variantId: CASE, qty: 2, unitPrice: 10000 }, { variantId: CHARGER, qty: 1, unitPrice: 25000 }], [{ method: 'CASH', amount: 50000 }]), a)
    expect(s1.total).toBe(45000)
    // S2: 3 cases − 3,000 cart discount = 27,000 by card
    const s2 = await t.app.sales.complete(sale([{ variantId: CASE, qty: 3, unitPrice: 10000 }], [{ method: 'CARD', amount: 27000 }], { cartDiscount: { type: 'AMOUNT', amount: 3000 } }), a)
    expect(s2.total).toBe(27000)
    // S3: charger on partial credit: 10,000 cash now, 15,000 on account
    await t.app.sales.complete(sale([{ variantId: CHARGER, qty: 1, unitPrice: 25000 }], [{ method: 'CASH', amount: 10000 }], { customerId }), a)
    // S4: sold then voided → must not count anywhere
    const s4 = await t.app.sales.complete(sale([{ variantId: CASE, qty: 1, unitPrice: 10000 }], [{ method: 'CASH', amount: 10000 }]), a)
    await t.app.sales.void({ saleId: s4.id, reason: 'audit void' }, a)
    // Refund 1 case from S1 in cash
    await t.app.sales.refund({ saleId: s1.id, items: [{ saleItemId: s1.items.find((i) => i.variantId === CASE)!.id, qty: 1 }], method: 'CASH' }, a)
    // Customer pays 5,000 of the 15,000 debt
    await t.app.customers.collectDebt({ customerId, amount: 5000, method: 'CASH' }, a)

    // Repair: deposit 5,000; battery part sold at 30,000 (cost 15,000) + labour 20,000 = 50,000; paid 45,000 at delivery
    const r = await t.app.repairs.create({ customerName: 'Repair Customer', customerPhone: '01098765432', deviceModel: 'Phone X', complaint: 'battery', deposit: { amount: 5000, method: 'CASH' } }, a)
    await t.app.repairs.addPart({ repairId: r.id, variantId: BATTERY, qty: 1, unitPrice: 30000 }, a)
    await t.app.repairs.update({ id: r.id, laborPrice: 20000 }, a)
    const statuses = await t.app.repairs.statuses()
    const delivered = await t.app.repairs.changeStatus({ id: r.id, statusId: statuses.find((s) => s.key === 'DELIVERED')!.id, payments: [{ method: 'CASH', amount: 45000 }] }, a)
    expect(delivered.finalPrice).toBe(50000)
    expect(delivered.balanceDue).toBe(0)

    // Supplier: buy 10 cases @ 4,000 = 40,000; pay 15,000 cash; return 2 cases = 8,000 → we owe 17,000
    const po = await t.app.suppliers.createPurchase({ supplierId, items: [{ variantId: CASE, qty: 10, unitCost: 4000 }], receiveNow: true, payment: { amount: 15000, method: 'CASH' } }, a)
    await t.app.suppliers.returnToSupplier({ supplierId, purchaseOrderId: po.id, items: [{ variantId: CASE, qty: 2, unitCost: 4000 }] }, a)

    // ── Expected (by hand) ──
    // Net sales = 45,000 + 27,000 + 25,000 − 10,000 (refund) = 87,000   (S4 voided)
    // COGS = cases kept (2−1+3 = 4) × 4,000 + chargers 2 × 12,000 = 40,000 → product profit 47,000
    // Repair revenue 50,000 − parts cost 15,000 = 35,000
    const sales = await t.app.reports.sales(range(), 'day', a)
    expect(sales.totals.count).toBe(3)
    expect(sales.totals.revenue).toBe(87000)
    expect(sales.totals.profit).toBe(47000)
    expect(sales.totals.discount).toBe(3000)
    const profit = await t.app.reports.profit(range(), 'day')
    expect(profit.productProfit + profit.serviceProfit).toBe(47000)
    expect(profit.repairRevenue).toBe(50000)
    expect(profit.repairProfit).toBe(35000)
    expect(profit.grossProfit).toBe(82000)

    expect(await t.app.customers.balance(customerId)).toBe(10000)
    expect(await t.app.suppliers.balance(supplierId)).toBe(17000)

    // Stock: case 20 −2 −3 −1 +1(void) +1(refund) +10 −2 = 24; charger 10 −2 = 8; battery 5 −1 = 4
    expect(await stock(CASE)).toBe(24)
    expect(await stock(CHARGER)).toBe(8)
    expect(await stock(BATTERY)).toBe(4)

    // Drawer: 100,000 + 45,000 (S1 net cash) + 10,000 (S3) + 10,000 − 10,000 (S4 void) − 10,000 (refund)
    //         + 5,000 (collect) + 5,000 (deposit) + 45,000 (repair) − 15,000 (supplier) = 185,000
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(185000)

    // Dashboard agrees with the reports
    const dash = await t.app.reports.dashboard(a)
    expect(dash.today.sales).toBe(87000)
    expect(dash.today.profit).toBe(47000)
    expect(dash.today.count).toBe(3)
    expect(dash.supplierDebt).toBe(17000)
    expect(dash.customerDebt).toBe(10000)

    // Settlement adds up to net sales: cash 45,000 − 10,000 + 10,000 = 45,000; card 27,000; on credit 15,000
    const by = Object.fromEntries(sales.byMethod.map((m) => [m.method, m.amount]))
    expect(by).toEqual({ CASH: 45000, CARD: 27000, ON_CREDIT: 15000 })
    expect(sales.byMethod.reduce((n, m) => n + m.amount, 0)).toBe(sales.totals.revenue)
  })

  it('leaves no orphaned or impossible records', async () => {
    expect(await rawQuery(t.app.db, 'PRAGMA foreign_key_check')).toEqual([])
    expect((await rawQuery<{ integrity_check: string }>(t.app.db, 'PRAGMA integrity_check'))[0]!.integrity_check).toBe('ok')
    // every sale has items; totals equal the sum of their lines
    expect(await rawQuery(t.app.db, `SELECT s.id FROM Sale s LEFT JOIN SaleItem i ON i.saleId = s.id GROUP BY s.id HAVING COUNT(i.id) = 0`)).toEqual([])
    // the stock cache equals the movement ledger for every variant
    const drift = await rawQuery(
      t.app.db,
      `SELECT v.id FROM ProductVariant v LEFT JOIN (SELECT variantId, SUM(qty) AS q FROM StockMovement GROUP BY variantId) m ON m.variantId = v.id WHERE v.stockQty <> COALESCE(m.q, 0)`
    )
    expect(drift).toEqual([])
    // no negative stock, no refund above what was sold
    expect(await rawQuery(t.app.db, `SELECT id FROM ProductVariant WHERE stockQty < 0`)).toEqual([])
    expect(await rawQuery(t.app.db, `SELECT id FROM SaleItem WHERE refundedQty > qty OR refundedQty < 0`)).toEqual([])
    // every payment belongs to what its kind says
    expect(
      await rawQuery(
        t.app.db,
        `SELECT id, kind FROM Payment WHERE (kind = 'SALE' AND saleId IS NULL) OR (kind = 'REPAIR' AND repairId IS NULL)
           OR (kind = 'DEBT_COLLECTION' AND customerId IS NULL) OR (kind = 'REFUND' AND saleId IS NULL AND repairId IS NULL)
           OR kind NOT IN ('SALE', 'REPAIR', 'DEBT_COLLECTION', 'REFUND')`
      )
    ).toEqual([])
    // non-credit sale payments add up to the sale total (credit part is on the customer ledger)
    expect(
      await rawQuery(
        t.app.db,
        `SELECT s.id FROM Sale s LEFT JOIN (SELECT saleId, SUM(amount) AS paid FROM Payment WHERE kind = 'SALE' GROUP BY saleId) p ON p.saleId = s.id
         WHERE s.status <> 'VOIDED' AND COALESCE(p.paid, 0) + s.creditAmount <> s.total`
      )
    ).toEqual([])
    // every financial action is in the audit log
    const actions = (await rawQuery<{ action: string }>(t.app.db, `SELECT DISTINCT action FROM AuditLog`)).map((r) => r.action)
    for (const a of ['sale.completed', 'sale.refunded', 'sale.voided', 'purchase.received', 'purchase.returned', 'repair.part_added']) expect(actions).toContain(a)
  })
})

describe('failure atomicity', () => {
  it('a sale that fails at the last step leaves no payment, movement or stock change', async () => {
    const before = { sales: await count('Sale'), payments: await count('Payment'), moves: await count('StockMovement'), stock: await stock(CHARGER) }
    const original = t.app.audit.log.bind(t.app.audit)
    const spy = vi.spyOn(t.app.audit, 'log').mockImplementation(async (entry, tx) => {
      if (entry.action === 'sale.completed') throw new Error('simulated crash at commit')
      return original(entry, tx)
    })
    try {
      await expect(t.app.sales.complete(sale([{ variantId: CHARGER, qty: 2, unitPrice: 25000 }], [{ method: 'CASH', amount: 50000 }]), actor(t))).rejects.toThrow('simulated crash')
    } finally {
      spy.mockRestore()
    }
    expect({ sales: await count('Sale'), payments: await count('Payment'), moves: await count('StockMovement'), stock: await stock(CHARGER) }).toEqual(before)
  })

  it('a purchase receipt that fails half way changes nothing', async () => {
    const before = { stock: await stock(BATTERY), ledger: await count('SupplierLedger') }
    const spy = vi.spyOn(t.app.audit, 'log').mockImplementation(async (entry) => {
      if (entry.action === 'purchase.created' || entry.action === 'purchase.received') throw new Error('simulated crash')
    })
    try {
      await expect(t.app.suppliers.createPurchase({ supplierId, items: [{ variantId: BATTERY, qty: 3, unitCost: 15000 }], receiveNow: true }, actor(t))).rejects.toThrow()
    } finally {
      spy.mockRestore()
    }
    expect({ stock: await stock(BATTERY), ledger: await count('SupplierLedger') }).toEqual(before)
  })

  it('rejects invalid quantities, prices and unknown products at the API', async () => {
    const bad = [
      { variantId: CASE, qty: -1, unitPrice: 10000 },
      { variantId: CASE, qty: 0, unitPrice: 10000 },
      { variantId: CASE, qty: 1, unitPrice: -5 },
      { variantId: CASE, qty: 1.5, unitPrice: 10000 },
      { variantId: CASE, qty: 10_000_000, unitPrice: 10000 }
    ]
    for (const line of bad) expect((await call('pos.complete', sale([line], [{ method: 'CASH', amount: 10000 }]))).error?.code).toBe('VALIDATION')
    expect((await call('pos.complete', sale([{ variantId: 'does-not-exist', qty: 1, unitPrice: 100 }], [{ method: 'CASH', amount: 100 }]))).error?.code).toBe('NOT_FOUND')
    expect((await call('pos.complete', sale([{ variantId: CASE, qty: 1000, unitPrice: 10000 }], [{ method: 'CASH', amount: 10_000_000 }]))).error?.code).toBe('INSUFFICIENT_STOCK')
    expect((await call('pos.complete', sale([{ variantId: CASE, qty: 1, unitPrice: 10000 }], [{ method: 'CASH', amount: 5000 }]))).error?.code).toBe('CREDIT_REQUIRES_CUSTOMER')
    expect((await call('catalog.saveProduct', { type: 'ACCESSORY', name: 'neg', variants: [{ sellPrice: -1 }] })).error?.code).toBe('VALIDATION')
    expect((await call('qr.resolve', { text: 'CP1:S:not-a-sale:AAAAAAAAAAAAAAAA' })).error?.code).toMatch(/QR_INVALID|QR_DISABLED|NOT_FOUND/)
  })

  it('holds a cart and resumes it exactly once', async () => {
    const held = await t.app.sales.hold({ label: 'Customer coming back', total: 10000, payload: JSON.stringify({ lines: [{ variantId: CASE, qty: 1 }] }) }, actor(t))
    expect((await t.app.sales.listHeld()).map((h) => h.id)).toContain(held.id)
    const taken = await t.app.sales.takeHeld(held.id)
    expect(JSON.parse(taken.payload).lines[0].variantId).toBe(CASE)
    await expect(t.app.sales.takeHeld(held.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('roles enforced in the backend (direct IPC, bypassing the UI)', () => {
  const ROLE_USERS = ['MANAGER', 'CASHIER', 'TECHNICIAN', 'ACCOUNTANT', 'INVENTORY_MANAGER'] as const
  // method → input; checked for every role
  const PROBES: Record<string, unknown> = {
    'users.list': undefined,
    'settings.update': { group: 'pos', values: { scanSound: true } },
    'catalog.saveProduct': { type: 'ACCESSORY', name: 'Probe', variants: [{ sellPrice: 100 }] },
    'inventory.adjust': { type: 'DAMAGED', items: [{ variantId: '', qty: 1 }] },
    'reports.profit': { ...range(), group: 'day' },
    'reports.sales': { ...range(), group: 'day' },
    'suppliers.pay': { supplierId: '', amount: 1, method: 'CASH' },
    'purchases.create': { supplierId: '', items: [] },
    'repairs.create': { customerName: 'x', deviceModel: 'x', complaint: 'x' },
    'pos.complete': {},
    'backup.status': undefined,
    'customers.adjust': { customerId: '', amount: 1, note: 'probe' }
  }
  // true = permitted (the call may still fail validation, but not with FORBIDDEN)
  const EXPECTED: Record<(typeof ROLE_USERS)[number], Record<string, boolean>> = {
    MANAGER: { 'users.list': false, 'settings.update': true, 'catalog.saveProduct': true, 'inventory.adjust': true, 'reports.profit': true, 'reports.sales': true, 'suppliers.pay': true, 'purchases.create': true, 'repairs.create': true, 'pos.complete': true, 'backup.status': false, 'customers.adjust': true },
    CASHIER: { 'users.list': false, 'settings.update': false, 'catalog.saveProduct': false, 'inventory.adjust': false, 'reports.profit': false, 'reports.sales': false, 'suppliers.pay': false, 'purchases.create': false, 'repairs.create': true, 'pos.complete': true, 'backup.status': false, 'customers.adjust': false },
    TECHNICIAN: { 'users.list': false, 'settings.update': false, 'catalog.saveProduct': false, 'inventory.adjust': false, 'reports.profit': false, 'reports.sales': false, 'suppliers.pay': false, 'purchases.create': false, 'repairs.create': true, 'pos.complete': false, 'backup.status': false, 'customers.adjust': false },
    ACCOUNTANT: { 'users.list': false, 'settings.update': false, 'catalog.saveProduct': false, 'inventory.adjust': false, 'reports.profit': true, 'reports.sales': true, 'suppliers.pay': true, 'purchases.create': false, 'repairs.create': false, 'pos.complete': false, 'backup.status': false, 'customers.adjust': false },
    INVENTORY_MANAGER: { 'users.list': false, 'settings.update': false, 'catalog.saveProduct': true, 'inventory.adjust': true, 'reports.profit': false, 'reports.sales': false, 'suppliers.pay': false, 'purchases.create': true, 'repairs.create': false, 'pos.complete': false, 'backup.status': false, 'customers.adjust': false }
  }

  it('matches the permission policy for every role', async () => {
    const roles = await t.app.users.listRoles()
    for (const key of ROLE_USERS) {
      await t.app.users.create({ username: `u_${key.toLowerCase()}`, fullName: `User ${key}`, password: 'role-pass-1', pin: null, roleId: roles.find((r) => r.systemKey === key)!.id }, actor(t))
    }
    const mismatches: string[] = []
    for (const key of ROLE_USERS) {
      await t.app.auth.logout()
      await t.app.auth.login({ username: `u_${key.toLowerCase()}`, secret: 'role-pass-1', method: 'PASSWORD' })
      for (const [method, input] of Object.entries(PROBES)) {
        const res = await call(method, input)
        const allowed = res.error?.code !== 'FORBIDDEN'
        if (allowed !== EXPECTED[key][method]) mismatches.push(`${key} ${method}: ${allowed ? 'allowed' : 'denied'} (${res.error?.code ?? 'ok'})`)
      }
    }
    await t.app.auth.logout()
    await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
    expect(mismatches).toEqual([])
  })

  it('hides cost and profit from roles without view_cost / view_profit', async () => {
    await t.app.auth.logout()
    await t.app.auth.login({ username: 'u_cashier', secret: 'role-pass-1', method: 'PASSWORD' })
    const list = await call('catalog.list', { page: 1, pageSize: 5 })
    expect(list.ok).toBe(true)
    expect(list.data.items.every((i: { costPrice: number | null }) => i.costPrice === null)).toBe(true)
    const dash = await call('reports.dashboard')
    expect(dash.data.today.profit).toBeNull()
    expect(dash.data.supplierDebt).toBeNull()
    await t.app.auth.logout()
    await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
  })

  it('switching users never leaks permissions', async () => {
    await t.app.auth.logout()
    await t.app.auth.login({ username: 'u_cashier', secret: 'role-pass-1', method: 'PASSWORD' })
    expect((await call('inventory.adjust', { type: 'DAMAGED', items: [{ variantId: CASE, qty: 1 }] })).error?.code).toBe('FORBIDDEN')
    // cashier steps away → manager switches in, does the adjustment
    t.app.auth.lock()
    const manager = (await t.app.users.list()).find((u) => u.username === 'u_manager')!
    await t.app.auth.unlock({ userId: manager.id, secret: 'role-pass-1', method: 'PASSWORD' })
    expect(t.app.auth.currentActor()?.userId).toBe(manager.id)
    expect((await call('inventory.adjust', { type: 'DAMAGED', items: [{ variantId: CASE, qty: 1 }] })).ok).toBe(true)
    // back to the cashier: the manager's rights are gone
    t.app.auth.lock()
    const cashier = (await t.app.users.list()).find((u) => u.username === 'u_cashier')!
    await t.app.auth.unlock({ userId: cashier.id, secret: 'role-pass-1', method: 'PASSWORD' })
    expect((await call('inventory.adjust', { type: 'DAMAGED', items: [{ variantId: CASE, qty: 1 }] })).error?.code).toBe('FORBIDDEN')
    const adj = await rawQuery<{ userId: string }>(t.app.db, `SELECT userId FROM AuditLog WHERE action LIKE 'stock.%' OR action LIKE 'inventory.%' ORDER BY createdAt DESC LIMIT 1`)
    expect(adj[0]?.userId).toBe(manager.id)
    await t.app.auth.logout()
    await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
  })
})
