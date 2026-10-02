import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppContext } from '@main/app/context'
import { ApiRouter } from '@main/ipc/router'
import { registerCoreHandlers } from '@main/ipc/handlers/core'
import { registerPosHandlers } from '@main/ipc/handlers/pos'
import { rawQuery } from '@main/database/client'
import { actor, cleanup, createTestApp, FakeLicensePlatform, MIGRATIONS, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
let router: ApiRouter
const call = (method: string, input?: unknown) => router.dispatch(method, input) as Promise<{ ok: boolean; data?: any; error?: { code: string; message: string } }>

beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t)
  router = new ApiRouter(t.app)
  registerCoreHandlers(router, { appVersion: 'test', platform: 'test', openPath: async () => undefined, listPrinters: async () => [] })
  registerPosHandlers(router)
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

describe('API boundary', () => {
  it('rejects unknown methods and malformed input without leaking internals', async () => {
    expect((await call('nope.nothing')).error?.code).toBe('NOT_FOUND')
    const bad = await call('catalog.saveProduct', { type: 'ACCESSORY', name: '', variants: [] })
    expect(bad.error?.code).toBe('VALIDATION')
    const sqlish = await call('catalog.saveProduct', { type: "ACCESSORY'; DROP TABLE Product;--", name: 'x', variants: [{ sellPrice: 1 }] })
    expect(sqlish.error?.code).toBe('VALIDATION')
    const extra = await call('auth.lock', { evil: true })
    expect(extra.error?.code).toBe('VALIDATION')
  })

  it('enforces permissions in the backend, whatever the UI shows', async () => {
    const roles = await t.app.users.listRoles()
    const cashierRole = roles.find((r) => r.systemKey === 'CASHIER')!
    await t.app.users.create({ username: 'cashier1', fullName: 'Cashier One', password: 'cashier-pass', roleId: cashierRole.id }, actor(t))
    await t.app.auth.logout()
    expect((await call('users.list')).error?.code).toBe('UNAUTHENTICATED')
    await t.app.auth.login({ username: 'cashier1', secret: 'cashier-pass', method: 'PASSWORD' })
    expect((await call('users.list')).error?.code).toBe('FORBIDDEN')
    expect((await call('settings.update', { group: 'pos', values: { allowNegativeStock: true } })).error?.code).toBe('FORBIDDEN')
    expect((await call('users.create', { username: 'evil', fullName: 'Evil User', password: 'whatever1', roleId: roles.find((r) => r.systemKey === 'OWNER')!.id })).error?.code).toBe('FORBIDDEN')
    await t.app.auth.logout()
    await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
  })

  it('blocks everything except unlock while the screen is locked', async () => {
    t.app.auth.lock()
    expect((await call('users.list')).error?.code).toBe('SESSION_LOCKED')
    await t.app.auth.unlock({ userId: actor(t).userId, secret: OWNER.pin, method: 'PIN' })
    expect((await call('users.list')).ok).toBe(true)
  })

  it('maps a locked database to DATABASE_BUSY instead of hanging or crashing', async () => {
    await rawQuery(t.app.db, 'PRAGMA busy_timeout = 300')
    const other = new Database(t.app.paths.database)
    other.exec('BEGIN EXCLUSIVE')
    try {
      const res = await call('catalog.saveProduct', { type: 'ACCESSORY', name: 'Blocked', variants: [{ sellPrice: 100 }] })
      expect(res.error?.code).toBe('DATABASE_BUSY')
    } finally {
      other.exec('ROLLBACK')
      other.close()
      await rawQuery(t.app.db, 'PRAGMA busy_timeout = 5000')
    }
    // and recovers once the lock is gone
    expect((await call('catalog.saveProduct', { type: 'ACCESSORY', name: 'After lock', variants: [{ sellPrice: 100 }] })).ok).toBe(true)
  })
})

describe('crash safety', () => {
  it('a sale retried after a restart is never recorded twice', async () => {
    await t.app.shifts.open(0, actor(t))
    const p = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Retry item', variants: [{ sellPrice: 500, openingStock: 5 }] }, actor(t))
    const input = { idempotencyKey: randomUUID(), kind: 'QUICK' as const, lines: [{ variantId: p.variants[0]!.id, qty: 2, unitPrice: 500 }], payments: [{ method: 'CASH' as const, amount: 1000 }] }
    const first = await t.app.sales.complete(input, actor(t))
    // "power cut": the app restarts and the cashier presses pay again
    t = await t.reopen()
    router = new ApiRouter(t.app)
    registerCoreHandlers(router, { appVersion: 'test', platform: 'test', openPath: async () => undefined, listPrinters: async () => [] })
    registerPosHandlers(router)
    await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
    const again = await t.app.sales.complete(input, actor(t))
    expect(again.id).toBe(first.id)
    const v = await t.app.catalog.getVariantItem(p.variants[0]!.id, true)
    expect(v.stockQty).toBe(3)
  })

  it('refuses to start on a corrupted database with a clear error', async () => {
    const ctx = await createTestApp()
    const dbPath = ctx.app.paths.database
    await ctx.close()
    writeFileSync(dbPath, Buffer.alloc(8192, 0x41))
    await expect(
      AppContext.create({ rootDir: ctx.dir, migrationsDir: MIGRATIONS, deviceName: 'x', platformName: 'x', licensePlatform: new FakeLicensePlatform(), logToFiles: false })
    ).rejects.toThrow(/not a database|integrity|malformed/i)
    cleanup(ctx)
  })
})
