/**
 * Calendar-day helpers in local time. Days are not always 24 hours: Egypt moves
 * the clock in April and October, so "midnight + 24h" lands an hour off. Always
 * step days through the Date constructor instead of adding milliseconds.
 */

/** Local midnight at the start of `d`'s day. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Local midnight `n` calendar days after the start of `d`'s day (n may be negative). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** YYYY-MM-DD of `d` in local time. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
