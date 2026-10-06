/**
 * Phones tracked by IMEI whose stock was entered by count (no IMEIs registered):
 * they sell without an IMEI or with one typed at the counter; registered IMEIs
 * still sell by number; once only registered units are left an IMEI is required.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
let phone: string
beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t, { starterCatalog: false })
  const a = actor(t)
  await t.app.shifts.open(0, a)
  const p = await t.app.catalog.createProduct(
    { type: 'DEVICE', name: 'iPhone 15', trackSerials: true, variants: [{ sellPrice: 4000000, costPrice: 3500000, serials: ['356000000000011', '356000000000029'] }] },
    a
  )
  phone = p.variants[0]!.id
  // the shop counted 5 on the shelf: 3 of them have no IMEI in the system
  await t.app.inventory.adjust({ type: 'COUNT', items: [{ variantId: phone, qty: 5 }] }, a)
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

const stock = async () => (await t.app.db.productVariant.findUniqueOrThrow({ where: { id: phone } })).stockQty
const sell = (line: { qty: number; serial?: string }) =>
  t.app.sales.complete({ idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: phone, unitPrice: 4000000, ...line }], payments: [{ method: 'CASH', amount: 4000000 * line.qty }] }, actor(t))

describe('phones without a registered IMEI', () => {
  it('sell by count, by a typed IMEI, then only by registered IMEI', async () => {
    await sell({ qty: 2 }) // two phones on one line, no IMEI
    expect(await stock()).toBe(3)

    const typed = await sell({ qty: 1, serial: '356999999999990' }) // IMEI typed at the counter is recorded
    expect(typed.items[0]!.serial).toBe('356999999999990')
    expect(await t.app.db.serialItem.findUnique({ where: { serial: '356999999999990' } })).toMatchObject({ status: 'SOLD', variantId: phone })
    expect(await stock()).toBe(2)

    // only the two registered phones are left: an IMEI is now required, with a clear error
    await expect(sell({ qty: 1 })).rejects.toMatchObject({ code: 'SERIAL_REQUIRED', details: { name: 'iPhone 15' } })
    await expect(sell({ qty: 1, serial: '356111111111111' })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    await sell({ qty: 1, serial: '356000000000011' })
    expect(await stock()).toBe(1)

    // the phone sold with a typed IMEI comes back: it is in stock under that IMEI
    await t.app.sales.refund({ saleId: typed.id, items: [{ saleItemId: typed.items[0]!.id, qty: 1 }], method: 'CASH' }, actor(t))
    expect(await t.app.db.serialItem.findUnique({ where: { serial: '356999999999990' } })).toMatchObject({ status: 'IN_STOCK' })
    expect(await stock()).toBe(2)
  })
})
