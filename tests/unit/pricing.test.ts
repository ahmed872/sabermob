import { describe, expect, it } from 'vitest'
import { priceCart, settlePayments, taxFromInclusive } from '@shared/domain/pricing'

const line = (key: string, unitPrice: number, qty = 1, extra: Record<string, unknown> = {}) => ({
  key,
  unitPrice,
  qty,
  unitCost: Math.round(unitPrice / 2),
  taxBp: 0,
  ...extra
})

describe('priceCart', () => {
  it('sums a simple cart', () => {
    const r = priceCart({ lines: [line('a', 10000, 2), line('b', 5000)], pricesIncludeTax: true })
    expect(r.subtotal).toBe(25000)
    expect(r.total).toBe(25000)
    expect(r.discountTotal).toBe(0)
    expect(r.itemCount).toBe(3)
    expect(r.costTotal).toBe(12500)
    expect(r.profit).toBe(12500)
  })

  it('applies line percent and fixed discounts', () => {
    const r = priceCart({
      lines: [line('a', 10000, 1, { discount: { type: 'PERCENT', bp: 1000 } }), line('b', 5000, 1, { discount: { type: 'AMOUNT', amount: 700 } })],
      pricesIncludeTax: true
    })
    expect(r.lines[0]!.net).toBe(9000)
    expect(r.lines[1]!.net).toBe(4300)
    expect(r.total).toBe(13300)
    expect(r.discountTotal).toBe(1700)
  })

  it('caps discounts at the line amount', () => {
    const r = priceCart({ lines: [line('a', 1000, 1, { discount: { type: 'AMOUNT', amount: 5000 } })], pricesIncludeTax: true })
    expect(r.total).toBe(0)
    expect(r.discountTotal).toBe(1000)
  })

  it('allocates a cart discount across lines exactly', () => {
    const r = priceCart({
      lines: [line('a', 3333), line('b', 3333), line('c', 3334)],
      cartDiscount: { type: 'AMOUNT', amount: 1000 },
      pricesIncludeTax: true
    })
    expect(r.cartDiscountTotal).toBe(1000)
    expect(r.lines.reduce((a, l) => a + l.cartDiscount, 0)).toBe(1000)
    expect(r.total).toBe(9000)
  })

  it('extracts inclusive tax (14%)', () => {
    const r = priceCart({ lines: [line('a', 11400, 1, { taxBp: 1400 })], pricesIncludeTax: true })
    expect(r.taxTotal).toBe(1400)
    expect(r.total).toBe(11400)
    expect(taxFromInclusive(1000, 1400)).toBe(123) // 1000 - 877.19
  })

  it('adds exclusive tax (14%)', () => {
    const r = priceCart({ lines: [line('a', 10000, 2, { taxBp: 1400 })], pricesIncludeTax: false })
    expect(r.taxTotal).toBe(2800)
    expect(r.total).toBe(22800)
    expect(r.profit).toBe(20000 - 10000)
  })

  it('computes tax after discounts', () => {
    const r = priceCart({
      lines: [line('a', 10000, 1, { taxBp: 1400 })],
      cartDiscount: { type: 'PERCENT', bp: 1000 },
      pricesIncludeTax: false
    })
    expect(r.lines[0]!.net).toBe(9000)
    expect(r.taxTotal).toBe(1260)
    expect(r.total).toBe(10260)
  })

  it('flags lines sold below the minimum price', () => {
    const r = priceCart({
      lines: [line('a', 10000, 2, { minPrice: 9000, discount: { type: 'PERCENT', bp: 2000 } })],
      pricesIncludeTax: true
    })
    expect(r.lines[0]!.belowMinPrice).toBe(true)
    expect(r.lines[0]!.discountBp).toBe(2000)
  })

  it('rejects invalid quantities and prices', () => {
    expect(() => priceCart({ lines: [line('a', 100, 0)], pricesIncludeTax: true })).toThrow()
    expect(() => priceCart({ lines: [line('a', -1, 1)], pricesIncludeTax: true })).toThrow()
    expect(() => priceCart({ lines: [line('a', 100, 1.5)], pricesIncludeTax: true })).toThrow()
  })

  it('is deterministic for many random carts', () => {
    let seed = 42
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let i = 0; i < 500; i++) {
      const lines = Array.from({ length: 1 + rnd(6) }, (_, k) =>
        line(`l${k}`, 1 + rnd(100000), 1 + rnd(5), { taxBp: [0, 500, 1400][rnd(3)], discount: rnd(2) ? { type: 'PERCENT', bp: rnd(5000) } : null })
      )
      const input = { lines, cartDiscount: { type: 'AMOUNT' as const, amount: rnd(5000) }, pricesIncludeTax: rnd(2) === 1 }
      const a = priceCart(input)
      const b = priceCart(input)
      expect(a).toEqual(b)
      expect(a.total).toBe(a.lines.reduce((s, l) => s + l.total, 0))
      expect(a.subtotal - a.discountTotal + (input.pricesIncludeTax ? 0 : a.taxTotal)).toBe(a.total)
      for (const l of a.lines) expect(Number.isInteger(l.tax) && l.net >= 0).toBe(true)
    }
  })
})

describe('settlePayments', () => {
  it('gives change from cash only', () => {
    expect(settlePayments(9000, [{ method: 'CASH', amount: 10000 }])).toEqual({ tendered: 10000, change: 1000, paid: 9000, remaining: 0 })
  })
  it('handles split payments', () => {
    expect(settlePayments(9000, [{ method: 'CARD', amount: 5000 }, { method: 'CASH', amount: 5000 }])).toEqual({
      tendered: 10000,
      change: 1000,
      paid: 9000,
      remaining: 0
    })
  })
  it('reports remaining for partial payments', () => {
    expect(settlePayments(10000, [{ method: 'CASH', amount: 6000 }])).toEqual({ tendered: 6000, change: 0, paid: 6000, remaining: 4000 })
  })
  it('cannot give change from card overpayment', () => {
    const s = settlePayments(5000, [{ method: 'CARD', amount: 6000 }])
    expect(s.change).toBe(0)
    expect(s.paid).toBe(6000)
  })
})
