import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

test('owner lands on the dashboard, reports export, Ctrl+K search finds a product', async () => {
  const { app, page, dataDir } = await launchApp()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  try {
    await onboard(page)
    await loginWithPin(page)
    await expect(page.getByText(/يومك سعيد يا/)).toBeVisible()
    await expect(page.getByText('مبيعات اليوم')).toBeVisible()

    await createProduct(page, 'شاحن سامسونج 25 وات', '250', '5')
    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    await page.getByLabel('النقدية في الدرج').fill('0')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    await page.getByPlaceholder(/امسح الباركود/).fill('شاحن')
    await page.getByRole('button', { name: /شاحن سامسونج/ }).first().click()
    await page.keyboard.press('F8')
    await page.keyboard.press('F10')
    await expect(page.getByText('تم البيع')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'الرئيسية' }).click()
    await expect(page.getByText('250 ج.م').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/dashboard.png' })

    await page.getByRole('link', { name: 'التقارير' }).click()
    await expect(page.getByText('صافي المبيعات').first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'شاحن سامسونج 25 وات' })).toBeVisible()
    await page.getByRole('button', { name: 'Excel' }).last().click()
    await expect(page.getByText(/تم الحفظ/)).toBeVisible()
    expect(existsSync(join(dataDir, 'الأصناف الأكثر مبيعاً.xlsx'))).toBe(true)
    await page.getByRole('tab', { name: 'الأرباح' }).click()
    await expect(page.getByText('صافي الربح التقديري').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/reports-profit.png' })

    await page.keyboard.press('Control+k')
    const input = page.getByRole('textbox', { name: 'بحث' })
    await input.fill('سامسونج')
    await expect(page.getByRole('dialog').getByText('شاحن سامسونج 25 وات')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/global-search.png' })
    await input.press('Enter')
    await expect(page.getByLabel('اسم الصنف')).toHaveValue('شاحن سامسونج 25 وات')
  } finally {
    await app.close()
  }
})
