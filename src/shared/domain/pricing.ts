import { allocate, applyBp, BP_SCALE, divRound, ratioBp, type Minor } from '../money'

/**
 * Cart pricing engine — the single source of truth for sale totals.
 *
 * The renderer uses it to show live totals; the main process re-runs it on
 * the authoritative data (prices from the database) before saving a sale, so
 * a tampered renderer cannot change what is charged.
 *
 * Order of operations (deterministic):
 *   1. gross      = unitPrice × qty
 *   2. line disc. = % of gross, or a fixed amount (capped at gross)
 *   3. cart disc. = % of the post-line-discount sum, or a fixed amount,
 *                   allocated to lines by largest remainder
 *   4. net        = gross − line disc. − allocated cart disc.
 *   5. tax        = inclusive: net − net / (1 + rate)
 *                   exclusive: net × rate
 *   6. total      = inclusive: net ; exclusive: net + tax
 */

export type Discount = { type: 'PERCENT'; bp: number } | { type: 'AMOUNT'; amount: Minor }

export interface PricingLineInput {
  key: string
  qty: number
  unitPrice: Minor
  unitCost: Minor
  taxBp: number
  discount?: Discount | null
  /** minimum allowed unit price (same tax basis as unitPrice) */
  minPrice?: Minor | null
}

export interface PricingInput {
  lines: PricingLineInput[]
  cartDiscount?: Discount | null
  pricesIncludeTax: boolean
}

export interface PricedLine {
  key: string
  qty: number
  unitPrice: Minor
  gross: Minor
  lineDiscount: Minor
  cartDiscount: Minor
  discount: Minor
  net: Minor
  tax: Minor
  total: Minor
  cost: Minor
  /** discount as share of gross, in basis points */
  discountBp: number
  belowMinPrice: boolean
}

export interface PricingResult {
  lines: PricedLine[]
  subtotal: Minor
  lineDiscountTotal: Minor
  cartDiscountTotal: Minor
  discountTotal: Minor
  taxTotal: Minor
  total: Minor
  costTotal: Minor
  /** revenue excluding tax minus cost */
  profit: Minor
  discountBp: number
  itemCount: number
}

function discountAmount(base: Minor, d: Discount | null | undefined): Minor {
  if (!d || base <= 0) return 0
  if (d.type === 'PERCENT') {
    const bp = Math.min(Math.max(d.bp, 0), BP_SCALE)
    return Math.min(applyBp(base, bp), base)
  }
  return Math.min(Math.max(d.amount, 0), base)
}

export function taxFromInclusive(net: Minor, taxBp: number): Minor {
  if (taxBp <= 0) return 0
  return net - divRound(net * BP_SCALE, BP_SCALE + taxBp)
}

export function priceCart(input: PricingInput): PricingResult {
  for (const l of input.lines) {
    if (!Number.isSafeInteger(l.qty) || l.qty <= 0) throw new RangeError(`Invalid quantity for ${l.key}`)
    if (!Number.isSafeInteger(l.unitPrice) || l.unitPrice < 0) throw new RangeError(`Invalid price for ${l.key}`)
    if (!Number.isSafeInteger(l.taxBp) || l.taxBp < 0) throw new RangeError(`Invalid tax for ${l.key}`)
  }
  const stage1 = input.lines.map((l) => {
    const gross = l.unitPrice * l.qty
    const lineDiscount = discountAmount(gross, l.discount)
    return { l, gross, lineDiscount, after: gross - lineDiscount }
  })
  const afterSum = stage1.reduce((a, s) => a + s.after, 0)
  const cartDiscountTotal = discountAmount(afterSum, input.cartDiscount)
  const allocations = allocate(
    cartDiscountTotal,
    stage1.map((s) => s.after)
  )

  const lines: PricedLine[] = stage1.map((s, i) => {
    const cartDiscount = allocations[i] ?? 0
    const net = s.after - cartDiscount
    const tax = input.pricesIncludeTax ? taxFromInclusive(net, s.l.taxBp) : applyBp(net, s.l.taxBp)
    const total = input.pricesIncludeTax ? net : net + tax
    const discount = s.lineDiscount + cartDiscount
    const cost = s.l.unitCost * s.l.qty
    const minPrice = s.l.minPrice ?? null
    return {
      key: s.l.key,
      qty: s.l.qty,
      unitPrice: s.l.unitPrice,
      gross: s.gross,
      lineDiscount: s.lineDiscount,
      cartDiscount,
      discount,
      net,
      tax,
      total,
      cost,
      discountBp: ratioBp(discount, s.gross),
      belowMinPrice: minPrice !== null && net < minPrice * s.l.qty
    }
  })

  const subtotal = lines.reduce((a, l) => a + l.gross, 0)
  const lineDiscountTotal = lines.reduce((a, l) => a + l.lineDiscount, 0)
  const discountTotal = lineDiscountTotal + cartDiscountTotal
  const taxTotal = lines.reduce((a, l) => a + l.tax, 0)
  const total = lines.reduce((a, l) => a + l.total, 0)
  const costTotal = lines.reduce((a, l) => a + l.cost, 0)
  return {
    lines,
    subtotal,
    lineDiscountTotal,
    cartDiscountTotal,
    discountTotal,
    taxTotal,
    total,
    costTotal,
    profit: total - taxTotal - costTotal,
    discountBp: ratioBp(discountTotal, subtotal),
    itemCount: lines.reduce((a, l) => a + l.qty, 0)
  }
}

export interface PaymentInput {
  method: string
  amount: Minor
}

export interface PaymentSettlement {
  /** money tendered (all methods) */
  tendered: Minor
  /** cash returned to the customer */
  change: Minor
  /** money actually kept for this sale */
  paid: Minor
  /** unpaid remainder that becomes customer debt */
  remaining: Minor
}

/**
 * Settles tendered payments against a total. Only cash can produce change;
 * overpaying with card/wallet is rejected by the caller.
 */
export function settlePayments(total: Minor, payments: PaymentInput[]): PaymentSettlement {
  const tendered = payments.reduce((a, p) => a + p.amount, 0)
  const nonCash = payments.filter((p) => p.method !== 'CASH').reduce((a, p) => a + p.amount, 0)
  if (tendered <= total) return { tendered, change: 0, paid: tendered, remaining: total - tendered }
  const over = tendered - total
  const cash = tendered - nonCash
  // change can only come out of cash
  const change = Math.min(over, cash)
  const paid = tendered - change
  return { tendered, change, paid, remaining: Math.max(total - paid, 0) }
}
