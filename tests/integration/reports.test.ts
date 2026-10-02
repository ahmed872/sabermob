import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { toCsv, toXlsx } from '@main/services/export-service'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
const range = () => ({ from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() })

beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t)
  await t.app.shifts.open(0, actor(t))
  const cat = await t.app.catalog.saveCategory({ name: 'Chargers' }, actor(t))
  const p = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Charger', categoryId: cat.id, variants: [{ sellPrice: 20000, costPrice: 12000, openingStock: 20, barcodes: [] }] }, actor(t))
  const v = p.variants[0]!.id
  const s1 = await t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: v, qty: 3, unitPrice: 20000 }], payments: [{ method: 'CASH', amount: 60000 }] }, actor(t))
  await t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: v, qty: 1, unitPrice: 20000 }], payments: [{ method: 'CARD', amount: 20000 }] }, actor(t))
  // one unit returned
  await t.app.sales.refund({ saleId: s1.id, items: [{ saleItemId: s1.items[0]!.id, qty: 1 }], method: 'CASH' }, actor(t))
  // a voided sale must not count
  const s3 = await t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: v, qty: 5, unitPrice: 20000 }], payments: [{ method: 'CASH', amount: 100000 }] }, actor(t))
  await t.app.sales.void({ saleId: s3.id, reason: 'mistake' }, actor(t))
  // a delivered repair
  const r = await t.app.repairs.create({ customerName: 'A', customerPhone: '01000000009', deviceModel: 'X', complaint: 'Y' }, actor(t))
  await t.app.repairs.update({ id: r.id, laborPrice: 30000 }, actor(t))
  const delivered = (await t.app.repairs.statuses()).find((s) => s.key === 'DELIVERED')!
  await t.app.repairs.changeStatus({ id: r.id, statusId: delivered.id, payments: [{ method: 'CASH', amount: 30000 }] }, actor(t))
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

describe('reports', () => {
  it('computes net sales and profit after returns, excluding voided sales', async () => {
    const r = await t.app.reports.sales(range(), 'day', actor(t))
    expect(r.totals.count).toBe(2)
    expect(r.totals.revenue).toBe(60000) // 3 units sold kept (2 + 1)
    expect(r.totals.refunds).toBe(20000 + 100000)
    expect(r.totals.profit).toBe(3 * (20000 - 12000))
    expect(r.byCategory[0]).toMatchObject({ name: 'Chargers', qty: 3 })
    expect(r.series).toHaveLength(1)
  })

  it('splits profit into products and repairs', async () => {
    const p = await t.app.reports.profit(range(), 'day')
    expect(p.productProfit).toBe(24000)
    expect(p.repairProfit).toBe(30000)
    expect(p.grossProfit).toBe(54000)
  })

  it('builds the owner dashboard', async () => {
    const d = await t.app.reports.dashboard(actor(t))
    expect(d.today.sales).toBe(60000)
    expect(d.today.profit).toBe(24000)
    expect(d.trend).toHaveLength(14)
    expect(d.topProducts[0]).toMatchObject({ name: 'Charger', qty: 3 })
  })

  it('reports repairs, suppliers and employees', async () => {
    const rep = await t.app.reports.repairs(range(), actor(t))
    expect(rep.delivered).toBe(1)
    expect(rep.revenue).toBe(30000)
    const emp = await t.app.reports.employees(range())
    expect(emp.rows[0]).toMatchObject({ sales: 2, voids: 1 })
    const inv = await t.app.reports.inventory(actor(t))
    expect(inv.valuation.units).toBe(17)
  })

  it('finds anything with global search', async () => {
    const res = await t.app.reports.search('01000000009', actor(t))
    expect(res.repairs).toHaveLength(1)
    expect(res.customers).toHaveLength(1)
    expect((await t.app.reports.search('charger', actor(t))).products).toHaveLength(1)
    expect((await t.app.reports.search('S-000001', actor(t))).sales).toHaveLength(1)
  })

  it('exports CSV (with BOM for Arabic) and Excel', async () => {
    const table = { title: 'تقرير', columns: [{ key: 'n', header: 'الاسم' }, { key: 'v', header: 'القيمة', type: 'money' as const }], rows: [{ n: 'شاحن', v: 12345 }] }
    const csv = toCsv(table, 2).toString('utf8')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('شاحن,123.45')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await toXlsx(table, 2, true)) as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]!
    expect(ws.getRow(2).getCell(2).value).toBe(123.45)
    expect(ws.views[0]?.rightToLeft).toBe(true)
  })
})
