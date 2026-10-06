import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { createProduct, loginWithPin, OWNER, onboard } from './flows'

// After a trial the owner wipes the test data from Settings → Backup.
test('start fresh: business data removed, store and login kept, safety backup listed', async () => {
  const first = await launchApp()
  const { page, dataDir } = first
  try {
    await onboard(page)
    await loginWithPin(page)
    await createProduct(page, 'صنف تجربة', '90', '4')

    await page.goto(page.url().replace(/#.*$/, '#/settings/backup'))
    await page.getByRole('button', { name: 'البدء من جديد…' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByText(/1 صنف/)).toBeVisible()
    await dlg.getByLabel('كلمة المرور بتاعتك').fill(OWNER.password)
    const go = dlg.getByRole('button', { name: 'امسح وابدأ من جديد' })
    await expect(go).toBeDisabled() // the confirmation word is missing
    await dlg.getByLabel('اكتب «امسح» للتأكيد').fill('امسح')
    await page.screenshot({ path: 'test-results/shots/start-fresh.png' })
    const exited = new Promise<void>((resolve) => first.app.process().once('exit', () => resolve()))
    await go.click()
    await exited
  } catch (err) {
    await first.app.close().catch(() => undefined)
    throw err
  }

  const second = await launchApp(dataDir)
  try {
    await loginWithPin(second.page) // the owner account is kept
    await expect(second.page.getByText('سنترال الأمل').first()).toBeVisible() // store details kept
    await second.page.goto(second.page.url().replace(/#.*$/, '#/inventory'))
    await expect(second.page.getByText('صنف تجربة')).toHaveCount(0)
    await second.page.goto(second.page.url().replace(/#.*$/, '#/settings/backup'))
    await expect(second.page.getByRole('cell', { name: 'قبل البدء من جديد' })).toBeVisible()
  } finally {
    await second.app.close()
  }
})
