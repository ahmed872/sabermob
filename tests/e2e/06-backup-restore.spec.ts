import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, OWNER, onboard } from './flows'

test('backup now → change data → restore from the list brings the old data back', async () => {
  const first = await launchApp()
  const { page, dataDir } = first
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  try {
    await onboard(page)
    await loginWithPin(page)
    await createProduct(page, 'سماعة قبل النسخة', '90', '4')

    await page.goto(page.url().replace(/#.*$/, '#/settings/backup'))
    await expect(page.getByText('لا توجد نسخة احتياطية بعد').first()).toBeVisible()
    await page.getByRole('button', { name: 'نسخة احتياطية الآن' }).click()
    await expect(page.getByText('تم حفظ النسخة الاحتياطية مشفرة')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('cell', { name: 'يدوية' })).toBeVisible()
    await page.getByRole('button', { name: 'فحص' }).first().click()
    await expect(page.getByText(/النسخة سليمة/)).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: 'test-results/shots/backup.png', fullPage: true })

    await createProduct(page, 'سماعة بعد النسخة', '95', '4')
    await page.goto(page.url().replace(/#.*$/, '#/settings/backup'))
    await page.getByRole('row', { name: /يدوية/ }).getByRole('button', { name: 'استرجاع' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByText('سنترال الأمل')).toBeVisible()
    await dlg.getByLabel('كلمة مرور النسخ الاحتياطي').fill('wrong-password')
    await dlg.getByRole('checkbox').click()
    await dlg.getByRole('button', { name: 'استرجاع الآن' }).click()
    await expect(dlg.getByText('كلمة مرور النسخة الاحتياطية غير صحيحة.')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/restore-dialog.png' })
    await dlg.getByLabel('كلمة مرور النسخ الاحتياطي').fill(OWNER.password)
    const exited = new Promise<void>((resolve) => first.app.process().once('exit', () => resolve()))
    await dlg.getByRole('button', { name: 'استرجاع الآن' }).click()
    await exited
  } catch (err) {
    await first.app.close().catch(() => undefined)
    throw err
  }

  const second = await launchApp(dataDir)
  try {
    await loginWithPin(second.page)
    await second.page.goto(second.page.url().replace(/#.*$/, '#/inventory'))
    await expect(second.page.getByText('سماعة قبل النسخة')).toBeVisible()
    await expect(second.page.getByText('سماعة بعد النسخة')).toHaveCount(0)
    await second.page.goto(second.page.url().replace(/#.*$/, '#/settings/backup'))
    await expect(second.page.getByRole('cell', { name: 'قبل الاسترجاع' })).toBeVisible()
  } finally {
    await second.app.close()
  }
})
