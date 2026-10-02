/**
 * Decimal-safe money helpers.
 *
 * All monetary values are integers in minor units (e.g. piasters: 1 EGP = 100).
 * Rates are integers in basis points (1% = 100 bp, 14% = 1400 bp).
 * Integer arithmetic on JS numbers is exact up to 2^53, far beyond any
 * realistic shop amount, so every calculation here is deterministic.
 * Rounding rule everywhere: half away from zero ("commercial rounding").
 */

export type Minor = number
export const BP_SCALE = 10_000

export function isMinor(value: unknown): value is Minor {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function assertMinor(value: number, label = 'amount'): Minor {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer amount in minor units`)
  return value
}

/** Integer division rounded half away from zero. Both inputs must be integers. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError('Division by zero')
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError('divRound requires integers')
  }
  const sign = Math.sign(numerator) * Math.sign(denominator)
  const n = Math.abs(numerator)
  const d = Math.abs(denominator)
  const q = Math.floor(n / d)
  const r = n - q * d
  const rounded = r * 2 >= d ? q + 1 : q
  return sign < 0 ? -rounded : rounded
}

/** amount × bp / 10000, rounded. */
export function applyBp(amount: Minor, bp: number): Minor {
  return divRound(amount * bp, BP_SCALE)
}

/** Ratio part/whole expressed in basis points (rounded). */
export function ratioBp(part: Minor, whole: Minor): number {
  if (whole === 0) return 0
  return divRound(part * BP_SCALE, whole)
}

/**
 * Split `total` across `weights` proportionally using the largest remainder
 * method, so the parts always add up exactly to `total`.
 */
export function allocate(total: Minor, weights: number[]): Minor[] {
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0) return []
  if (sumW === 0) {
    const base = Math.trunc(total / weights.length)
    const out = weights.map(() => base)
    let rest = total - base * weights.length
    for (let i = 0; rest !== 0; i++, rest -= Math.sign(rest)) out[i % out.length]! += Math.sign(rest)
    return out
  }
  const raw = weights.map((w) => Math.floor((total * w) / sumW))
  let remainder = total - raw.reduce((a, b) => a + b, 0)
  const order = weights
    .map((w, i) => ({ i, frac: (total * w) % sumW }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) raw[order[k]!.i]! += 1
  return raw
}

/**
 * Parse a user-entered decimal string ("12.5", "1,250.75", "١٢٫٥") into
 * minor units without going through floating point.
 */
export function parseMoney(input: string | number, decimals = 2): Minor | null {
  let s = typeof input === 'number' ? input.toFixed(decimals + 2) : input
  s = toLatinDigits(s).replace(/[\s,_'’]/g, '').replace('٫', '.').replace('،', '')
  if (s === '' || s === '-' || s === '.') return null
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m) return null
  const neg = m[1] === '-'
  const intPart = m[2] || '0'
  let frac = m[3] ?? ''
  // round half away from zero on the first dropped digit
  let roundUp = false
  if (frac.length > decimals) {
    roundUp = Number(frac[decimals]) >= 5
    frac = frac.slice(0, decimals)
  }
  frac = frac.padEnd(decimals, '0')
  let value = Number(intPart) * 10 ** decimals + (decimals > 0 ? Number(frac) : 0)
  if (roundUp) value += 1
  if (!Number.isSafeInteger(value)) return null
  return neg ? -value : value
}

/** Minor units → plain decimal string ("1250" → "12.50"). */
export function toDecimalString(minor: Minor, decimals = 2): string {
  const neg = minor < 0
  const abs = Math.abs(minor)
  if (decimals === 0) return `${neg ? '-' : ''}${abs}`
  const s = String(abs).padStart(decimals + 1, '0')
  return `${neg ? '-' : ''}${s.slice(0, -decimals)}.${s.slice(-decimals)}`
}

export interface MoneyFormatOptions {
  currency: string
  decimals?: number
  locale?: string
  /** hide ".00" for whole amounts (receipts, POS tiles) */
  compact?: boolean
  showCurrency?: boolean
}

export function formatMoney(minor: Minor, opts: MoneyFormatOptions): string {
  const decimals = opts.decimals ?? 2
  const major = toDecimalString(minor, decimals)
  const whole = minor % 10 ** decimals === 0
  const digits = opts.compact && whole ? 0 : decimals
  // Number() on a short decimal string is exact enough for display only.
  const text = new Intl.NumberFormat(opts.locale ?? 'en', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(major))
  if (opts.showCurrency === false) return text
  return `${text} ${currencySymbol(opts.currency, opts.locale)}`
}

const SYMBOLS: Record<string, { ar: string; en: string }> = {
  EGP: { ar: 'ج.م', en: 'EGP' },
  SAR: { ar: 'ر.س', en: 'SAR' },
  AED: { ar: 'د.إ', en: 'AED' },
  KWD: { ar: 'د.ك', en: 'KWD' },
  USD: { ar: '$', en: '$' },
  EUR: { ar: '€', en: '€' },
  JOD: { ar: 'د.أ', en: 'JOD' },
  LYD: { ar: 'د.ل', en: 'LYD' },
  IQD: { ar: 'د.ع', en: 'IQD' },
  QAR: { ar: 'ر.ق', en: 'QAR' }
}

export function currencySymbol(code: string, locale?: string): string {
  const s = SYMBOLS[code]
  if (!s) return code
  return locale?.startsWith('ar') ? s.ar : s.en
}

export const CURRENCY_DECIMALS: Record<string, number> = {
  EGP: 2, SAR: 2, AED: 2, USD: 2, EUR: 2, QAR: 2, KWD: 3, JOD: 3, LYD: 3, IQD: 0
}

export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** "14" / "14.5" percent → basis points. */
export function percentToBp(input: string | number): number | null {
  const v = parseMoney(String(input), 2)
  return v === null ? null : v
}

export function bpToPercentString(bp: number): string {
  const s = toDecimalString(bp, 2)
  return s.replace(/\.?0+$/, '')
}
