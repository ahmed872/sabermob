import { describe, expect, it } from 'vitest'
import { lineOfferDiscount, priceFloor, runOffersEngine, type CartLineCtx, type EngineContext, type OfferDef, type ProductCandidate } from '@shared/domain/offers'

const NOW = new Date('2026-10-02T12:00:00')
const offer = (o: Partial<OfferDef>): OfferDef => ({
  id: 'o1', name: 'Offer', type: 'CROSS_SELL', isActive: true, autoApply: false, priority: 0, discountBp: null, discountAmount: null, bundlePrice: null,
  buyQty: null, getQty: null, minQty: null, minCartTotal: null, customerType: null, daysOfWeek: null, hourFrom: null, hourTo: null, startsAt: null, endsAt: null,
  maxUses: null, usageCount: 0, triggers: { productIds: [], categoryIds: [] }, targets: { productIds: [], categoryIds: [] }, ...o
})
const line = (productId: string, unitPrice: number, qty = 1, cost = unitPrice / 2, categoryId: string | null = null): CartLineCtx => ({ productId, variantId: `v-${productId}`, categoryId, qty, unitPrice, unitCost: cost, minPrice: null })
const cand = (productId: string, price: number, extra: Partial<ProductCandidate> = {}): ProductCandidate => ({ productId, variantId: `v-${productId}`, name: productId, categoryId: null, price, cost: price / 2, minPrice: null, stockQty: 5, trackStock: true, isDead: false, ...extra })
const ctx = (lines: CartLineCtx[], extra: Partial<EngineContext> = {}): EngineContext => ({ lines, customerType: null, now: NOW, dismissed: [], minMarginBp: 500, clearanceMaxDiscountBp: 3000, maxSuggestions: 3, affinity: new Map(), ...extra })

describe('offers engine', () => {
  it('suggests a cross-sell when the trigger is in the cart (case → glass 20% off)', () => {
    const o = offer({ triggers: { productIds: ['case'], categoryIds: [] }, targets: { productIds: ['glass'], categoryIds: [] }, discountBp: 2000 })
    const r = runOffersEngine([o], [cand('glass', 10000)], ctx([line('case', 15000)]))
    expect(r.suggestions).toHaveLength(1)
    expect(r.suggestions[0]).toMatchObject({ productId: 'glass', regularPrice: 10000, offerPrice: 8000, source: 'OFFER' })
    expect(runOffersEngine([o], [cand('glass', 10000)], ctx([line('cable', 15000)])).suggestions).toHaveLength(0)
  })

  it('never goes below minimum price or the margin floor', () => {
    const o = offer({ triggers: { productIds: ['a'], categoryIds: [] }, targets: { productIds: ['b'], categoryIds: [] }, discountBp: 9000 })
    const r = runOffersEngine([o], [cand('b', 10000, { cost: 7000, minPrice: 8000 })], ctx([line('a', 1)]))
    expect(r.suggestions[0]!.offerPrice).toBe(8000)
    expect(priceFloor({ price: 10000, cost: 9000, minPrice: null }, { minMarginBp: 1000, clearanceMaxDiscountBp: 3000 }, false)).toBe(9900)
    expect(priceFloor({ price: 10000, cost: 9000, minPrice: null }, { minMarginBp: 1000, clearanceMaxDiscountBp: 3000 }, true)).toBe(7000)
  })

  it('skips out-of-stock, already-in-cart, dismissed and ineligible offers', () => {
    const base = { triggers: { productIds: ['a'], categoryIds: [] }, targets: { productIds: ['b', 'c'], categoryIds: [] }, discountBp: 1000 }
    expect(runOffersEngine([offer(base)], [cand('b', 1000, { stockQty: 0 })], ctx([line('a', 1)])).suggestions).toHaveLength(0)
    expect(runOffersEngine([offer(base)], [cand('b', 1000)], ctx([line('a', 1), line('b', 1000)])).suggestions).toHaveLength(0)
    expect(runOffersEngine([offer(base)], [cand('b', 1000)], ctx([line('a', 1)], { dismissed: ['o1:b'] })).suggestions).toHaveLength(0)
    expect(runOffersEngine([offer({ ...base, endsAt: '2026-01-01' })], [cand('b', 1000)], ctx([line('a', 1)])).suggestions).toHaveLength(0)
    expect(runOffersEngine([offer({ ...base, customerType: 'VIP' })], [cand('b', 1000)], ctx([line('a', 1)])).suggestions).toHaveLength(0)
    expect(runOffersEngine([offer({ ...base, customerType: 'VIP' })], [cand('b', 1000)], ctx([line('a', 1)], { customerType: 'VIP' })).suggestions).toHaveLength(1)
    expect(runOffersEngine([offer({ ...base, maxUses: 3, usageCount: 3 })], [cand('b', 1000)], ctx([line('a', 1)])).suggestions).toHaveLength(0)
    expect(runOffersEngine([offer({ ...base, daysOfWeek: [NOW.getDay() === 0 ? 1 : 0] })], [cand('b', 1000)], ctx([line('a', 1)])).suggestions).toHaveLength(0)
  })

  it('cart threshold: add product X for 50 when cart reaches 500', () => {
    const o = offer({ type: 'CART_THRESHOLD', minCartTotal: 50000, targets: { productIds: ['x'], categoryIds: [] }, bundlePrice: 5000 })
    expect(runOffersEngine([o], [cand('x', 12000, { cost: 3000 })], ctx([line('a', 40000)])).suggestions).toHaveLength(0)
    const r = runOffersEngine([o], [cand('x', 12000, { cost: 3000 })], ctx([line('a', 50000)]))
    expect(r.suggestions[0]).toMatchObject({ offerPrice: 5000, source: 'THRESHOLD' })
  })

  it('shows at most N suggestions, best first, plus learned affinity', () => {
    const o = offer({ triggers: { productIds: ['a'], categoryIds: [] }, targets: { productIds: ['b', 'c', 'd', 'e'], categoryIds: [] }, discountBp: 1000 })
    const r = runOffersEngine([o], ['b', 'c', 'd', 'e', 'f'].map((p) => cand(p, 1000)), ctx([line('a', 1)], { maxSuggestions: 2, affinity: new Map([['f', 50]]) }))
    expect(r.suggestions).toHaveLength(2)
    const aff = runOffersEngine([], [cand('f', 1000)], ctx([line('a', 1)], { affinity: new Map([['f', 9]]) }))
    expect(aff.suggestions[0]).toMatchObject({ source: 'AFFINITY', offerPrice: 1000, discount: null })
  })

  it('auto-applies quantity and buy-x-get-y discounts', () => {
    const qty = offer({ id: 'q', type: 'QTY_DISCOUNT', autoApply: true, minQty: 3, discountBp: 1000, targets: { productIds: ['cable'], categoryIds: [] } })
    const bxgy = offer({ id: 'b', type: 'BUY_X_GET_Y', autoApply: true, buyQty: 2, getQty: 1, targets: { productIds: ['case'], categoryIds: [] } })
    const r = runOffersEngine([qty, bxgy], [], ctx([line('cable', 5000, 3, 1000), line('case', 10000, 3, 2000)]))
    expect(r.autoApply.find((a) => a.offerId === 'q')!.discount).toEqual({ type: 'AMOUNT', amount: 1500 })
    expect(r.autoApply.find((a) => a.offerId === 'b')!.discount).toEqual({ type: 'AMOUNT', amount: 10000 })
    expect(runOffersEngine([qty], [], ctx([line('cable', 5000, 2)])).autoApply).toHaveLength(0)
  })

  it('validates an offer line server-side independently of the suggestion', () => {
    const o = offer({ triggers: { productIds: ['case'], categoryIds: [] }, targets: { productIds: ['glass'], categoryIds: [] }, discountBp: 2000 })
    const glass = line('glass', 10000)
    expect(lineOfferDiscount(o, glass, { now: NOW, customerType: null, cartLines: [line('case', 1), glass], minMarginBp: 500, clearanceMaxDiscountBp: 3000 })).toEqual({ type: 'AMOUNT', amount: 2000 })
    // trigger removed from cart → no discount
    expect(lineOfferDiscount(o, glass, { now: NOW, customerType: null, cartLines: [glass], minMarginBp: 500, clearanceMaxDiscountBp: 3000 })).toBeNull()
  })
})
