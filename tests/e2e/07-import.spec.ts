import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { loginWithPin, onboard } from './flows'

test('import products from a CSV: auto-mapped columns, problems shown, valid rows added', async () => {
  const { app, page } = await launchApp()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  try {
    await onboard(page)
    await loginWithPin(page)
    await page.getByRole('link', { name: 'المخزن' }).click()
    await page.getByRole('button', { name: 'استيراد' }).click()
    const csv = ['اسم الصنف,سعر البيع,الكمية,الباركود', 'شاحن مستورد,250,7,6229990000011', 'كابل مستورد,٧٥,12,', ',10,1,'].join('\n')
    await page.getByTestId('import-file').setInputFiles({ name: 'أصناف.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + csv) })
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByText('3 صف')).toBeVisible()
    await expect(dlg.getByLabel('سعر البيع')).toHaveValue('1')
    await page.screenshot({ path: 'test-results/shots/import-columns.png' })
    await dlg.getByRole('button', { name: 'مراجعة البيانات' }).click()
    await expect(dlg.getByText('ناقص')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/import-check.png' })
    await dlg.getByRole('button', { name: 'استيراد 2 صف' }).click()
    await expect(dlg.getByText('تم الاستيراد')).toBeVisible({ timeout: 20_000 })
    await dlg.getByRole('button', { name: 'إغلاق' }).first().click()
    await page.getByPlaceholder(/ابحث/).fill('مستورد')
    await expect(page.getByText('شاحن مستورد')).toBeVisible()
    await expect(page.getByText('كابل مستورد')).toBeVisible()
  } finally {
    await app.close()
  }
})
