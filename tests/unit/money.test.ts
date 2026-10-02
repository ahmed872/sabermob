import { describe, expect, it } from 'vitest'
import { allocate, applyBp, divRound, formatMoney, parseMoney, ratioBp, toDecimalString } from '@shared/money'

describe('money', () => {
  it('rounds half away from zero', () => {
    expect(divRound(5, 2)).toBe(3)
    expect(divRound(-5, 2)).toBe(-3)
    expect(divRound(4, 3)).toBe(1)
    expect(divRound(14, 4)).toBe(4) // 3.5 → 4
    expect(divRound(10, 4)).toBe(3) // 2.5 → 3
  })

  it('applies basis points without float error', () => {
    expect(applyBp(1005, 5000)).toBe(503) // 502.5 → 503
    expect(applyBp(199_999, 1400)).toBe(28000) // 27999.86
    expect(applyBp(100, 0)).toBe(0)
  })

  it('parses user input exactly', () => {
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('1,250.75')).toBe(125075)
    expect(parseMoney('١٢٫٥')).toBe(1250)
    expect(parseMoney('0.005')).toBe(1) // rounds half up
    expect(parseMoney('0.004')).toBe(0)
    expect(parseMoney('-3')).toBe(-300)
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
    expect(parseMoney('7', 0)).toBe(7)
    expect(parseMoney('1.2345', 3)).toBe(1235)
  })

  it('formats decimals', () => {
    expect(toDecimalString(1250)).toBe('12.50')
    expect(toDecimalString(-5)).toBe('-0.05')
    expect(toDecimalString(7, 0)).toBe('7')
    expect(formatMoney(125000, { currency: 'EGP', locale: 'en' })).toBe('1,250.00 EGP')
    expect(formatMoney(125000, { currency: 'EGP', locale: 'en', compact: true })).toBe('1,250 EGP')
  })

  it('allocates exactly with largest remainder', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(10, [300, 100])).toEqual([8, 2]) // 7.5 / 2.5
    const parts = allocate(1001, [333, 333, 334])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001)
    expect(allocate(5, [0, 0])).toEqual([3, 2])
    expect(allocate(0, [5, 5])).toEqual([0, 0])
  })

  it('computes ratios', () => {
    expect(ratioBp(25, 100)).toBe(2500)
    expect(ratioBp(1, 3)).toBe(3333)
    expect(ratioBp(5, 0)).toBe(0)
  })
})
