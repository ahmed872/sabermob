import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

test('repairs: intake → deliver; suppliers: create → purchase receives stock', async () => {
  const { app, page } = await launchApp()
  try {
    await onboard(page)
    await loginWithPin(page)
    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    await page.getByLabel('النقدية في الدرج').fill('0')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    await expect(page.getByText(/وردية مفتوحة/)).toBeVisible()

    // Repair intake
    await page.goto(page.url().replace(/#.*$/, '#/repairs/new'))
    await page.getByLabel('الموبايل').fill('01012345678')
    await page.getByLabel('الاسم', { exact: true }).fill('محمود علي')
    await page.getByLabel('الموديل').fill('iPhone 12')
    await page.getByLabel('شكوى العميل').fill('الشاشة مكسورة')
    await page.getByLabel('السعر المبدئي').fill('1500')
    await page.getByLabel('عربون').fill('500')
    await page.screenshot({ path: 'test-results/shots/repair-new.png' })
    await page.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText('RP-0001')).toBeVisible()

    await page.getByLabel('المصنعية').fill('1500')
    await page.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText('تم الحفظ').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/repair-detail.png' })
    await page.getByRole('button', { name: 'تسليم للعميل' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'تسليم للعميل' }).click()
    await expect(page.getByText('تم التسليم').first()).toBeVisible()

    // Supplier + purchase
    await createProduct(page, 'شاشة iPhone 12 أصلية', '1200', '0')
    await page.goto(page.url().replace(/#.*$/, '#/suppliers'))
    await page.getByRole('button', { name: 'مورد جديد' }).click()
    await page.getByRole('dialog').getByLabel('الاسم').fill('مؤسسة النور')
    await page.getByRole('dialog').getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByRole('heading', { name: 'مؤسسة النور' })).toBeVisible()
    await page.getByRole('button', { name: 'فاتورة شراء' }).first().click()
    await page.getByPlaceholder(/ابحث/).fill('شاشة')
    await page.getByRole('button', { name: /شاشة iPhone 12/ }).click()
    await page.getByLabel('تكلفة القطعة').fill('800')
    await page.getByLabel('الكمية').fill('3')
    await page.screenshot({ path: 'test-results/shots/purchase-editor.png' })
    await page.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText(/علينا له/).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/supplier-detail.png' })
  } finally {
    await app.close()
  }
})
