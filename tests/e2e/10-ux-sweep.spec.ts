import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { loginWithPin, onboard } from './flows'

type R = { ok: boolean; data?: any; error?: { code: string } }

// Captures every main screen with realistic data (Arabic, then English) for the UX / RTL audit.
test('screen sweep for the UX / RTL audit', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launchApp()
  const invoke = async (m: string, input?: unknown) => {
    const r = (await page.evaluate(([m, i]) => (globalThis as any).central.invoke(m, i), [m, input] as const)) as R
    expect(r.ok, `${m}: ${JSON.stringify(r.error)}`).toBe(true)
    return r.data
  }
  const go = async (hash: string, name: string, wait?: string) => {
    await page.goto(page.url().replace(/#.*$/, `#${hash}`))
    if (wait) await expect(page.getByText(wait).first()).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `test-results/sweep/${name}.png` })
  }
  try {
    await onboard(page)
    await loginWithPin(page)
    await invoke('shifts.open', { openingCash: 50000 })
    const products = []
    for (const [name, price, stock] of [['جراب سيليكون iPhone 15 Pro Max شفاف', 15000, 12], ['اسكرينة 9D Samsung A54', 8000, 2], ['شاحن Anker 20W USB-C أصلي', 45000, 0], ['كابل Type-C إلى Lightning 1 متر', 12000, 30]] as const) {
      products.push(await invoke('catalog.saveProduct', { type: 'ACCESSORY', name, variants: [{ sellPrice: price, costPrice: Math.round(price * 0.6), openingStock: stock, barcodes: [] }] }))
    }
    const customer = await invoke('customers.save', { name: 'محمد عبد الرحمن السيد', phone: '01012345678' })
    const v0 = products[0].variants[0].id
    const v3 = products[3].variants[0].id
    await invoke('pos.complete', { idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: v0, qty: 2, unitPrice: 15000 }, { variantId: v3, qty: 1, unitPrice: 12000 }], payments: [{ method: 'CASH', amount: 50000 }] })
    await invoke('pos.complete', { idempotencyKey: randomUUID(), kind: 'INVOICE', customerId: customer.id, lines: [{ variantId: v3, qty: 3, unitPrice: 12000 }], payments: [{ method: 'CASH', amount: 20000 }] })
    const repair = await invoke('repairs.create', { customerName: 'سارة أحمد', customerPhone: '01198765432', deviceBrand: 'Samsung', deviceModel: 'Galaxy A54 5G', imei: '356789012345678', complaint: 'الشاشة مكسورة والتاتش مش شغال', estimatedPrice: 150000, deposit: { amount: 50000, method: 'CASH' } })
    const supplier = await invoke('suppliers.save', { name: 'شركة النور للإكسسوارات', phone: '0225551234' })
    await invoke('purchases.create', { supplierId: supplier.id, items: [{ variantId: v3, qty: 20, unitCost: 7000 }], receiveNow: true, payment: { amount: 50000, method: 'CASH' } })

    const dash = await invoke('reports.dashboard')
    expect(dash.today).toMatchObject({ sales: 78000, count: 2 })
    expect(dash.supplierDebt).toBe(90000)
    expect(dash.pendingRepairs).toBe(1)
    await go('/inventory', 'tmp')
    await go('/dashboard', 'ar-01-dashboard', '780 ج.م')
    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    const search = page.getByPlaceholder(/امسح الباركود/)
    for (const [q, name] of [['جراب سيليكون', /جراب سيليكون iPhone/], ['كابل Type', /كابل Type-C/]] as const) {
      await search.fill(q)
      await expect(page.getByRole('button', { name }).first()).toBeVisible()
      await search.press('Enter')
    }
    await expect(page.getByTestId('cart-total')).toHaveText(/270/)
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'test-results/sweep/ar-02-pos.png' })
    await page.keyboard.press('F8')
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'test-results/sweep/ar-03-payment.png' })
    await page.keyboard.press('Escape')
    await go('/inventory', 'ar-04-inventory', 'جراب سيليكون')
    await go('/inventory/products/new', 'ar-05-product-new')
    await go('/repairs', 'ar-06-repairs', 'Galaxy A54 5G')
    await go(`/repairs/${repair.id}`, 'ar-07-repair-detail', 'Galaxy A54 5G')
    await go('/repairs/new', 'ar-08-repair-new')
    await go('/customers', 'ar-09-customers', 'محمد عبد الرحمن السيد')
    await go(`/customers/${customer.id}`, 'ar-10-customer-detail', 'محمد عبد الرحمن السيد')
    await go('/suppliers', 'ar-11-suppliers', 'شركة النور للإكسسوارات')
    await go(`/suppliers/${supplier.id}`, 'ar-12-supplier-detail', 'شركة النور للإكسسوارات')
    await go('/suppliers/purchases/new', 'ar-13-purchase-new')
    await go('/sales/history', 'ar-14-sales-history', 'S-000001')
    await go('/reports/sales', 'ar-15-reports', 'صافي المبيعات')
    await go('/offers', 'ar-16-offers')
    await go('/settings/company', 'ar-17-settings')
    await go('/settings/users', 'ar-18-users')

    await invoke('settings.update', { group: 'general', values: { language: 'en' } })
    await page.reload()
    await page.waitForTimeout(800)
    await go('/dashboard', 'en-01-dashboard', "Today's sales")
    await go('/pos', 'en-02-pos')
    await go('/repairs', 'en-06-repairs', 'Galaxy A54 5G')
    await go(`/customers/${customer.id}`, 'en-10-customer-detail')
    await go('/reports/profit', 'en-15-reports')
  } finally {
    await app.close()
  }
})
