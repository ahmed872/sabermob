import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

type R = { ok: boolean; data?: any; error?: { code: string } }

// Renders every paper size / document type through the real print pipeline
// (hidden window → printToPDF) and keeps the PDFs for size checks.
test('receipts and invoices render on 58 mm, 80 mm and A4, with QR on and off, Arabic and English', async () => {
  const { app, page } = await launchApp()
  const out = join(__dirname, '../../test-results/prints')
  mkdirSync(out, { recursive: true })
  const invoke = (m: string, input?: unknown) => page.evaluate(([m, i]) => (globalThis as any).central.invoke(m, i), [m, input] as const) as Promise<R>
  try {
    await onboard(page)
    await loginWithPin(page)
    await createProduct(page, 'شاحن سامسونج أصلي 25 وات Type-C', '350', '10', '6221234500017')
    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    await page.getByLabel('النقدية في الدرج').fill('0')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    await page.getByPlaceholder(/امسح الباركود/).fill('شاحن')
    await page.getByRole('button', { name: /شاحن سامسونج/ }).first().click()
    await page.keyboard.press('F8')
    await page.keyboard.press('F10')
    await expect(page.getByText('تم البيع')).toBeVisible()
    await page.keyboard.press('Escape')
    const sales = await invoke('pos.sales', { page: 1, pageSize: 5 })
    const saleId = sales.data.items[0].id

    const render = async (name: string, request: unknown) => {
      const r = await invoke('printing.pdf', { request })
      expect(r.ok, `${name}: ${JSON.stringify(r.error)}`).toBe(true)
      copyFileSync(r.data.path, join(out, `${name}.pdf`))
    }
    for (const paper of ['58mm', '80mm', 'A4']) {
      await render(`receipt-${paper}-ar`, { type: 'receipt', saleId, paper })
      await render(`invoice-${paper}-ar`, { type: 'invoice', saleId, paper })
    }
    // the shop default (Settings → Printers) drives receipts without an explicit size
    expect((await invoke('settings.update', { group: 'printing', values: { receiptPaper: '58mm' } })).ok).toBe(true)
    await render('receipt-default58-ar', { type: 'receipt', saleId })
    expect((await invoke('settings.update', { group: 'qr', values: { enabled: true, onReceipts: true, onInvoices: true } })).ok).toBe(true)
    await render('receipt-80mm-ar-qr', { type: 'receipt', saleId, paper: '80mm' })
    await render('invoice-A4-ar-qr', { type: 'invoice', saleId, paper: 'A4' })
    expect((await invoke('settings.update', { group: 'general', values: { language: 'en' } })).ok).toBe(true)
    await render('receipt-80mm-en-qr', { type: 'receipt', saleId, paper: '80mm' })
    await render('invoice-A4-en-qr', { type: 'invoice', saleId, paper: 'A4' })
  } finally {
    await app.close()
  }
})
