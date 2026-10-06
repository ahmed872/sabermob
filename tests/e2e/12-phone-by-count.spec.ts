import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { loginWithPin, onboard } from './flows'

// A real shop case: a new phone saved without IMEIs, quantity set by a stock count,
// then tapped several times at the counter. It must be one line and sell normally.
test('phone stocked by count: one cart line, + works, sale completes', async () => {
  const { app, page } = await launchApp()
  const go = (h: string) => page.goto(page.url().replace(/#.*$/, `#${h}`))
  try {
    await onboard(page)
    await loginWithPin(page)
    await go('/inventory/products/new')
    await page.getByRole('button', { name: /موبايل جديد/ }).click()
    await page.getByLabel('اسم الصنف').fill('ايفون')
    await page.getByLabel('سعر البيع').fill('10000')
    await page.getByRole('button', { name: 'حفظ' }).click() // IMEI mode, no IMEIs typed → quantity 0
    await expect(page.getByText('تم حفظ الصنف').last()).toBeVisible()

    // quantity 10 from the product screen (a stock count)
    await page.getByRole('button', { name: 'تعديل الكمية' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[inputmode]').first().fill('10')
    await dialog.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText(/تم تحديث المخزون/).last()).toBeVisible()

    await go('/pos')
    await page.getByLabel('النقدية في الدرج').fill('500')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    const search = page.getByPlaceholder(/امسح الباركود/)
    await search.fill('ايفون')
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /ايفون/ }).first().click()
    await page.getByRole('button', { name: '+' }).first().click()
    await expect(page.getByTestId('cart-total')).toHaveText(/40,000/)
    await expect(page.getByRole('button', { name: '+' })).toHaveCount(1) // one line, not four
    await page.keyboard.press('F8')
    await page.getByRole('button', { name: 'المبلغ بالضبط' }).click()
    await page.keyboard.press('F10')
    await expect(page.getByText('تم البيع')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/phone-by-count-sold.png' })
  } finally {
    await app.close()
  }
})
