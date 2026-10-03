import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, localDayKey, startOfDay } from '@shared/dates'

// Egypt moves the clock: 24 Apr 2026 has 23 hours, 29 Oct 2026 has 25.
describe('calendar days across clock changes (Africa/Cairo)', () => {
  const tz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Africa/Cairo'
  })
  afterAll(() => {
    process.env.TZ = tz
  })

  it('steps whole calendar days, not 24-hour blocks', () => {
    const oct29 = new Date(2026, 9, 29, 23, 30)
    expect((addDays(oct29, 1).getTime() - startOfDay(oct29).getTime()) / 3.6e6).toBe(25)
    expect(localDayKey(addDays(oct29, 1))).toBe('2026-10-30')
    const apr24 = new Date(2026, 3, 24, 23, 30)
    expect((addDays(apr24, 1).getTime() - startOfDay(apr24).getTime()) / 3.6e6).toBe(23)
    // 14 consecutive days across the change are all distinct and in order
    const keys = Array.from({ length: 14 }, (_, i) => localDayKey(addDays(new Date(2026, 10, 5), i - 13)))
    expect(new Set(keys).size).toBe(14)
    expect(keys[0]).toBe('2026-10-23')
    expect(keys.at(-1)).toBe('2026-11-05')
  })

  it('handles month and year ends and leap day', () => {
    expect(localDayKey(addDays(new Date(2028, 1, 28, 15), 1))).toBe('2028-02-29')
    expect(localDayKey(addDays(new Date(2026, 11, 31, 23, 59), 1))).toBe('2027-01-01')
    expect(localDayKey(addDays(new Date(2027, 0, 1, 0, 1), -1))).toBe('2026-12-31')
  })
})
