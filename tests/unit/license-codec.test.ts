import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  decodePayload,
  decodeRequestCode,
  encodePayload,
  encodeRequestCode,
  formatActivationKey,
  licenseExpiry,
  splitActivationKey
} from '@shared/license-codec'

describe('license codec', () => {
  it('round-trips base32', () => {
    const bytes = new Uint8Array(Array.from({ length: 80 }, (_, i) => (i * 37) % 256))
    const enc = base32Encode(bytes)
    expect(enc).toHaveLength(128)
    expect(base32Decode(enc)).toEqual(bytes)
    expect(base32Decode(enc.toLowerCase())).toEqual(bytes)
  })

  it('request codes detect typos', () => {
    const id = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const code = encodeRequestCode(id)
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
    expect(decodeRequestCode(code)).toEqual(id)
    expect(decodeRequestCode(code.toLowerCase().replace(/-/g, ' '))).toEqual(id)
    const typo = (code[0] === 'A' ? 'B' : 'A') + code.slice(1)
    expect(decodeRequestCode(typo)).toBeNull()
    expect(decodeRequestCode('nonsense')).toBeNull()
  })

  it('encodes payload fields', () => {
    const issuedAt = new Date(Date.UTC(2026, 9, 2))
    const p = encodePayload({ tier: 'ENTERPRISE', machineId: new Uint8Array(8).fill(9), issuedAt, validDays: 365, serial: 513 })
    const d = decodePayload(p)!
    expect(d.tier).toBe('ENTERPRISE')
    expect(d.validDays).toBe(365)
    expect(d.serial).toBe(513)
    expect(d.issuedAt.toISOString()).toBe(issuedAt.toISOString())
    expect(licenseExpiry(d)!.toISOString()).toBe(new Date(Date.UTC(2027, 9, 2)).toISOString())
    const key = formatActivationKey(p, new Uint8Array(64).fill(1))
    expect(key.split('-')).toHaveLength(16)
    expect(splitActivationKey(key)!.payload).toEqual(p)
    expect(splitActivationKey(key.slice(0, -4))).toBeNull()
  })
})
