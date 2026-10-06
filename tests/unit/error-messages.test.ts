/**
 * Every error the main process can send must have a clear message in Arabic and
 * English. A missing one falls back to a vague text — which is what confused a
 * cashier at the counter ("برجاء مراجعة البيانات المدخلة").
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '@shared/errors'
import { errors } from '@renderer/i18n/modules/errors'

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []))
const main = files(resolve(__dirname, '../../src/main')).filter((f) => !f.includes('generated')).map((f) => readFileSync(f, 'utf8')).join('\n')

describe('error messages', () => {
  it('every error code has an Arabic and an English message', () => {
    for (const lang of ['ar', 'en'] as const) {
      const missing = ERROR_CODES.filter((c) => typeof (errors[lang].errors as Record<string, unknown>)[c] !== 'string')
      expect(missing, `${lang} messages missing`).toEqual([])
    }
  })

  it('every validation reason sent by the app has a message', () => {
    const reasons = [...new Set([...main.matchAll(/reason: '([a-z][a-zA-Z]+)'/g)].map((m) => m[1]!))]
    expect(reasons.length).toBeGreaterThan(25)
    for (const lang of ['ar', 'en'] as const) {
      const missing = reasons.filter((r) => typeof (errors[lang].errors.reasons as Record<string, string>)[r] !== 'string')
      expect(missing, `${lang} reasons missing`).toEqual([])
    }
  })

  it('no "not possible now" error is thrown without a reason', () => {
    const bare = [...main.matchAll(/new AppError\('INVALID_STATE'(?:, '[^']*')?(?:, \{([^\n]*))?\)/g)].filter((m) => !m[1]?.includes('reason'))
    expect(bare.map((m) => m[0])).toEqual([])
  })

  it('no validation error is thrown without a reason', () => {
    const bare = [...main.matchAll(/new AppError\('VALIDATION'(?:, (?:'[^']*'|`[^`]*`))?(?:, \{([^\n]*))?\)/g)].filter((m) => !m[1]?.includes('reason'))
    // the only bare one left is the Zod fallback in the error mapper (input already checked by the router)
    expect(bare.map((m) => m[0])).toEqual(["new AppError('VALIDATION')"])
  })
})
