import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { loginWithPin, onboard } from './flows'

test('first launch → owner login → create product → find it in inventory', async () => {
  const { app, page } = await launchApp()
  try {
    await onboard(page)
    await loginWithPin(page)
    await page.getByRole('link', { name: /المخزن/ }).click()
    await expect(page.getByRole('heading', { name: 'المخزن' })).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'test-results/shots/inventory-empty.png' })

    await page.getByRole('button', { name: 'صنف جديد' }).click()
    await page.getByLabel('اسم الصنف').fill('جراب سيليكون A55')
    await page.getByLabel('سعر البيع').fill('150')
    await page.getByLabel('سعر التكلفة').fill('60')
    await page.getByLabel('الكمية الافتتاحية').fill('12')
    await page.screenshot({ path: 'test-results/shots/product-editor.png' })
    await page.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText('تم حفظ الصنف')).toBeVisible()

    await page.goto(page.url().replace(/#.*$/, '#/inventory'))
    await page.getByPlaceholder(/ابحث/).fill('a55')
    await expect(page.getByRole('cell', { name: /جراب سيليكون A55/ })).toBeVisible()
    await expect(page.getByRole('cell', { name: /تغيير شاشة/ })).toHaveCount(0)
    await expect(page.getByText('12', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/inventory-list.png' })
  } finally {
    await app.close()
  }
})
