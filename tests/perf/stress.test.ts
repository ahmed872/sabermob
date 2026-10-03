/**
 * Stress dataset: ≥10,000 products, ≥100,000 sale lines, ≥5,000 customers,
 * ≥5,000 repairs. A realistic base is created through the real services,
 * then multiplied with SQL (new ids, remapped foreign keys, unique values
 * suffixed, dates spread over the past year). Then common workflows are timed.
 */
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
const timings: Array<[string, number]> = []
async function timed<T>(label: string, fn: () => Promise<T>, budgetMs: number): Promise<T> {
  const start = performance.now()
  const out = await fn()
  const ms = Math.round(performance.now() - start)
  timings.push([label, ms])
  expect(ms, `${label} took ${ms} ms (budget ${budgetMs})`).toBeLessThan(budgetMs)
  return out
}

/** Doubles the rows of `table` (optionally a subset) with fresh ids. */
function cloneTable(db: Database.Database, table: string, round: number, fk: Record<string, string>, where = '1=1') {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; type: string }>
  const unique = new Set<string>()
  for (const idx of db.prepare(`PRAGMA index_list("${table}")`).all() as Array<{ name: string; unique: number; origin: string }>) {
    if (!idx.unique || idx.origin === 'pk') continue
    for (const c of db.prepare(`PRAGMA index_info("${idx.name}")`).all() as Array<{ name: string }>) unique.add(c.name)
  }
  db.exec(`DROP TABLE IF EXISTS "map_${table}"; CREATE TEMP TABLE "map_${table}" (old TEXT PRIMARY KEY, new TEXT);
           INSERT INTO "map_${table}" SELECT id, lower(hex(randomblob(16))) FROM "${table}" WHERE ${where};`)
  const expr = cols.map(({ name, type }) => {
    const c = `T."${name}"`
    if (name === 'id') return 'M.new'
    if (fk[name]) return `COALESCE((SELECT new FROM "map_${fk[name]}" WHERE old = ${c}), ${c})`
    if (unique.has(name) && /TEXT/i.test(type)) return `CASE WHEN ${c} IS NULL THEN NULL ELSE ${c} || '-r${round}' END`
    if (/DATETIME/i.test(type) && name !== 'deletedAt') return `CASE WHEN ${c} IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%f', ${c}, '-' || (abs(random()) % 360) || ' days') || '+00:00' END`
    return c
  })
  db.exec(`INSERT INTO "${table}" (${cols.map((c) => `"${c.name}"`).join(',')}) SELECT ${expr.join(',')} FROM "${table}" T JOIN "map_${table}" M ON M.old = T.id`)
}

const counts = (db: Database.Database) =>
  Object.fromEntries(['Product', 'ProductVariant', 'Customer', 'Sale', 'SaleItem', 'Repair'].map((tb) => [tb, (db.prepare(`SELECT COUNT(*) n FROM "${tb}"`).get() as { n: number }).n]))

let sizes: Record<string, number> = {}

beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t, { starterCatalog: false })
  const a = actor(t)
  await t.app.shifts.open(0, a)
  // ── base through the real services ──
  const variants: string[] = []
  const words = ['جراب', 'اسكرينة', 'شاحن', 'كابل', 'سماعة', 'باور بانك', 'Case', 'Glass', 'Charger', 'Cable']
  const models = ['iPhone 15', 'iPhone 13', 'A54', 'A15', 'Redmi 13', 'Note 12', 'Reno 8', 'Y9', 'Spark 10', 'Camon 20']
  for (let i = 0; i < 313; i++) {
    const p = await t.app.catalog.createProduct(
      { type: 'ACCESSORY', name: `${words[i % 10]} ${models[(i * 7) % 10]} ${i}`, variants: [{ sellPrice: 5000 + (i % 50) * 1000, costPrice: 3000 + (i % 50) * 500, openingStock: 100000, barcodes: [`62${String(1000000000 + i).padStart(11, '0')}`] }] },
      a
    )
    variants.push(p.variants[0]!.id)
  }
  const customers: string[] = []
  for (let i = 0; i < 157; i++) customers.push((await t.app.customers.save({ name: `عميل ${i}`, phone: `010${String(10000000 + i * 37).slice(0, 8)}` }, a)).id)
  for (let i = 0; i < 392; i++) {
    const lines = Array.from({ length: 1 + (i % 4) }, (_, k) => ({ variantId: variants[(i * 13 + k * 7) % variants.length]!, qty: 1 + (k % 2), unitPrice: 5000 + ((i + k) % 50) * 1000 }))
    const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
    await t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines, payments: [{ method: i % 3 ? 'CASH' : 'CARD', amount: total }], customerId: i % 5 ? null : customers[i % customers.length] }, a)
  }
  const statuses = await t.app.repairs.statuses()
  for (let i = 0; i < 157; i++) {
    const r = await t.app.repairs.create({ customerName: `عميل صيانة ${i}`, customerPhone: `011${String(20000000 + i * 41).slice(0, 8)}`, deviceModel: models[i % 10]!, complaint: 'شاشة' }, a)
    if (i % 3 === 0) await t.app.repairs.changeStatus({ id: r.id, statusId: statuses.find((s) => s.key === 'REPAIRING')!.id }, a)
  }
  // ── multiply with SQL ──
  const db = new Database(t.app.paths.database)
  db.pragma('busy_timeout = 10000')
  const tx = db.transaction((round: number) => {
    if (round <= 5) {
      cloneTable(db, 'Product', round, {})
      cloneTable(db, 'ProductVariant', round, { productId: 'Product' })
      cloneTable(db, 'Barcode', round, { variantId: 'ProductVariant' })
      cloneTable(db, 'StockMovement', round, { variantId: 'ProductVariant' }, `type = 'OPENING'`)
    }
    if (round <= 5) cloneTable(db, 'Customer', round, {})
    cloneTable(db, 'Sale', round, { customerId: 'Customer' })
    cloneTable(db, 'SaleItem', round, { saleId: 'Sale' })
    cloneTable(db, 'Payment', round, { saleId: 'Sale', customerId: 'Customer' }, `kind = 'SALE'`)
    if (round <= 5) {
      cloneTable(db, 'Repair', round, { customerId: 'Customer' })
      cloneTable(db, 'RepairStatusHistory', round, { repairId: 'Repair' })
    }
  })
  for (let round = 1; round <= 7; round++) tx(round)
  db.exec(`UPDATE Counter SET value = value + 1000000`)
  // keep the stock cache equal to the movement ledger (as the app maintains it)
  db.exec(`UPDATE ProductVariant SET stockQty = (SELECT COALESCE(SUM(qty), 0) FROM StockMovement m WHERE m.variantId = ProductVariant.id)`)
  sizes = counts(db)
  db.close()
  // the app re-opens on the big database (startup reconciliation included)
  t = await timed('Cold start on the big database (migrations check + stock reconciliation)', () => t.reopen(), 15000)
  await t.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
}, 600_000)

afterAll(async () => {
  console.log('[stress] dataset ' + JSON.stringify(sizes))
  console.log('[stress] timings (ms)\n' + timings.map(([l, ms]) => `  ${String(ms).padStart(6)}  ${l}`).join('\n'))
  await t.close()
  cleanup(t)
})

describe('stress dataset', () => {
  it('meets the minimum sizes', () => {
    expect(sizes.Product).toBeGreaterThanOrEqual(10000)
    expect(sizes.SaleItem).toBeGreaterThanOrEqual(100000)
    expect(sizes.Customer).toBeGreaterThanOrEqual(5000)
    expect(sizes.Repair).toBeGreaterThanOrEqual(5000)
  })

  it('keeps common workflows fast', async () => {
    const a = actor(t)
    const year = { from: new Date(Date.now() - 366 * 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() }
    await timed('Login (password, bcrypt)', async () => {
      await t.app.auth.logout()
      await t.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
    }, 1500)
    const hits = await timed('POS search "جراب iphone"', () => t.app.catalog.posSearch({ q: 'جراب iphone' }, true), 300)
    expect(hits.length).toBeGreaterThan(0)
    await timed('Barcode scan lookup', () => t.app.catalog.findByCode('6200001000017', true), 100)
    await timed('Inventory list page (search "charger")', () => t.app.catalog.listVariants({ q: 'charger', page: 1, pageSize: 50 }, true), 500)
    await timed('Complete a 3-line sale', () => t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: hits[0]!.variantId, qty: 1, unitPrice: hits[0]!.sellPrice }, { variantId: hits[1]!.variantId, qty: 2, unitPrice: hits[1]!.sellPrice }, { variantId: hits[2]!.variantId, qty: 1, unitPrice: hits[2]!.sellPrice }], payments: [{ method: 'CASH', amount: hits[0]!.sellPrice + 2 * hits[1]!.sellPrice + hits[2]!.sellPrice }] }, a), 500)
    await timed('Owner dashboard', () => t.app.reports.dashboard(a), 2000)
    await timed('Sales report — full year by month', () => t.app.reports.sales(year, 'month', a), 3000)
    await timed('Profit report — full year', () => t.app.reports.profit(year, 'month'), 3000)
    await timed('Inventory report (valuation, dead/fast/slow)', () => t.app.reports.inventory(a), 3000)
    await timed('Employees report — full year', () => t.app.reports.employees(year), 3000)
    await timed('Repairs report — full year', () => t.app.reports.repairs(year, a), 3000)
    await timed('Customer search by phone', () => t.app.customers.list({ q: '0101', page: 1, pageSize: 50 }), 500)
    await timed('Repairs list (open)', () => t.app.repairs.list({ page: 1, pageSize: 100, open: true }), 1000)
    await timed('Global search (Ctrl+K)', () => t.app.reports.search('iphone', a), 1000)
    await timed('Sales history page', () => t.app.sales.list({ page: 1, pageSize: 50 }, a), 1000)
  })

  it('backs up the big database in reasonable time', async () => {
    await t.app.backup.setPassword('stress-pass-1', null)
    const rec = await timed('Encrypted backup of the full dataset', () => t.app.backup.create('MANUAL', null), 60000)
    console.log(`[stress] backup size ${(rec.sizeBytes / 1024 / 1024).toFixed(1)} MB`)
    await timed('Backup verification (decrypt + integrity check)', () => t.app.backup.verify(rec.id), 60000)
  })
})
