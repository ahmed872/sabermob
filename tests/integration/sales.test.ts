import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CompleteSaleInput } from '@shared/schemas/sales'
import { actor, cleanup, createTestApp, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
beforeEach(async () => {
  t = await createTestApp()
  await setupOwner(t)
})
afterEach(async () => {
  await t.close()
  cleanup(t)
})

async function product(name: string, price: number, opts: { cost?: number; stock?: number; minPrice?: number; type?: 'ACCESSORY' | 'DEVICE'; serials?: string[] } = {}) {
  const p = await t.app.catalog.createProduct(
    {
      type: opts.type ?? 'ACCESSORY',
      name,
      trackSerials: !!opts.serials,
      variants: [{ sellPrice: price, costPrice: opts.cost ?? Math.round(price / 2), minPrice: opts.minPrice ?? null, openingStock: opts.serials ? 0 : (opts.stock ?? 10), serials: opts.serials, barcodes: [] }]
    },
    actor(t)
  )
  return p.variants[0]!.id
}

function sale(lines: CompleteSaleInput['lines'], payments: CompleteSaleInput['payments'], extra: Partial<CompleteSaleInput> = {}): CompleteSaleInput {
  return { idempotencyKey: randomUUID(), kind: 'QUICK', lines, payments, ...extra }
}

async function stockOf(variantId: string) {
  return (await t.app.db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty
}

async function cashierLogin() {
  const role = await t.app.db.role.findUniqueOrThrow({ where: { systemKey: 'CASHIER' } })
  await t.app.users.create({ username: 'mona', fullName: 'Mona', password: 'cashier1', roleId: role.id }, actor(t))
  await t.app.auth.login({ username: 'mona', secret: 'cashier1', method: 'PASSWORD' })
}

describe('completing sales', () => {
  it('requires an open shift by default', async () => {
    const v = await product('Case', 15000)
    await expect(t.app.sales.complete(sale([{ variantId: v, qty: 1, unitPrice: 15000 }], [{ method: 'CASH', amount: 15000 }]), actor(t))).rejects.toMatchObject({
      code: 'SHIFT_REQUIRED'
    })
  })

  it('sells for cash with change, reduces stock and records everything atomically', async () => {
    await t.app.shifts.open(50000, actor(t))
    const a = await product('Case', 15000)
    const b = await product('Glass', 5000)
    const s = await t.app.sales.complete(
      sale([{ variantId: a, qty: 2, unitPrice: 15000 }, { variantId: b, qty: 1, unitPrice: 5000 }], [{ method: 'CASH', amount: 40000 }]),
      actor(t)
    )
    expect(s.total).toBe(35000)
    expect(s.changeDue).toBe(5000)
    expect(s.paidTotal).toBe(35000)
    expect(s.number).toBe('S-000001')
    expect(s.payments).toEqual([expect.objectContaining({ method: 'CASH', amount: 35000 })])
    expect(await stockOf(a)).toBe(8)
    expect(await stockOf(b)).toBe(9)
    expect(await t.app.db.stockMovement.count({ where: { refId: s.id, type: 'SALE' } })).toBe(2)
    expect(await t.app.db.auditLog.count({ where: { action: 'sale.completed', entityId: s.id } })).toBe(1)
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(85000)
    expect(s.profit).toBe(35000 - 17500)
  })

  it('rolls back everything when stock is insufficient', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Case', 15000, { stock: 1 })
    const b = await product('Glass', 5000, { stock: 5 })
    await expect(
      t.app.sales.complete(sale([{ variantId: b, qty: 2, unitPrice: 5000 }, { variantId: a, qty: 3, unitPrice: 15000 }], [{ method: 'CASH', amount: 60000 }]), actor(t))
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 1 } })
    expect(await t.app.db.sale.count()).toBe(0)
    expect(await t.app.db.payment.count()).toBe(0)
    expect(await stockOf(b)).toBe(5)
    expect(await t.app.db.stockMovement.count({ where: { type: 'SALE' } })).toBe(0)
    // the sale number was not consumed
    const ok = await t.app.sales.complete(sale([{ variantId: b, qty: 1, unitPrice: 5000 }], [{ method: 'CASH', amount: 5000 }]), actor(t))
    expect(ok.number).toBe('S-000001')
  })

  it('is idempotent: retrying the same sale never charges or deducts twice', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Case', 15000)
    const input = sale([{ variantId: a, qty: 1, unitPrice: 15000 }], [{ method: 'CASH', amount: 15000 }])
    const first = await t.app.sales.complete(input, actor(t))
    const second = await t.app.sales.complete(input, actor(t))
    expect(second.id).toBe(first.id)
    expect(await t.app.db.sale.count()).toBe(1)
    expect(await t.app.db.payment.count()).toBe(1)
    expect(await stockOf(a)).toBe(9)
  })

  it('handles split card + cash payments and rejects card overpayment', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Charger', 30000)
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 30000 }], [{ method: 'CARD', amount: 20000 }, { method: 'CASH', amount: 20000 }]), actor(t))
    expect(s.changeDue).toBe(10000)
    expect(s.payments.map((p) => [p.method, p.amount])).toEqual([['CARD', 20000], ['CASH', 10000]])
    await expect(t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 30000 }], [{ method: 'CARD', amount: 31000 }]), actor(t))).rejects.toMatchObject({
      code: 'PAYMENT_MISMATCH'
    })
  })

  it('enforces cashier discount limits with manager approval', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Headphones', 100000, { cost: 40000 })
    await cashierLogin()
    // 10% is within the cashier limit
    const ok = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 100000, discount: { type: 'PERCENT', bp: 1000 } }], [{ method: 'CASH', amount: 90000 }]), actor(t))
    expect(ok.total).toBe(90000)
    // 30% needs approval
    const big = sale([{ variantId: a, qty: 1, unitPrice: 100000 }], [{ method: 'CASH', amount: 70000 }], { cartDiscount: { type: 'PERCENT', bp: 3000 } })
    await expect(t.app.sales.complete(big, actor(t))).rejects.toMatchObject({ code: 'OVERRIDE_REQUIRED', details: { discountBp: 3000 } })
    const { token } = await t.app.auth.requestOverride({ username: OWNER.username, secret: OWNER.pin, method: 'PIN', permission: 'apply_discount' })
    const approved = await t.app.sales.complete({ ...big, overrideToken: token }, actor(t))
    expect(approved.total).toBe(70000)
    expect(approved.approvedByName).toBe(OWNER.fullName)
  })

  it('requires approval for price edits and selling below the minimum price', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Power bank', 50000, { minPrice: 45000 })
    await cashierLogin()
    await expect(t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 40000 }], [{ method: 'CASH', amount: 40000 }]), actor(t))).rejects.toMatchObject({
      code: 'OVERRIDE_REQUIRED',
      details: { permissions: expect.arrayContaining(['edit_price', 'sell_below_min_price']) }
    })
    const { token } = await t.app.auth.requestOverride({
      username: OWNER.username,
      secret: OWNER.password,
      method: 'PASSWORD',
      permission: 'edit_price',
      permissions: ['sell_below_min_price']
    })
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 40000 }], [{ method: 'CASH', amount: 40000 }], { overrideToken: token }), actor(t))
    expect(s.total).toBe(40000)
  })

  it('sells on credit only to customers, tracks the debt and respects the credit limit', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Phone', 1000000, { cost: 800000 })
    await expect(t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 1000000 }], [{ method: 'CASH', amount: 600000 }]), actor(t))).rejects.toMatchObject({
      code: 'CREDIT_REQUIRES_CUSTOMER'
    })
    const c = await t.app.customers.save({ name: 'Ali', phone: '01012345678', creditLimit: 500000, tags: [] }, actor(t))
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 1000000 }], [{ method: 'CASH', amount: 600000 }], { customerId: c.id }), actor(t))
    expect(s.creditAmount).toBe(400000)
    expect(await t.app.customers.balance(c.id)).toBe(400000)
    await expect(
      t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 1000000 }], [{ method: 'CASH', amount: 800000 }], { customerId: c.id }), actor(t))
    ).rejects.toMatchObject({ code: 'CREDIT_LIMIT' })
    const res = await t.app.customers.collectDebt({ customerId: c.id, amount: 150000, method: 'CASH' }, actor(t))
    expect(res.balance).toBe(250000)
    const ledger = await t.app.customers.ledger(c.id)
    expect(ledger.map((l) => l.balanceAfter)).toEqual([250000, 400000])
    // collected cash is in the drawer
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(750000)
  })

  it('supports custom items and open-price services', async () => {
    await t.app.shifts.open(0, actor(t))
    const service = (await t.app.db.productVariant.findFirstOrThrow({ where: { product: { type: 'SERVICE' } } })).id
    const s = await t.app.sales.complete(
      sale([{ variantId: service, qty: 1, unitPrice: 25000 }, { variantId: null, name: 'SIM card', qty: 2, unitPrice: 2000 }], [{ method: 'CASH', amount: 29000 }]),
      actor(t)
    )
    expect(s.total).toBe(29000)
    expect(s.items.find((i) => i.name === 'SIM card')?.productType).toBe('CUSTOM')
  })

  it('applies inclusive VAT', async () => {
    await t.app.settings.update('taxes', { enabled: true, defaultTaxBp: 1400, pricesIncludeTax: true })
    await t.app.shifts.open(0, actor(t))
    const a = await product('Cable', 11400, { cost: 5000 })
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 11400 }], [{ method: 'CASH', amount: 11400 }]), actor(t))
    expect(s.taxTotal).toBe(1400)
    expect(s.total).toBe(11400)
    expect(s.profit).toBe(10000 - 5000)
  })

  it('sells and returns IMEI-tracked phones', async () => {
    await t.app.shifts.open(0, actor(t))
    const v = await product('iPhone 13', 2000000, { type: 'DEVICE', serials: ['356789012345678', '356789012345679'] })
    expect(await stockOf(v)).toBe(2)
    await expect(t.app.sales.complete(sale([{ variantId: v, qty: 1, unitPrice: 2000000 }], [{ method: 'CASH', amount: 2000000 }]), actor(t))).rejects.toMatchObject({
      code: 'VALIDATION'
    })
    const s = await t.app.sales.complete(sale([{ variantId: v, qty: 1, unitPrice: 2000000, serial: '356789012345678' }], [{ method: 'CASH', amount: 2000000 }]), actor(t))
    expect((await t.app.db.serialItem.findUniqueOrThrow({ where: { serial: '356789012345678' } })).status).toBe('SOLD')
    await expect(
      t.app.sales.complete(sale([{ variantId: v, qty: 1, unitPrice: 2000000, serial: '356789012345678' }], [{ method: 'CASH', amount: 2000000 }]), actor(t))
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    await t.app.sales.refund({ saleId: s.id, items: [{ saleItemId: s.items[0]!.id, qty: 1, restock: true }], method: 'CASH' }, actor(t))
    expect((await t.app.db.serialItem.findUniqueOrThrow({ where: { serial: '356789012345678' } })).status).toBe('IN_STOCK')
    expect(await stockOf(v)).toBe(2)
  })
})

describe('refunds and voids', () => {
  it('refunds partially then fully without ever exceeding the paid amount', async () => {
    await t.app.shifts.open(100000, actor(t))
    const a = await product('Cable', 3333)
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 3, unitPrice: 3333 }], [{ method: 'CASH', amount: 9999 }], { cartDiscount: { type: 'AMOUNT', amount: 1000 } }), actor(t))
    expect(s.total).toBe(8999)
    const item = s.items[0]!
    let after = await t.app.sales.refund({ saleId: s.id, items: [{ saleItemId: item.id, qty: 1 }], method: 'CASH' }, actor(t))
    expect(after.status).toBe('PARTIALLY_REFUNDED')
    expect(after.refundedTotal).toBe(3000)
    await expect(t.app.sales.refund({ saleId: s.id, items: [{ saleItemId: item.id, qty: 3 }], method: 'CASH' }, actor(t))).rejects.toMatchObject({ code: 'VALIDATION' })
    after = await t.app.sales.refund({ saleId: s.id, items: [{ saleItemId: item.id, qty: 2 }], method: 'CASH' }, actor(t))
    expect(after.status).toBe('REFUNDED')
    expect(after.refundedTotal).toBe(8999)
    expect(await stockOf(a)).toBe(10)
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(100000)
    expect(shift.refundsTotal).toBe(8999)
  })

  it('requires approval to refund when configured', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Case', 15000)
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 15000 }], [{ method: 'CASH', amount: 15000 }]), actor(t))
    await cashierLogin()
    await expect(t.app.sales.refund({ saleId: s.id, items: [{ saleItemId: s.items[0]!.id, qty: 1 }], method: 'CASH' }, actor(t))).rejects.toMatchObject({
      code: 'OVERRIDE_REQUIRED'
    })
  })

  it('voids a credit sale: stock back, cash back, debt cleared', async () => {
    await t.app.shifts.open(0, actor(t))
    const a = await product('Watch', 200000)
    const c = await t.app.customers.save({ name: 'Sara', phone: '01111111111', tags: [] }, actor(t))
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 200000 }], [{ method: 'CASH', amount: 50000 }], { customerId: c.id }), actor(t))
    const v = await t.app.sales.void({ saleId: s.id, reason: 'customer changed mind' }, actor(t))
    expect(v.status).toBe('VOIDED')
    expect(await stockOf(a)).toBe(10)
    expect(await t.app.customers.balance(c.id)).toBe(0)
    const shift = await t.app.shifts.summary((await t.app.shifts.currentShift())!.id)
    expect(shift.expectedCash).toBe(0)
    await expect(t.app.sales.void({ saleId: s.id, reason: 'again' }, actor(t))).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})

describe('shifts', () => {
  it('closes with the counted cash difference', async () => {
    await t.app.shifts.open(20000, actor(t))
    const a = await product('Case', 15000)
    await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 15000 }], [{ method: 'CASH', amount: 15000 }]), actor(t))
    await t.app.shifts.cashMovement({ type: 'PAY_OUT', amount: 5000, reason: 'tea' }, actor(t))
    await expect(t.app.shifts.cashMovement({ type: 'PAY_OUT', amount: 999999, reason: 'too much' }, actor(t))).rejects.toMatchObject({ code: 'INSUFFICIENT_CASH' })
    const closed = await t.app.shifts.close(29000, null, actor(t))
    expect(closed.expectedCash).toBe(30000)
    expect(closed.difference).toBe(-1000)
    expect(closed.status).toBe('CLOSED')
    expect(await t.app.shifts.currentShift()).toBeNull()
  })
})

describe('loyalty', () => {
  it('earns and redeems points', async () => {
    await t.app.settings.update('loyalty', { enabled: true, amountPerPoint: 1000, pointValue: 100, minRedeemPoints: 10 })
    await t.app.shifts.open(0, actor(t))
    const a = await product('Speaker', 50000)
    const c = await t.app.customers.save({ name: 'Omar', phone: '01222222222', tags: [] }, actor(t))
    await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 50000 }], [{ method: 'CASH', amount: 50000 }], { customerId: c.id }), actor(t))
    expect((await t.app.customers.get(c.id)).loyaltyPoints).toBe(50)
    const s = await t.app.sales.complete(sale([{ variantId: a, qty: 1, unitPrice: 50000 }], [{ method: 'CASH', amount: 45000 }], { customerId: c.id, redeemPoints: 50 }), actor(t))
    expect(s.payments.find((p) => p.method === 'POINTS')?.amount).toBe(5000)
    expect((await t.app.customers.get(c.id)).loyaltyPoints).toBe(45)
  })
})

describe('startup recovery', () => {
  it('repairs stock cache drift from the movement ledger', async () => {
    const a = await product('Case', 15000, { stock: 7 })
    await t.app.db.productVariant.update({ where: { id: a }, data: { stockQty: 999 } })
    const res = await t.app.sales.recoverOnStartup()
    expect(res.stockRepaired).toBe(1)
    expect(await stockOf(a)).toBe(7)
  })
})
