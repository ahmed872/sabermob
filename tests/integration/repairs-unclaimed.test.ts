import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
let screen: string
beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t, { starterCatalog: false })
  const a = actor(t)
  await t.app.shifts.open(0, a)
  screen = (await t.app.catalog.createProduct({ type: 'PART', name: 'Screen A54', variants: [{ sellPrice: 80000, costPrice: 50000, openingStock: 3 }] }, a)).variants[0]!.id
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

const stock = async () => (await t.app.db.productVariant.findUniqueOrThrow({ where: { id: screen } })).stockQty

describe('devices nobody collects', () => {
  it('"Not collected" takes the device off the board, keeps parts and deposit, and can still be delivered later', async () => {
    const a = actor(t)
    const statuses = await t.app.repairs.statuses()
    const id = (key: string) => statuses.find((s) => s.key === key)!.id
    expect(statuses.find((s) => s.key === 'UNCLAIMED')).toMatchObject({ isFinal: true, nameAr: 'لم يُستلم' })

    const r = await t.app.repairs.create({ customerName: 'Gone Customer', customerPhone: '01055555555', deviceModel: 'A54', complaint: 'screen', deposit: { amount: 20000, method: 'CASH' } }, a)
    await t.app.repairs.addPart({ repairId: r.id, variantId: screen, qty: 1, unitPrice: 80000 }, a)
    await t.app.repairs.update({ id: r.id, laborPrice: 20000 }, a)
    await t.app.repairs.changeStatus({ id: r.id, statusId: id('READY') }, a)
    expect(await stock()).toBe(2)

    await t.app.repairs.changeStatus({ id: r.id, statusId: id('UNCLAIMED') }, a)
    expect((await t.app.repairs.list({ open: true, page: 1, pageSize: 50 })).total).toBe(0)
    expect((await t.app.reports.dashboard(a)).pendingRepairs).toBe(0)
    expect(await stock()).toBe(2) // the new screen is inside the phone, not back on the shelf
    expect((await t.app.repairs.get(r.id, a)).paidTotal).toBe(20000) // the deposit is kept

    // Months later the customer shows up and pays the rest
    const done = await t.app.repairs.changeStatus({ id: r.id, statusId: id('DELIVERED'), payments: [{ method: 'CASH', amount: 80000 }] }, a)
    expect(done.statusKey).toBe('DELIVERED')
    expect(done.balanceDue).toBe(0)
    await expect(t.app.repairs.changeStatus({ id: r.id, statusId: id('READY') }, a)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})
