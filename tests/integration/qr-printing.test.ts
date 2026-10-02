import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDocument } from '@main/printing/documents'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
beforeEach(async () => {
  t = await createTestApp()
  await setupOwner(t)
  await t.app.shifts.open(0, actor(t))
})
afterEach(async () => {
  await t.close()
  cleanup(t)
})

async function sale(kind: 'QUICK' | 'INVOICE' = 'INVOICE') {
  const p = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Case', variants: [{ sellPrice: 10000, openingStock: 5, barcodes: ['6221111111111'] }] }, actor(t))
  return t.app.sales.complete({ idempotencyKey: randomUUID(), kind, lines: [{ variantId: p.variants[0]!.id, qty: 1, unitPrice: 10000 }], payments: [{ method: 'CASH', amount: 10000 }] }, actor(t))
}

describe('signed QR codes', () => {
  it('signs, verifies and resolves documents; rejects tampering', async () => {
    const s = await sale()
    const payload = t.app.qr.payload('S', s.invoiceNumber!)
    expect(payload).toMatch(/^CP1:S:INV-000001:[A-Za-z0-9_-]{16}$/)
    expect(payload).not.toContain(String(s.total)) // no financial data inside
    expect(await t.app.qr.resolve(payload)).toMatchObject({ kind: 'sale', id: s.id })
    await expect(t.app.qr.resolve(payload.replace('INV-000001', 'INV-000002'))).rejects.toMatchObject({ code: 'QR_INVALID' })
    await expect(t.app.qr.resolve('hello')).rejects.toMatchObject({ code: 'QR_INVALID' })
    // a QR signed by another store's key is rejected
    const other = await createTestApp()
    await other.app.secrets.init()
    await expect(other.app.qr.resolve(payload)).rejects.toMatchObject({ code: 'QR_INVALID' })
    await other.close()
    cleanup(other)
  })

  it('everything keeps working with QR disabled', async () => {
    await t.app.settings.update('qr', { enabled: false })
    const s = await sale()
    expect(s.qrEnabled).toBe(false)
    const doc = await buildDocument(t.app, { type: 'invoice', saleId: s.id }, actor(t))
    expect(doc.type === 'invoice' && doc.qr).toBeNull()
    await expect(t.app.qr.resolve(t.app.qr.payload('S', s.invoiceNumber!))).rejects.toMatchObject({ code: 'QR_DISABLED' })
  })
})

describe('print documents', () => {
  it('builds receipts, invoices, labels and repair tickets', async () => {
    const s = await sale()
    const inv = await buildDocument(t.app, { type: 'invoice', saleId: s.id }, actor(t))
    expect(inv.type).toBe('invoice')
    if (inv.type === 'invoice') {
      expect(inv.qr).toMatch(/^data:image\/png;base64,/)
      expect(inv.store.name).toBe('Test Mobile Shop')
    }
    const rec = await buildDocument(t.app, { type: 'receipt', saleId: s.id, reprint: true }, actor(t))
    expect(rec.type === 'receipt' && rec.reprint).toBe(true)
    expect(await t.app.db.auditLog.count({ where: { action: 'sale.reprinted' } })).toBe(1)
    const labels = await buildDocument(t.app, { type: 'labels', items: [{ variantId: s.items[0]!.variantId!, qty: 3 }] }, actor(t))
    expect(labels.type === 'labels' && labels.labels.length).toBe(3)
    const r = await t.app.repairs.create({ customerName: 'A', customerPhone: '01000000000', deviceModel: 'X', complaint: 'Y' }, actor(t))
    const ticket = await buildDocument(t.app, { type: 'repairTicket', repairId: r.id }, actor(t))
    expect(ticket.type === 'repairTicket' && ticket.qr).toBeTruthy()
  })
})
