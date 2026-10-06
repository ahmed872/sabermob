/**
 * "Start fresh": the owner wipes a trial period's business data. Store details,
 * users, settings, activation and the catalog setup stay; a safety backup is
 * taken first; numbering restarts; non-owners and wrong passwords are refused.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => 'test', relaunch: () => undefined, exit: () => undefined }, dialog: {}, shell: {}, session: {}, BrowserWindow: class {} }))

import { ApiRouter } from '@main/ipc/router'
import { registerCoreHandlers } from '@main/ipc/handlers/core'
import { registerPosHandlers } from '@main/ipc/handlers/pos'
import { registerModuleHandlers } from '@main/ipc/handlers/modules'
import { registerDataHandlers } from '@main/ipc/handlers/data'
import { actor, cleanup, createTestApp, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
let router: ApiRouter
type Res = { ok: boolean; data?: any; error?: { code: string; details?: Record<string, unknown> } }
const call = (m: string, input?: unknown) => router.dispatch(m, input) as Promise<Res>

beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t, { starterCatalog: true, store: { name: 'سنترال الأمل', phone: '01000000000' } })
  router = new ApiRouter(t.app)
  registerCoreHandlers(router, { appVersion: 'test', platform: 'test', openPath: async () => undefined, listPrinters: async () => [] })
  registerPosHandlers(router)
  registerModuleHandlers(router)
  registerDataHandlers(router, () => null, null)

  // a few days of trial use
  const a = actor(t)
  await t.app.shifts.open(50000, a)
  const caseV = (await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'جراب تجربة', variants: [{ sellPrice: 15000, costPrice: 8000, openingStock: 10 }] }, a)).variants[0]!.id
  const customer = await t.app.customers.save({ name: 'عميل تجربة', phone: '01011112222' }, a)
  const supplier = await t.app.suppliers.save({ name: 'مورد تجربة' }, a)
  await t.app.suppliers.createPurchase({ supplierId: supplier.id, items: [{ variantId: caseV, qty: 5, unitCost: 8000 }], receiveNow: true }, a)
  await t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', customerId: customer.id, lines: [{ variantId: caseV, qty: 2, unitPrice: 15000 }], payments: [{ method: 'CASH', amount: 10000 }] }, a)
  await t.app.repairs.create({ customerName: 'عميل صيانة', customerPhone: '01033334444', deviceModel: 'A54', complaint: 'شاشة', deposit: { amount: 5000, method: 'CASH' } }, a)
  await t.app.users.create({ username: 'cashier', fullName: 'كاشير', password: 'cashier-pass-1', pin: null, roleId: (await t.app.users.listRoles()).find((r) => r.systemKey === 'CASHIER')!.id }, a)
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

describe('start fresh', () => {
  it('shows what will be removed', async () => {
    expect((await call('data.resetSummary')).data).toMatchObject({ sales: 1, products: 1, customers: 2, suppliers: 1, repairs: 1 })
  })

  it('refuses without backups, with a wrong password, and for non-owners', async () => {
    expect((await call('data.reset', { password: OWNER.password, confirm: 'RESET', clearCatalog: false })).error).toMatchObject({ code: 'INVALID_STATE', details: { reason: 'resetNeedsBackup' } })
    await t.app.backup.setPassword('backup-pass-1', actor(t).userId)
    expect((await call('data.reset', { password: 'wrong-password', confirm: 'RESET', clearCatalog: false })).error?.code).toBe('INVALID_CREDENTIALS')
    expect((await call('data.reset', { password: OWNER.password, confirm: 'yes', clearCatalog: false })).error?.code).toBe('VALIDATION')
    await t.app.auth.login({ username: 'cashier', secret: 'cashier-pass-1', method: 'PASSWORD' })
    expect((await call('data.reset', { password: 'cashier-pass-1', confirm: 'RESET', clearCatalog: false })).error?.code).toBe('FORBIDDEN')
    await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
  })

  it('wipes the business data and keeps the store, users, settings and catalog setup', async () => {
    const categories = await t.app.db.category.count()
    const services = await t.app.db.product.count({ where: { type: 'SERVICE' } })
    expect(services).toBeGreaterThan(0)
    const res = await call('data.reset', { password: OWNER.password, confirm: 'RESET', clearCatalog: false })
    expect(res.ok).toBe(true)

    const db = t.app.db
    for (const [name, n] of Object.entries({
      sales: await db.sale.count(),
      payments: await db.payment.count(),
      customers: await db.customer.count(),
      suppliers: await db.supplier.count(),
      purchases: await db.purchaseOrder.count(),
      repairs: await db.repair.count(),
      shifts: await db.shift.count(),
      stockMoves: await db.stockMovement.count(),
      products: await db.product.count({ where: { type: { not: 'SERVICE' } } })
    })) expect(n, name).toBe(0)
    expect(await db.category.count()).toBe(categories)
    expect(await db.product.count({ where: { type: 'SERVICE' } })).toBe(services)
    expect(await db.user.count()).toBe(2)
    expect(t.app.settings.get('company').storeName).toBe('سنترال الأمل')
    expect(t.app.license.state().status).toBe('TRIAL')
    expect(await db.backupRecord.count({ where: { kind: 'PRE_RESET', status: 'SUCCESS' } })).toBe(1)
    expect(await db.auditLog.count({ where: { action: 'data.reset' } })).toBe(1)

    // back to work: numbering starts again
    const a = actor(t)
    await t.app.shifts.open(0, a)
    const v = (await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'جراب حقيقي', variants: [{ sellPrice: 20000, openingStock: 3 }] }, a)).variants[0]!.id
    const s = await t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: v, qty: 1, unitPrice: 20000 }], payments: [{ method: 'CASH', amount: 20000 }] }, a)
    expect(s.number).toBe('S-000001')
  })

  it('can also clear the catalog setup', async () => {
    expect((await call('data.reset', { password: OWNER.password, confirm: 'RESET', clearCatalog: true })).ok).toBe(true)
    expect(await t.app.db.category.count()).toBe(0)
    expect(await t.app.db.brand.count()).toBe(0)
    expect(await t.app.db.product.count()).toBe(0)
    expect(await t.app.db.user.count()).toBe(2)
  })
})
