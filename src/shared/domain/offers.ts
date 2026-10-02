import { applyBp, divRound, type Minor } from '../money'
import type { Discount } from './pricing'

/**
 * Smart offers engine — local, rule-based and deterministic (no AI/cloud).
 *
 * Produces two things for the current cart:
 *  1. suggestions: at most N short recommendations the cashier can accept
 *     or ignore (cross-sell, bundles, cart-threshold add-ons, "bought
 *     together" affinity, clearance of slow stock);
 *  2. autoApply: owner-configured discounts that apply by themselves to items
 *     already in the cart (percent/fixed/quantity/buy-X-get-Y).
 *
 * Safety rules (never violated): no price below the product's minimum price,
 * no margin below the configured floor (clearance has its own cap), no
 * out-of-stock suggestions, offers respect dates/days/hours/customer type
 * and usage limits. The main process re-validates every offer at checkout.
 */

export type OfferType = 'PERCENT' | 'FIXED' | 'BUNDLE' | 'BUY_X_GET_Y' | 'QTY_DISCOUNT' | 'CART_THRESHOLD' | 'CLEARANCE' | 'CROSS_SELL'

export interface OfferDef {
  id: string
  name: string
  type: OfferType
  isActive: boolean
  autoApply: boolean
  priority: number
  discountBp: number | null
  discountAmount: Minor | null
  bundlePrice: Minor | null
  buyQty: number | null
  getQty: number | null
  minQty: number | null
  minCartTotal: Minor | null
  customerType: string | null
  daysOfWeek: number[] | null
  hourFrom: number | null
  hourTo: number | null
  startsAt: string | null
  endsAt: string | null
  maxUses: number | null
  usageCount: number
  triggers: { productIds: string[]; categoryIds: string[] }
  targets: { productIds: string[]; categoryIds: string[] }
}

export interface CartLineCtx {
  productId: string
  variantId: string
  categoryId: string | null
  qty: number
  unitPrice: Minor
  unitCost: Minor
  minPrice: Minor | null
}

export interface ProductCandidate {
  productId: string
  variantId: string
  name: string
  categoryId: string | null
  price: Minor
  cost: Minor
  minPrice: Minor | null
  stockQty: number
  trackStock: boolean
  /** true when not sold for the configured dead-stock period */
  isDead: boolean
}

export interface EngineContext {
  lines: CartLineCtx[]
  customerType: string | null
  now: Date
  dismissed: string[]
  minMarginBp: number
  clearanceMaxDiscountBp: number
  maxSuggestions: number
  /** productId → co-purchase count with any product in the cart */
  affinity: Map<string, number>
}

export interface Suggestion {
  key: string
  source: 'OFFER' | 'AFFINITY' | 'CLEARANCE' | 'THRESHOLD'
  offerId: string | null
  offerName: string | null
  productId: string
  variantId: string
  name: string
  regularPrice: Minor
  offerPrice: Minor
  discount: Discount | null
  score: number
}

export interface AutoApplied {
  variantId: string
  offerId: string
  offerName: string
  discount: Discount
}

export interface EngineResult {
  suggestions: Suggestion[]
  autoApply: AutoApplied[]
}

export function cartGross(lines: CartLineCtx[]): Minor {
  return lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
}

/** Is the offer valid right now for this customer? */
export function offerEligible(o: OfferDef, ctx: { now: Date; customerType: string | null; cartTotal: Minor }): boolean {
  if (!o.isActive) return false
  if (o.startsAt && new Date(o.startsAt) > ctx.now) return false
  if (o.endsAt && new Date(o.endsAt) < ctx.now) return false
  if (o.maxUses !== null && o.usageCount >= o.maxUses) return false
  if (o.customerType && o.customerType !== ctx.customerType) return false
  if (o.daysOfWeek && o.daysOfWeek.length > 0 && !o.daysOfWeek.includes(ctx.now.getDay())) return false
  if (o.hourFrom !== null && o.hourTo !== null) {
    const h = ctx.now.getHours()
    const inRange = o.hourFrom <= o.hourTo ? h >= o.hourFrom && h < o.hourTo : h >= o.hourFrom || h < o.hourTo
    if (!inRange) return false
  }
  if (o.minCartTotal !== null && ctx.cartTotal < o.minCartTotal) return false
  return true
}

function matches(set: { productIds: string[]; categoryIds: string[] }, productId: string, categoryId: string | null): boolean {
  return set.productIds.includes(productId) || (!!categoryId && set.categoryIds.includes(categoryId))
}

function triggered(o: OfferDef, lines: CartLineCtx[]): boolean {
  if (o.triggers.productIds.length === 0 && o.triggers.categoryIds.length === 0) return true
  return lines.some((l) => matches(o.triggers, l.productId, l.categoryId))
}

/** Unit price after the offer (before safety clamps). */
function offerUnitPrice(o: OfferDef, price: Minor): Minor {
  if (o.bundlePrice !== null) return Math.min(price, o.bundlePrice)
  if (o.discountBp !== null) return price - applyBp(price, o.discountBp)
  if (o.discountAmount !== null) return Math.max(0, price - o.discountAmount)
  return price
}

/**
 * Lowest unit price allowed by the safety rules.
 * Regular offers keep at least `minMarginBp` margin over cost; clearance may
 * go lower but never more than `clearanceMaxDiscountBp` off the price.
 */
export function priceFloor(p: { price: Minor; cost: Minor; minPrice: Minor | null }, ctx: { minMarginBp: number; clearanceMaxDiscountBp: number }, clearance: boolean): Minor {
  const floors = [p.minPrice ?? 0]
  if (clearance) floors.push(p.price - applyBp(p.price, ctx.clearanceMaxDiscountBp))
  else if (p.cost > 0) floors.push(p.cost + applyBp(p.cost, ctx.minMarginBp))
  return Math.min(p.price, Math.max(...floors))
}

/** Discount an offer grants on a cart line (null when it does not apply). */
export function lineOfferDiscount(
  o: OfferDef,
  line: CartLineCtx,
  ctx: { now: Date; customerType: string | null; cartLines: CartLineCtx[]; minMarginBp: number; clearanceMaxDiscountBp: number }
): Discount | null {
  const cartTotal = cartGross(ctx.cartLines)
  if (!offerEligible(o, { now: ctx.now, customerType: ctx.customerType, cartTotal })) return null
  if (!matches(o.targets, line.productId, line.categoryId)) return null
  const clearance = o.type === 'CLEARANCE'
  const floor = priceFloor({ price: line.unitPrice, cost: line.unitCost, minPrice: line.minPrice }, ctx, clearance)
  let unitDiscount: Minor
  switch (o.type) {
    case 'BUY_X_GET_Y': {
      const buy = o.buyQty ?? 0
      const get = o.getQty ?? 0
      if (buy <= 0 || get <= 0 || line.qty < buy + get) return null
      const free = Math.floor(line.qty / (buy + get)) * get
      // Spread the free units over the line, still respecting the floor.
      const maxLine = (line.unitPrice - floor) * line.qty
      const amount = Math.min(free * line.unitPrice, maxLine)
      return amount > 0 ? { type: 'AMOUNT', amount } : null
    }
    case 'QTY_DISCOUNT':
      if (line.qty < (o.minQty ?? 2)) return null
      unitDiscount = line.unitPrice - offerUnitPrice(o, line.unitPrice)
      break
    case 'CROSS_SELL':
    case 'BUNDLE':
    case 'CART_THRESHOLD':
      if (!triggered(o, ctx.cartLines.filter((l) => l.variantId !== line.variantId))) return null
      unitDiscount = line.unitPrice - offerUnitPrice(o, line.unitPrice)
      break
    default:
      if (!triggered(o, ctx.cartLines)) return null
      unitDiscount = line.unitPrice - offerUnitPrice(o, line.unitPrice)
  }
  unitDiscount = Math.min(unitDiscount, Math.max(0, line.unitPrice - floor))
  if (unitDiscount <= 0) return null
  return { type: 'AMOUNT', amount: unitDiscount * line.qty }
}

const SUGGESTING: OfferType[] = ['CROSS_SELL', 'BUNDLE', 'CART_THRESHOLD', 'CLEARANCE']
const AUTO: OfferType[] = ['PERCENT', 'FIXED', 'QTY_DISCOUNT', 'BUY_X_GET_Y']

export function runOffersEngine(offers: OfferDef[], candidates: ProductCandidate[], ctx: EngineContext): EngineResult {
  const cartTotal = cartGross(ctx.lines)
  const inCart = new Set(ctx.lines.map((l) => l.productId))
  const eligible = offers.filter((o) => offerEligible(o, { now: ctx.now, customerType: ctx.customerType, cartTotal }))
  const byId = new Map(candidates.map((c) => [c.productId, c]))
  const out: Suggestion[] = []

  // 1. Configured suggestion offers.
  for (const o of eligible.filter((x) => SUGGESTING.includes(x.type))) {
    if (o.type !== 'CLEARANCE' && o.type !== 'CART_THRESHOLD' && !triggered(o, ctx.lines)) continue
    if (o.type === 'CLEARANCE' && ctx.lines.length === 0) continue
    for (const c of candidates) {
      if (inCart.has(c.productId) || !matches(o.targets, c.productId, c.categoryId)) continue
      if (c.trackStock && c.stockQty <= 0) continue
      const floor = priceFloor({ price: c.price, cost: c.cost, minPrice: c.minPrice }, ctx, o.type === 'CLEARANCE')
      const offerPrice = Math.max(floor, offerUnitPrice(o, c.price))
      const discountAmt = c.price - offerPrice
      const margin = offerPrice - c.cost
      // Transparent score: relevance + priority + profit kept − discount cost.
      const score =
        (o.type === 'CART_THRESHOLD' ? 30 : o.type === 'CLEARANCE' ? 20 : 40) +
        o.priority * 5 +
        Math.min(20, divRound(Math.max(margin, 0) * 20, Math.max(c.price, 1))) +
        (c.isDead ? 10 : 0) -
        Math.min(15, divRound(discountAmt * 15, Math.max(c.price, 1)))
      out.push({
        key: `${o.id}:${c.productId}`,
        source: o.type === 'CART_THRESHOLD' ? 'THRESHOLD' : o.type === 'CLEARANCE' ? 'CLEARANCE' : 'OFFER',
        offerId: o.id,
        offerName: o.name,
        productId: c.productId,
        variantId: c.variantId,
        name: c.name,
        regularPrice: c.price,
        offerPrice,
        discount: discountAmt > 0 ? { type: 'AMOUNT', amount: discountAmt } : null,
        score
      })
    }
  }

  // 2. Learned "bought together" suggestions (regular price).
  const maxAff = Math.max(1, ...ctx.affinity.values())
  for (const [productId, count] of ctx.affinity) {
    const c = byId.get(productId)
    if (!c || inCart.has(productId) || count < 2) continue
    if (c.trackStock && c.stockQty <= 0) continue
    out.push({
      key: `aff:${productId}`,
      source: 'AFFINITY',
      offerId: null,
      offerName: null,
      productId,
      variantId: c.variantId,
      name: c.name,
      regularPrice: c.price,
      offerPrice: c.price,
      discount: null,
      score: 10 + divRound(count * 20, maxAff) + (c.isDead ? 5 : 0)
    })
  }

  // Best suggestion per product, minus dismissed, top N.
  const best = new Map<string, Suggestion>()
  for (const s of out) {
    if (ctx.dismissed.includes(s.key)) continue
    const prev = best.get(s.productId)
    if (!prev || s.score > prev.score) best.set(s.productId, s)
  }
  const suggestions = [...best.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, Math.max(0, ctx.maxSuggestions))

  // 3. Automatic discounts on items already in the cart (best offer per line).
  const autoApply: AutoApplied[] = []
  for (const line of ctx.lines) {
    let bestOffer: { o: OfferDef; d: Discount; amount: number } | null = null
    for (const o of eligible.filter((x) => AUTO.includes(x.type) && x.autoApply)) {
      const d = lineOfferDiscount(o, line, { now: ctx.now, customerType: ctx.customerType, cartLines: ctx.lines, minMarginBp: ctx.minMarginBp, clearanceMaxDiscountBp: ctx.clearanceMaxDiscountBp })
      if (!d || d.type !== 'AMOUNT') continue
      if (!bestOffer || d.amount > bestOffer.amount || (d.amount === bestOffer.amount && o.priority > bestOffer.o.priority)) bestOffer = { o, d, amount: d.amount }
    }
    if (bestOffer) autoApply.push({ variantId: line.variantId, offerId: bestOffer.o.id, offerName: bestOffer.o.name, discount: bestOffer.d })
  }
  return { suggestions, autoApply }
}
