import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { loginWithPin, onboard } from './flows'

// The optional product photo: added in the product screen, shown on the sale screen,
// and the product saves fine without one.
test('product photo: optional, saved, shown on the POS tile', async () => {
  const { app, page } = await launchApp()
  const go = (h: string) => page.goto(page.url().replace(/#.*$/, `#${h}`))
  try {
    await onboard(page)
    await loginWithPin(page)

    // without a photo
    await go('/inventory/products/new')
    await page.getByLabel('اسم الصنف').fill('شاحن بدون صورة')
    await page.getByLabel('سعر البيع').fill('150')
    await page.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText('تم حفظ الصنف').last()).toBeVisible()
    await expect(page.getByTestId('product-photo')).toHaveCount(0)

    // with a photo
    await go('/inventory/products/new')
    await page.getByLabel('اسم الصنف').fill('جراب أزرق')
    await page.getByLabel('سعر البيع').fill('120')
    await page.locator('input[type=file]').setInputFiles(resolve(__dirname, 'fixtures/product-photo.png'))
    await expect(page.getByTestId('product-photo')).toBeVisible()
    await page.getByRole('button', { name: 'حفظ' }).click()
    await expect(page.getByText('تم حفظ الصنف').last()).toBeVisible()
    await expect(page.getByTestId('product-photo')).toHaveAttribute('src', /^app:\/\/media\/products\//)
    await page.screenshot({ path: 'test-results/shots/product-photo-editor.png' })

    await go('/pos')
    await page.getByLabel('النقدية في الدرج').fill('500')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    await page.getByPlaceholder(/امسح الباركود/).fill('جراب')
    const tile = page.getByRole('button', { name: /جراب أزرق/ }).first()
    await expect(tile.locator('img')).toBeVisible()
    // the picture really loads from the media folder
    expect(await tile.locator('img').evaluate((el) => { const img = el as unknown as { complete: boolean; naturalWidth: number }; return img.complete && img.naturalWidth > 0 })).toBe(true)
    await page.screenshot({ path: 'test-results/shots/product-photo-pos.png' })
  } finally {
    await app.close()
  }
})
