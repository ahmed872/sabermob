import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t)
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

async function makeCase(name = 'Silicone Case', barcode = '6221234567890') {
  const brand = await t.app.catalog.saveBrand({ name: `Brand ${name}` }, actor(t))
  const model = await t.app.catalog.saveModel({ brandId: brand.id, name: 'Galaxy A55', aliases: 'SM-A556' }, actor(t))
  return t.app.catalog.createProduct(
    {
      type: 'ACCESSORY',
      name,
      brandId: brand.id,
      deviceModelId: model.id,
      variants: [
        { name: 'Black', sellPrice: 15000, costPrice: 6000, minPrice: 12000, barcodes: [barcode], openingStock: 10 },
        { name: 'Blue', sellPrice: 15000, costPrice: 6000, barcodes: [], openingStock: 2 }
      ]
    },
    actor(t)
  )
}

describe('catalog', () => {
  it('creates products with variants, barcodes and opening stock movements', async () => {
    const p = await makeCase()
    expect(p.variants).toHaveLength(2)
    expect(p.variants[0]!.isDefault).toBe(true)
    expect(p.variants[0]!.stockQty).toBe(10)
    const moves = await t.app.db.stockMovement.findMany({ where: { variantId: p.variants[0]!.id } })
    expect(moves).toHaveLength(1)
    expect(moves[0]!.type).toBe('OPENING')
    expect(moves[0]!.balanceAfter).toBe(10)
  })

  it('finds products by model alias, partial text, Arabic normalization and barcode', async () => {
    await t.app.catalog.createProduct(
      { type: 'ACCESSORY', name: 'اسكرينة زجاج A55', variants: [{ sellPrice: 5000, barcodes: [], openingStock: 3 }] },
      actor(t)
    )
    const byModel = await t.app.catalog.posSearch({ q: 'a55' }, true)
    expect(byModel.length).toBeGreaterThanOrEqual(3)
    expect((await t.app.catalog.posSearch({ q: 'sm-a556' }, true)).length).toBeGreaterThanOrEqual(2)
    expect((await t.app.catalog.posSearch({ q: 'سكرين' }, true)).length).toBe(1)
    expect((await t.app.catalog.posSearch({ q: 'إسكرينه' }, true)).length).toBe(1) // hamza & taa marbuta variants
    const scan = await t.app.catalog.findByCode('6221234567890', true)
    expect(scan?.variantName).toBe('Black')
    expect(await t.app.catalog.findByCode('0000000000000', true)).toBeNull()
  })

  it('rejects duplicate barcodes with a friendly error', async () => {
    await expect(makeCase('Another', '6221234567890')).rejects.toMatchObject({ code: 'DUPLICATE_BARCODE' })
    // nothing half-created
    expect(await t.app.db.product.count({ where: { name: 'Another' } })).toBe(0)
  })

  it('audits price changes and never changes stock through edits', async () => {
    const p = await makeCase('Leather Case', '6229999999991')
    await t.app.catalog.updateProduct(
      {
        id: p.id,
        type: 'ACCESSORY',
        name: 'Leather Case',
        variants: p.variants.map((v) => ({ id: v.id, name: v.name, sellPrice: 17500, costPrice: v.costPrice ?? 0, barcodes: v.barcodes, openingStock: 999 }))
      },
      actor(t)
    )
    const after = await t.app.catalog.getProduct(p.id, true)
    expect(after.variants[0]!.sellPrice).toBe(17500)
    expect(after.variants[0]!.stockQty).toBe(10)
    expect(await t.app.db.auditLog.count({ where: { action: 'product.price_changed' } })).toBe(2)
  })

  it('generates valid unique EAN-13 internal barcodes', async () => {
    const a = await t.app.catalog.generateBarcode()
    const b = await t.app.catalog.generateBarcode()
    expect(a).toMatch(/^20\d{11}$/)
    expect(a).not.toBe(b)
  })
})

describe('inventory', () => {
  it('records counts, damage and blocks negative stock', async () => {
    const p = await makeCase('Clear Case', '6221111111111')
    const v = p.variants[0]!
    await t.app.inventory.adjust({ type: 'COUNT', items: [{ variantId: v.id, qty: 7 }] }, actor(t))
    await t.app.inventory.adjust({ type: 'DAMAGED', note: 'broken', items: [{ variantId: v.id, qty: 2 }] }, actor(t))
    const after = await t.app.catalog.getProduct(p.id, true)
    expect(after.variants[0]!.stockQty).toBe(5)
    await expect(t.app.inventory.adjust({ type: 'LOST', items: [{ variantId: v.id, qty: 50 }] }, actor(t))).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK'
    })
    const mv = await t.app.inventory.movements({ variantId: v.id }, true)
    expect(mv.items.map((m) => m.type)).toEqual(['DAMAGED', 'ADJUSTMENT', 'OPENING'])
    expect(await t.app.inventory.verifyLedger()).toEqual([])
  })

  it('reports alerts and valuation', async () => {
    const alerts = await t.app.inventory.alerts()
    expect(alerts.low).toBeGreaterThanOrEqual(1) // Blue variants have 2 ≤ minStock 2
    const val = await t.app.inventory.valuation()
    expect(val.costValue).toBeGreaterThan(0)
  })

  it('refuses to delete products with stock', async () => {
    const p = await makeCase('Stocked', '6227777777777')
    await expect(t.app.catalog.deleteProduct(p.id, actor(t))).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})

describe('performance', () => {
  it('searches 20,000 products quickly', async () => {
    const db = t.app.db
    const now = new Date().toISOString()
    // bulk insert through raw SQL for speed
    await db.$transaction(async (tx) => {
      for (let i = 0; i < 20000; i++) {
        const pid = `perf-p-${i}`
        await tx.$executeRawUnsafe(
          `INSERT INTO Product (id, type, name, trackStock, trackSerials, isFavorite, isActive, createdAt, updatedAt, version, deviceId) VALUES (?, 'ACCESSORY', ?, 1, 0, 0, 1, ?, ?, 1, '')`,
          pid,
          `Perf product ${i} model X${i % 300}`,
          now,
          now
        )
        await tx.$executeRawUnsafe(
          `INSERT INTO ProductVariant (id, productId, isDefault, costPrice, sellPrice, stockQty, minStock, searchText, createdAt, updatedAt, version, deviceId) VALUES (?, ?, 1, 100, 200, 5, 1, ?, ?, ?, 1, '')`,
          `perf-v-${i}`,
          pid,
          ` perf product ${i} model x${i % 300} `,
          now,
          now
        )
        await tx.$executeRawUnsafe(`INSERT INTO Barcode (id, code, variantId, isInternal, createdAt) VALUES (?, ?, ?, 0, ?)`, `perf-b-${i}`, `99${String(i).padStart(11, '0')}`, `perf-v-${i}`, now)
      }
    })
    let t0 = performance.now()
    const r = await t.app.catalog.posSearch({ q: 'x123' }, true)
    const searchMs = performance.now() - t0
    expect(r.length).toBeGreaterThan(0)
    t0 = performance.now()
    const hit = await t.app.catalog.findByCode('9900000015000', true)
    const scanMs = performance.now() - t0
    expect(hit?.productId).toBe('perf-p-15000')
    t0 = performance.now()
    const page = await t.app.catalog.listVariants({ q: 'perf', page: 3, pageSize: 50 }, true)
    const listMs = performance.now() - t0
    expect(page.total).toBe(20000)
    console.log(`search ${searchMs.toFixed(1)}ms, scan ${scanMs.toFixed(1)}ms, list ${listMs.toFixed(1)}ms`)
    expect(searchMs).toBeLessThan(100)
    expect(scanMs).toBeLessThan(20)
    expect(listMs).toBeLessThan(150)
  })
})
