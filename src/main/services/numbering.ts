import type { Tx } from '../database/client'

/**
 * Gap-free sequential document numbers. Must be called inside the same
 * transaction that creates the document so a rollback also releases the
 * number.
 */
export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 6): Promise<string> {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } }
  })
  return `${prefix}${String(row.value).padStart(pad, '0')}`
}

export async function peekCounter(tx: Tx, key: string): Promise<number> {
  return (await tx.counter.findUnique({ where: { key } }))?.value ?? 0
}

/** EAN-13 check digit for a 12-digit body. */
export function ean13CheckDigit(body12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}
