import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
beforeEach(async () => {
  t = await createTestApp()
  await setupOwner(t)
  await t.app.shifts.open(100000, actor(t))
})
afterEach(async () => {
  await t.close()
  cleanup(t)
})

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function product(name: string, cost: number, stock = 0, trackSerials = false) {
  const p = await t.app.catalog.createProduct(
    { type: trackSerials ? 'DEVICE' : 'PART', name, trackSerials, variants: [{ sellPrice: cost * 2, costPrice: cost, openingStock: stock, barcodes: [] }] },
    actor(t)
  )
  return p.variants[0]!.id
}
const stock = async (id: string) => (await t.app.db.productVariant.findUniqueOrThrow({ where: { id } })).stockQty
const cost = async (id: string) => (await t.app.db.productVariant.findUniqueOrThrow({ where: { id } })).costPrice

describe('suppliers & purchases', () => {
  it('receives a purchase, updates weighted cost, tracks what we owe, pays from the drawer', async () => {
    const battery = await product('iPhone 11 battery', 10000, 10)
    const s = await t.app.suppliers.save({ name: 'El-Nour Trading', phone: '01000000001' }, actor(t))
    const po = await t.app.suppliers.createPurchase(
      { supplierId: s.id, supplierInvoiceNo: 'INV-77', items: [{ variantId: battery, qty: 10, unitCost: 13000 }], receiveNow: true, payment: { amount: 50000, method: 'CASH' } },
      actor(t)
    )
    expect(po.status).toBe('RECEIVED')
    expect(po.total).toBe(130000)
    expect(po.paid).toBe(50000)
    expect(await stock(battery)).toBe(20)
    expect(await cost(battery)).toBe(11500) // (10×100 + 10×130) / 20
    expect(await t.app.suppliers.balance(s.id)).toBe(80000)
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(50000)
    await expect(t.app.suppliers.pay({ supplierId: s.id, amount: 60000, method: 'CASH' }, actor(t))).rejects.toMatchObject({ code: 'VALIDATION' })
    await t.app.suppliers.pay({ supplierId: s.id, amount: 80000, method: 'TRANSFER' }, actor(t))
    expect(await t.app.suppliers.balance(s.id)).toBe(0)
  })

  it('handles partial receiving with damaged units', async () => {
    const screen = await product('A55 screen', 50000)
    const s = await t.app.suppliers.save({ name: 'Parts Co' }, actor(t))
    const po = await t.app.suppliers.createPurchase({ supplierId: s.id, items: [{ variantId: screen, qty: 5, unitCost: 50000 }], receiveNow: false }, actor(t))
    expect(po.status).toBe('ORDERED')
    expect(await t.app.suppliers.balance(s.id)).toBe(0)
    const after = await t.app.suppliers.receive({ purchaseOrderId: po.id, items: [{ purchaseItemId: po.items[0]!.id, qtyReceived: 2, qtyDamaged: 1 }] }, actor(t))
    expect(after.status).toBe('PARTIAL')
    expect(await stock(screen)).toBe(2)
    expect(await t.app.suppliers.balance(s.id)).toBe(100000)
    await expect(t.app.suppliers.receive({ purchaseOrderId: po.id, items: [{ purchaseItemId: po.items[0]!.id, qtyReceived: 3 }] }, actor(t))).rejects.toMatchObject({ code: 'VALIDATION' })
    const done = await t.app.suppliers.receive({ purchaseOrderId: po.id, items: [{ purchaseItemId: po.items[0]!.id, qtyReceived: 2 }] }, actor(t))
    expect(done.status).toBe('RECEIVED')
    await expect(t.app.suppliers.cancelPurchase(po.id, actor(t))).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('returns goods to the supplier; supplier can end up owing us', async () => {
    const charger = await product('Charger', 8000)
    const s = await t.app.suppliers.save({ name: 'Acc Supplier' }, actor(t))
    const po = await t.app.suppliers.createPurchase({ supplierId: s.id, items: [{ variantId: charger, qty: 10, unitCost: 8000 }], payment: { amount: 80000, method: 'TRANSFER' } }, actor(t))
    await t.app.suppliers.returnToSupplier({ supplierId: s.id, purchaseOrderId: po.id, items: [{ variantId: charger, qty: 3, unitCost: 8000 }] }, actor(t))
    expect(await stock(charger)).toBe(7)
    expect(await t.app.suppliers.balance(s.id)).toBe(-24000)
    const ledger = await t.app.suppliers.ledger(s.id)
    expect(ledger[0]!.balanceAfter).toBe(-24000)
  })

  it('receives phones with IMEIs', async () => {
    const phone = await product('Galaxy A15', 600000, 0, true)
    const s = await t.app.suppliers.save({ name: 'Phones Dist' }, actor(t))
    await expect(t.app.suppliers.createPurchase({ supplierId: s.id, items: [{ variantId: phone, qty: 2, unitCost: 600000 }] }, actor(t))).rejects.toMatchObject({ code: 'VALIDATION' })
    await t.app.suppliers.createPurchase({ supplierId: s.id, items: [{ variantId: phone, qty: 2, unitCost: 600000 }], serials: { [phone]: ['351111111111111', '351111111111112'] } }, actor(t))
    expect(await stock(phone)).toBe(2)
    expect(await t.app.db.serialItem.count({ where: { variantId: phone, status: 'IN_STOCK' } })).toBe(2)
  })
})

describe('repairs', () => {
  it('runs the full repair workflow with parts, deposit, delivery, credit and warranty', async () => {
    const battery = await product('iPhone 11 battery', 15000, 3)
    const r = await t.app.repairs.create(
      {
        customerName: 'Hassan',
        customerPhone: '01099999999',
        deviceBrand: 'Apple',
        deviceModel: 'iPhone 11',
        imei: '353333333333333',
        complaint: 'Battery drains fast',
        accessories: ['CASE'],
        passcode: '1379',
        estimatedPrice: 60000,
        deposit: { amount: 20000, method: 'CASH' },
        signature: PNG,
        photos: [{ kind: 'BEFORE', dataUrl: PNG }]
      },
      actor(t)
    )
    expect(r.number).toBe('RP-0001')
    expect(r.statusKey).toBe('RECEIVED')
    expect(r.paidTotal).toBe(20000)
    expect(r.customerId).toBeTruthy()
    expect(r.photos).toHaveLength(1)
    const rel = (await t.app.db.repairPhoto.findFirstOrThrow()).filePath
    expect(existsSync(join(t.app.paths.media, rel))).toBe(true)
    expect(await t.app.repairs.revealPasscode(r.id, actor(t))).toBe('1379')
    const raw = await t.app.db.repair.findUniqueOrThrow({ where: { id: r.id } })
    expect(raw.devicePasscodeEnc).not.toContain('1379')

    let d = await t.app.repairs.addPart({ repairId: r.id, variantId: battery, qty: 1, unitPrice: 35000 }, actor(t))
    expect(await stock(battery)).toBe(2)
    d = await t.app.repairs.update({ id: r.id, laborPrice: 25000, diagnosis: 'Battery worn' }, actor(t))
    expect(d.finalPrice).toBe(60000)
    expect(d.balanceDue).toBe(40000)
    expect(d.profit).toBe(60000 - 15000)

    const statuses = await t.app.repairs.statuses()
    const ready = statuses.find((s) => s.key === 'READY')!
    const delivered = statuses.find((s) => s.key === 'DELIVERED')!
    await t.app.repairs.changeStatus({ id: r.id, statusId: ready.id }, actor(t))
    d = await t.app.repairs.changeStatus({ id: r.id, statusId: delivered.id, payments: [{ method: 'CASH', amount: 30000 }] }, actor(t))
    expect(d.statusKey).toBe('DELIVERED')
    expect(d.creditAmount).toBe(10000)
    expect(await t.app.customers.balance(d.customerId!)).toBe(10000)
    expect(d.underWarranty).toBe(true)
    await expect(t.app.repairs.changeStatus({ id: r.id, statusId: ready.id }, actor(t))).rejects.toMatchObject({ code: 'INVALID_STATE' })

    // shift: 100000 opening + 20000 deposit + 30000 at delivery
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(150000)

    // Customer comes back: warranty found by IMEI
    const matches = await t.app.repairs.checkWarranty({ imei: '353333333333333' })
    expect(matches[0]?.number).toBe('RP-0001')
    const claim = await t.app.repairs.create(
      { customerName: 'Hassan', customerPhone: '01099999999', deviceModel: 'iPhone 11', complaint: 'Battery again', parentRepairId: r.id },
      actor(t)
    )
    expect(claim.isWarrantyClaim).toBe(true)
    expect(claim.customerId).toBe(d.customerId)
  })

  it('cancelling returns parts to stock and refunds the deposit', async () => {
    const screen = await product('Screen', 40000, 1)
    const r = await t.app.repairs.create({ customerName: 'Mai', customerPhone: '01155555555', deviceModel: 'A54', complaint: 'Broken screen', deposit: { amount: 10000, method: 'CASH' } }, actor(t))
    await t.app.repairs.addPart({ repairId: r.id, variantId: screen, qty: 1 }, actor(t))
    expect(await stock(screen)).toBe(0)
    await expect(t.app.repairs.delete(r.id, actor(t))).rejects.toMatchObject({ code: 'INVALID_STATE' })
    const cancelled = (await t.app.repairs.statuses()).find((s) => s.key === 'CANCELLED')!
    const d = await t.app.repairs.changeStatus({ id: r.id, statusId: cancelled.id, refundDeposit: true }, actor(t))
    expect(await stock(screen)).toBe(1)
    expect(d.paidTotal).toBe(0)
    expect(d.parts[0]!.returnedAt).toBeTruthy()
  })

  it('rejects fake images', async () => {
    await expect(
      t.app.repairs.create({ customerName: 'X', customerPhone: '010', deviceModel: 'Y', complaint: 'Z', photos: [{ kind: 'BEFORE', dataUrl: 'data:image/png;base64,SGVsbG8=' }] }, actor(t))
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
