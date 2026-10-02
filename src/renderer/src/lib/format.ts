import { formatMoney, type Minor } from '@shared/money'
import i18n from '../i18n'
import { useApp } from '../stores/app'

/** Arabic UI with Latin digits — the convention in Egyptian retail software. */
export function numberLocale(): string {
  return i18n.language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'
}

export function fmtMoney(minor: Minor | null | undefined, opts: { compact?: boolean; showCurrency?: boolean } = {}): string {
  if (minor === null || minor === undefined) return '—'
  const company = useApp.getState().settings?.company
  return formatMoney(minor, {
    currency: company?.currency ?? 'EGP',
    decimals: company?.currencyDecimals ?? 2,
    locale: numberLocale(),
    compact: opts.compact ?? true,
    showCurrency: opts.showCurrency
  })
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat(numberLocale()).format(n)
}

export function fmtDate(iso: string | Date | null | undefined, withTime = false): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(numberLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(d)
}

export function fmtTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(numberLocale(), { hour: 'numeric', minute: '2-digit' }).format(d)
}

export function fmtRelative(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diff = (d.getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(numberLocale(), { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function fmtPercentBp(bp: number): string {
  return `${new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 }).format(bp / 100)}%`
}

/** Start/end of the local day as ISO strings. */
export function dayRange(date = new Date()): { from: string; to: string } {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const to = new Date(from.getTime() + 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}
