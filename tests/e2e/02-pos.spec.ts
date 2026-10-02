import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

test('POS: open shift → scan → pay cash with change → sale in history, stock reduced', async () => {
  const { app, page, dataDir } = await launchApp()
  try {
    await onboard(page)
    await loginWithPin(page)
    await createProduct(page, 'شاحن أنكر 20 وات', '350', '5', '6901234567892')
    await createProduct(page, 'كابل تايب سي', '120', '10')

    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    await expect(page.getByText('ابدأ ورديتك')).toBeVisible()
    await page.getByLabel('النقدية في الدرج').fill('500')
    await page.getByRole('button', { name: 'فتح وردية' }).click()

    // Scan the charger barcode into the search box, then search & tap the cable
    const search = page.getByPlaceholder(/امسح الباركود/)
    await search.fill('6901234567892')
    await search.press('Enter')
    await search.fill('كابل')
    await page.getByRole('button', { name: /كابل تايب سي/ }).first().click()
    await expect(page.getByTestId('cart-total')).toHaveText(/470/)
    await page.screenshot({ path: 'test-results/shots/pos-cart.png' })

    await page.keyboard.press('F8')
    await expect(page.getByRole('heading', { name: 'الدفع' })).toBeVisible()
    await page.getByRole('button', { name: /500/ }).first().click()
    await expect(page.getByText('الباقي', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/pos-payment.png' })
    await page.keyboard.press('F10')
    await expect(page.getByText('تم البيع')).toBeVisible()
    await expect(page.getByText('الباقي للعميل')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/pos-done.png' })
    // A4 invoice preview + PDF rendered by the hidden print window
    await page.getByRole('button', { name: 'فاتورة A4' }).click()
    await expect(page.getByText('سنترال الأمل').last()).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/invoice-preview.png' })
    await page.getByRole('button', { name: 'حفظ PDF' }).click()
    await expect.poll(() => existsSync(`${dataDir}/S-000001.pdf`), { timeout: 20_000 }).toBe(true)
    expect(readFileSync(`${dataDir}/S-000001.pdf`).subarray(0, 4).toString()).toBe('%PDF')
    // No printer in CI: printing fails gracefully, sale stays saved
    await page.getByRole('button', { name: 'طباعة', exact: true }).click()
    await expect(page.getByText(/الطابعة غير متاحة/)).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('cart-total')).toHaveText(/0/)

    await page.getByRole('button', { name: 'سجل المبيعات' }).click()
    await expect(page.getByText('S-000001')).toBeVisible()
    await page.getByText('S-000001').click()
    await expect(page.getByText('شاحن أنكر 20 وات')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/sale-detail.png' })
    await page.keyboard.press('Escape')

    await page.goto(page.url().replace(/#.*$/, '#/inventory'))
    await page.getByPlaceholder(/ابحث/).fill('شاحن')
    await expect(page.getByRole('cell', { name: '4', exact: true })).toBeVisible()
  } finally {
    await app.close()
  }
})
