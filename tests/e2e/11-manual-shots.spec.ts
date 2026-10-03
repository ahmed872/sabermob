import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, ROOT } from './helpers'
import { OWNER } from './flows'

type R = { ok: boolean; data?: any; error?: { code: string } }
const OUT = join(ROOT, 'test-results/manual')

// Walks through the app like a real shop and captures the screenshots used by the
// user booklet (docs/manual). Every step is best-effort so one missing screen never
// hides the others. Opt-in (adds a minute): CENTRAL_MANUAL_SHOTS=1 npx playwright test 11-manual
test('capture screenshots for the user booklet', async () => {
  test.skip(!process.env.CENTRAL_MANUAL_SHOTS, 'set CENTRAL_MANUAL_SHOTS=1 to refresh the booklet screenshots')
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launchApp()
  const failed: string[] = []
  const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 })
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
      await page.waitForTimeout(350)
      await shot(name)
    } catch (err) {
      failed.push(`${name}: ${String(err).split('\n')[0]}`)
      await shot(`FAILED-${name}`).catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  }
  const go = async (hash: string) => {
    await page.goto(page.url().replace(/#.*$/, `#${hash}`))
  }
  const invoke = async (m: string, input?: unknown) => {
    const r = (await page.evaluate(([m, i]) => (globalThis as any).central.invoke(m, i), [m, input] as const)) as R
    if (!r.ok) throw new Error(`${m}: ${JSON.stringify(r.error)}`)
    return r.data
  }
  const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name }).first()

  try {
    // ── first launch ──
    await step('01-welcome', async () => expect(page.getByRole('button', { name: 'ابدأ' })).toBeVisible())
    await page.getByRole('button', { name: 'ابدأ' }).click()
    await step('02-language', async () => undefined)
    await page.getByRole('button', { name: 'العربية' }).click()
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByLabel('اسم المحل').fill('سنترال الأمل')
    await step('03-store', async () => undefined)
    await page.getByRole('button', { name: 'التالي' }).click()
    await step('04-currency', async () => undefined)
    await page.getByRole('button', { name: 'التالي' }).click()
    await page.getByLabel('الاسم بالكامل').fill(OWNER.name)
    await page.getByLabel('اسم المستخدم').fill(OWNER.username)
    await page.getByLabel('كلمة المرور', { exact: true }).fill(OWNER.password)
    await page.getByLabel('تأكيد كلمة المرور').fill(OWNER.password)
    await page.getByLabel('رقم سري سريع (اختياري)').fill(OWNER.pin)
    await step('05-owner', async () => undefined)
    await page.getByRole('button', { name: 'التالي' }).click()
    await step('06-printer', async () => undefined)
    await page.getByRole('button', { name: 'تخطي' }).click()
    await step('07-catalog', async () => undefined)
    await page.getByRole('button', { name: 'إنهاء' }).click()
    await expect(page.getByText('محلك جاهز!')).toBeVisible({ timeout: 20_000 })
    await step('08-done', async () => undefined)
    await page.getByRole('button', { name: 'دخول' }).click()
    await step('09-login-pin', async () => expect(page.getByText('أدخل الرقم السري')).toBeVisible())
    for (const d of OWNER.pin) await page.getByRole('button', { name: d, exact: true }).click()
    await page.getByRole('button', { name: 'submit' }).click()
    await expect(page.getByRole('link', { name: 'الإعدادات' })).toBeVisible()

    // ── realistic data ──
    const p = async (name: string, price: number, stock: number, barcode?: string) =>
      invoke('catalog.saveProduct', { type: 'ACCESSORY', name, variants: [{ sellPrice: price, costPrice: Math.round(price * 0.6), openingStock: stock, minStock: 3, barcodes: barcode ? [barcode] : [] }] })
    const caseP = await p('جراب سيليكون iPhone 15 Pro Max شفاف', 15000, 12, '6221000000017')
    const glass = await p('اسكرينة 9D Samsung A54', 8000, 2, '6221000000024')
    await p('شاحن Anker 20W USB-C أصلي', 45000, 0)
    const cable = await p('كابل Type-C إلى Lightning 1 متر', 12000, 30, '6221000000031')
    await p('سماعة بلوتوث Lenovo LP40', 35000, 6)
    const customer = await invoke('customers.save', { name: 'محمد عبد الرحمن', phone: '01012345678' })
    await invoke('shifts.open', { openingCash: 50000 })
    await invoke('pos.complete', { idempotencyKey: randomUUID(), kind: 'QUICK', lines: [{ variantId: caseP.variants[0].id, qty: 2, unitPrice: 15000 }, { variantId: cable.variants[0].id, qty: 1, unitPrice: 12000 }], payments: [{ method: 'CASH', amount: 50000 }] })
    await invoke('pos.complete', { idempotencyKey: randomUUID(), kind: 'INVOICE', customerId: customer.id, lines: [{ variantId: cable.variants[0].id, qty: 3, unitPrice: 12000 }], payments: [{ method: 'CASH', amount: 20000 }] })
    const repair = await invoke('repairs.create', { customerName: 'سارة أحمد', customerPhone: '01198765432', deviceBrand: 'Samsung', deviceModel: 'Galaxy A54 5G', imei: '356789012345678', complaint: 'الشاشة مكسورة والتاتش مش شغال', estimatedPrice: 150000, deposit: { amount: 50000, method: 'CASH' } })
    const supplier = await invoke('suppliers.save', { name: 'شركة النور للإكسسوارات', phone: '0225551234' })
    await invoke('purchases.create', { supplierId: supplier.id, items: [{ variantId: cable.variants[0].id, qty: 20, unitCost: 7000 }], receiveNow: true, payment: { amount: 50000, method: 'CASH' } })
    await invoke('offers.save', { name: 'اسكرينة بخصم 20% مع الجراب', type: 'CROSS_SELL', isActive: true, discountBp: 2000, triggers: { productIds: [caseP.id], categoryIds: [] }, targets: { productIds: [glass.id], categoryIds: [] } }).catch((e: Error) => failed.push(`offer: ${e.message}`))

    // ── dashboard & POS ──
    await step('10-dashboard', async () => {
      // The data above was created over IPC: open the dashboard the way a user does.
      await go('/pos')
      await expect(page.getByPlaceholder(/امسح الباركود/)).toBeVisible()
      await page.getByRole('link', { name: 'الرئيسية' }).click()
      await expect(page.getByText(/780/).first()).toBeVisible({ timeout: 15_000 })
    })
    await step('11-pos-empty', async () => {
      await go('/pos')
      await expect(page.getByPlaceholder(/امسح الباركود/)).toBeVisible()
    })
    const search = page.getByPlaceholder(/امسح الباركود/)
    await step('12-pos-search', async () => {
      await search.fill('جراب')
      await expect(page.getByRole('button', { name: /جراب سيليكون iPhone/ }).first()).toBeVisible()
    })
    await step('13-pos-cart', async () => {
      await search.press('Enter')
      await search.fill('6221000000031')
      await search.press('Enter')
      await expect(page.getByTestId('cart-total')).toHaveText(/270/)
    })
    await step('14-pos-payment', async () => {
      await page.keyboard.press('F8')
      await expect(page.getByText('إتمام البيع')).toBeVisible()
    })
    await step('15-pos-done', async () => {
      await page.keyboard.press('F10')
      await expect(page.getByText('تم البيع')).toBeVisible()
    })
    await page.keyboard.press('Escape')
    await step('16-pos-customer', async () => {
      await page.keyboard.press('F4')
      await page.waitForTimeout(300)
    })
    await page.keyboard.press('Escape')
    await step('17-sales-history', async () => {
      await go('/sales/history')
      await expect(page.getByRole('cell', { name: 'S-000001' })).toBeVisible()
    })
    await step('18-sale-detail', async () => {
      await page.getByRole('cell', { name: 'S-000001' }).click()
      await expect(btn(page, 'مرتجع')).toBeVisible()
    })
    await step('19-refund', async () => {
      await btn(page, 'مرتجع').click()
      await page.waitForTimeout(300)
    })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await step('20-shifts', async () => {
      await go('/sales/shifts')
      await page.waitForTimeout(300)
    })
    await step('21-close-shift', async () => {
      await go('/pos')
      await btn(page, /وردية مفتوحة/).click()
      await page.waitForTimeout(300)
    })
    await page.keyboard.press('Escape')

    // ── inventory ──
    await step('22-inventory', async () => {
      await go('/inventory')
      await expect(page.getByText('جراب سيليكون iPhone 15 Pro Max شفاف')).toBeVisible()
    })
    await step('23-product-new', async () => go('/inventory/products/new'))
    await step('24-adjust', async () => {
      await go('/inventory')
      await btn(page, 'تسوية المخزون').click()
    })
    await page.keyboard.press('Escape')
    await step('25-labels', async () => {
      await btn(page, 'طباعة ملصقات').click()
    })
    await page.keyboard.press('Escape')
    await step('26-import', async () => {
      await btn(page, 'استيراد').click()
    })
    await page.keyboard.press('Escape')
    await step('27-movements', async () => go('/inventory/movements'))

    // ── repairs ──
    await step('28-repairs', async () => {
      await go('/repairs')
      await expect(page.getByText('Galaxy A54 5G').first()).toBeVisible()
    })
    await step('29-repair-new', async () => go('/repairs/new'))
    await step('30-repair-detail', async () => {
      await go(`/repairs/${repair.id}`)
      await expect(page.getByText('RP-0001').first()).toBeVisible()
    })
    await step('31-repair-status', async () => {
      await btn(page, 'نقل إلى').click()
    })
    await page.keyboard.press('Escape')
    await step('32-repair-deliver', async () => {
      await btn(page, 'تسليم للعميل').click()
    })
    await page.keyboard.press('Escape')

    // ── customers & suppliers ──
    await step('33-customers', async () => {
      await go('/customers')
      await expect(page.getByText('محمد عبد الرحمن').first()).toBeVisible()
    })
    await step('34-customer-detail', async () => {
      await go(`/customers/${customer.id}`)
      await expect(page.getByText('محمد عبد الرحمن').first()).toBeVisible()
    })
    await step('35-collect', async () => {
      await btn(page, 'تحصيل').click()
    })
    await page.keyboard.press('Escape')
    await step('36-suppliers', async () => {
      await go('/suppliers')
      await expect(page.getByText('شركة النور للإكسسوارات').first()).toBeVisible()
    })
    await step('37-supplier-detail', async () => {
      await go(`/suppliers/${supplier.id}`)
      await expect(page.getByText('PO-00001')).toBeVisible()
    })
    await step('38-supplier-pay', async () => {
      await btn(page, 'دفع للمورد').click()
    })
    await page.keyboard.press('Escape')
    await step('39-purchase-new', async () => go('/suppliers/purchases/new'))

    // ── offers, reports, search ──
    await step('40-offers', async () => go('/offers'))
    await step('41-offer-new', async () => {
      await btn(page, 'عرض جديد').click()
    })
    await page.keyboard.press('Escape')
    await step('42-pos-suggestion', async () => {
      await go('/pos')
      await search.fill('جراب')
      await expect(page.getByRole('button', { name: /جراب سيليكون iPhone/ }).first()).toBeVisible()
      await search.press('Enter')
      await expect(btn(page, 'إضافة')).toBeVisible()
    })
    await page.keyboard.press('Escape')
    await step('43-reports-sales', async () => {
      await go('/reports/sales')
      await expect(page.getByText('صافي المبيعات').first()).toBeVisible()
    })
    await step('44-reports-profit', async () => go('/reports/profit'))
    await step('45-reports-inventory', async () => go('/reports/inventory'))
    await step('46-search', async () => {
      await go('/dashboard')
      await page.keyboard.press('Control+k')
      await page.getByRole('textbox', { name: 'بحث' }).fill('سارة')
      await page.waitForTimeout(500)
    })
    await page.keyboard.press('Escape')

    // ── settings ──
    for (const [n, s] of [
      ['47-settings-company', 'company'],
      ['48-settings-pos', 'pos'],
      ['49-settings-printing', 'printing'],
      ['50-settings-users', 'users'],
      ['51-settings-roles', 'roles'],
      ['52-settings-backup', 'backup'],
      ['53-settings-license', 'license'],
      ['54-settings-qr', 'qr'],
      ['55-settings-audit', 'audit']
    ] as const) {
      await step(n, async () => go(`/settings/${s}`))
    }
    await step('56-backup-now', async () => {
      await go('/settings/backup')
      await btn(page, 'نسخة احتياطية الآن').click()
      await expect(page.getByText('تم حفظ النسخة الاحتياطية مشفرة')).toBeVisible({ timeout: 20_000 })
    })
    await step('57-new-user', async () => {
      await go('/settings/users')
      await btn(page, 'مستخدم جديد').click()
    })
    await page.keyboard.press('Escape')
    await step('58-lock', async () => {
      await page.getByRole('button', { name: 'قفل' }).last().click()
      await expect(page.getByText('أدخل الرقم السري')).toBeVisible()
    })
  } finally {
    console.log('[manual] missing shots:\n' + (failed.join('\n') || 'none'))
    await app.close()
  }
  expect(failed, 'every booklet screenshot should be captured').toEqual([])
})
