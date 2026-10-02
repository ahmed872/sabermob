import { toLatinDigits } from './money'

/**
 * Normalizes Arabic/English text for search so that common spelling
 * variations match: أ/إ/آ → ا, ة → ه, ى → ي, removes diacritics and tatweel,
 * converts Arabic-Indic digits, lower-cases Latin letters.
 */
export function normalizeSearch(input: string | null | undefined): string {
  if (!input) return ''
  return toLatinDigits(input)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Builds a compact search document from several fields. */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  const tokens = new Set<string>()
  for (const p of parts) {
    const n = normalizeSearch(p)
    if (!n) continue
    for (const t of n.split(' ')) if (t) tokens.add(t)
    // also index the field without spaces so "a 55" / "a55" both match
    const joined = n.replace(/ /g, '')
    if (joined.length > 1 && joined.length <= 40) tokens.add(joined)
  }
  return ` ${[...tokens].join(' ')} `
}

export function searchTokens(query: string): string[] {
  return normalizeSearch(query).split(' ').filter(Boolean).slice(0, 6)
}

/** Normalizes phone numbers for lookup (digits only, Egyptian +20 prefix stripped). */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let d = toLatinDigits(input).replace(/\D/g, '')
  if (d.startsWith('0020')) d = '0' + d.slice(4)
  else if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2)
  return d || null
}
