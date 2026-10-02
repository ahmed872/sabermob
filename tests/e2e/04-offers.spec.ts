import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

test('smart offer: owner creates cross-sell, cashier sees and accepts it at checkout', async () => {
  const { app, page } = await launchApp()
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text().slice(0, 500)))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  try {
    await onboard(page)
    await loginWithPin(page)
    await createProduct(page, 'جراب iPhone 15', '150', '10')
    await createProduct(page, 'اسكرينة iPhone 15', '100', '10')

    await page.goto(page.url().replace(/#.*$/, '#/offers'))
    await page.getByRole('button', { name: 'عرض جديد' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('الاسم').fill('اسكرينة بخصم مع الجراب')
    const pickers = dlg.getByPlaceholder('أصناف')
    await pickers.nth(0).fill('جراب')
    await dlg.getByRole('button', { name: /جراب iPhone 15/ }).click()
    await pickers.nth(1).fill('اسكرينة')
    await dlg.getByRole('button', { name: /اسكرينة iPhone 15/ }).click()
    await dlg.getByRole('textbox').filter({ hasText: '' }).last()
    await dlg.locator('input[inputmode="decimal"]').first().fill('20')
    await dlg.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText('اسكرينة بخصم مع الجراب')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/offers.png' })

    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    await page.getByLabel('النقدية في الدرج').fill('0')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    const search = page.getByPlaceholder(/امسح الباركود/)
    await search.fill('جراب')
    await page.getByRole('button', { name: /جراب iPhone 15/ }).first().click()
    await expect(page.getByRole('button', { name: 'إضافة' })).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/pos-suggestion.png' })
    await page.getByRole('button', { name: 'إضافة' }).click()
    await expect(page.getByTestId('cart-total')).toHaveText(/230/)
    await page.keyboard.press('F8')
    await page.keyboard.press('F10')
    await expect(page.getByText('تم البيع')).toBeVisible()
  } finally {
    await app.close()
  }
})
