import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { onboard } from './flows'

// The full recovery (vendor-signed key) is covered by tests/integration/password-recovery.test.ts;
// here: the login screen offers it, shows the code, and explains a wrong key.
test('forgot password: dialog shows the recovery code and refuses a wrong key clearly', async () => {
  const { app, page } = await launchApp()
  try {
    await onboard(page)
    await page.getByRole('button', { name: 'نسيت كلمة المرور؟' }).click()
    await expect(page.getByTestId('recovery-code')).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{1,4}){5}$/)
    const dlg = page.getByRole('dialog')
    await dlg.getByPlaceholder('الصق مفتاح الاستعادة هنا').fill('A'.repeat(128))
    await dlg.getByLabel('كلمة المرور الجديدة').fill('new-owner-pass-7')
    await dlg.getByLabel('تأكيد كلمة المرور').fill('new-owner-pass-7')
    await dlg.getByRole('button', { name: 'تغيير كلمة المرور' }).click()
    await expect(dlg.getByText(/مفتاح الاستعادة ده مش صالح/)).toBeVisible()
  } finally {
    await app.close()
  }
})
