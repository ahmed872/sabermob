import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
let caseV: string, glassV: string, caseP: string, glassP: string
beforeEach(async () => {
  t = await createTestApp()
  await setupOwner(t)
  await t.app.shifts.open(0, actor(t))
  const c = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'iPhone 15 case', variants: [{ sellPrice: 15000, costPrice: 5000, openingStock: 10, barcodes: [] }] }, actor(t))
  const g = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'iPhone 15 glass', variants: [{ sellPrice: 10000, costPrice: 3000, openingStock: 10, barcodes: [] }] }, actor(t))
  caseV = c.variants[0]!.id
  glassV = g.variants[0]!.id
  caseP = c.id
  glassP = g.id
})
afterEach(async () => {
  await t.close()
  cleanup(t)
})

async function cashier() {
  const role = await t.app.db.role.findUniqueOrThrow({ where: { systemKey: 'CASHIER' } })
  await t.app.db.role.update({ where: { id: role.id }, data: { maxDiscountBp: 0 } })
  await t.app.users.create({ username: 'mona', fullName: 'Mona', password: 'cashier1', roleId: role.id }, actor(t))
  await t.app.auth.login({ username: 'mona', secret: 'cashier1', method: 'PASSWORD' })
}

describe('smart offers', () => {
  it('suggests, applies at checkout (validated server-side) and records analytics', async () => {
    const offer = await t.app.offers.save(
      { name: 'Glass with case 20%', type: 'CROSS_SELL', discountBp: 2000, triggers: { productIds: [caseP], categoryIds: [] }, targets: { productIds: [glassP], categoryIds: [] } },
      actor(t)
    )
    await cashier()
    const s = await t.app.offers.suggest({ lines: [{ variantId: caseV, qty: 1, unitPrice: 15000 }] })
    expect(s.suggestions[0]).toMatchObject({ variantId: glassV, offerPrice: 8000, offerId: offer.id })

    // Cashier has 0% discount limit, but owner-configured offers still apply.
    const sale = await t.app.sales.complete(
      {
        idempotencyKey: randomUUID(),
        kind: 'QUICK',
        lines: [
          { variantId: caseV, qty: 1, unitPrice: 15000 },
          // the screen claims a bigger discount — the server ignores it
          { variantId: glassV, qty: 1, unitPrice: 10000, offerId: offer.id, discount: { type: 'AMOUNT', amount: 9000 } }
        ],
        payments: [{ method: 'CASH', amount: 23000 }],
        offerEvents: [
          { offerId: offer.id, source: 'OFFER', event: 'SHOWN', productId: glassP },
          { offerId: offer.id, source: 'OFFER', event: 'ACCEPTED', productId: glassP }
        ]
      },
      actor(t)
    )
    expect(sale.total).toBe(23000)
    expect(sale.items[1]!.discount).toBe(2000)
    const stats = await t.app.offers.analytics()
    const row = stats.find((x) => x.offerId === offer.id)!
    expect(row).toMatchObject({ shown: 1, accepted: 1, converted: 1, discountCost: 2000, revenue: 8000 })
    expect((await t.app.db.offer.findUniqueOrThrow({ where: { id: offer.id } })).usageCount).toBe(1)
  })

  it('an offer without its trigger in the cart becomes a manual discount (and needs approval)', async () => {
    const offer = await t.app.offers.save(
      { name: 'Glass with case', type: 'CROSS_SELL', discountBp: 2000, triggers: { productIds: [caseP], categoryIds: [] }, targets: { productIds: [glassP], categoryIds: [] } },
      actor(t)
    )
    await cashier()
    await expect(
      t.app.sales.complete(
        { idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: glassV, qty: 1, unitPrice: 10000, offerId: offer.id, discount: { type: 'AMOUNT', amount: 2000 } }], payments: [{ method: 'CASH', amount: 8000 }] },
        actor(t)
      )
    ).rejects.toMatchObject({ code: 'OVERRIDE_REQUIRED' })
  })

  it('learns products bought together', async () => {
    for (let i = 0; i < 2; i++) {
      await t.app.sales.complete(
        { idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: caseV, qty: 1, unitPrice: 15000 }, { variantId: glassV, qty: 1, unitPrice: 10000 }], payments: [{ method: 'CASH', amount: 25000 }] },
        actor(t)
      )
    }
    const s = await t.app.offers.suggest({ lines: [{ variantId: caseV, qty: 1, unitPrice: 15000 }] })
    expect(s.suggestions[0]).toMatchObject({ source: 'AFFINITY', variantId: glassV, offerPrice: 10000 })
  })

  it('auto-applies quantity discounts and respects the margin floor', async () => {
    await t.app.offers.save({ name: '3+ cases 10%', type: 'QTY_DISCOUNT', autoApply: true, minQty: 3, discountBp: 1000, targets: { productIds: [caseP], categoryIds: [] } }, actor(t))
    const r = await t.app.offers.suggest({ lines: [{ variantId: caseV, qty: 3, unitPrice: 15000 }] })
    expect(r.autoApply[0]).toMatchObject({ variantId: caseV, discount: { type: 'AMOUNT', amount: 4500 } })
  })
})
