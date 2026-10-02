import { expect, type Page } from '@playwright/test'

export const OWNER = { name: 'أحمد صابر', username: 'ahmed', password: 'secret123', pin: '2468' }

/** Completes the first-launch wizard in Arabic. */
export async function onboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'ابدأ' }).click()
  await page.getByRole('button', { name: 'العربية' }).click()
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByLabel('اسم المحل').fill('سنترال الأمل')
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByRole('button', { name: 'التالي' }).click() // currency defaults: EGP, no tax
  await page.getByLabel('الاسم بالكامل').fill(OWNER.name)
  await page.getByLabel('اسم المستخدم').fill(OWNER.username)
  await page.getByLabel('كلمة المرور', { exact: true }).fill(OWNER.password)
  await page.getByLabel('تأكيد كلمة المرور').fill(OWNER.password)
  await page.getByLabel('رقم سري سريع (اختياري)').fill(OWNER.pin)
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByRole('button', { name: 'تخطي' }).click() // printer
  await page.getByRole('button', { name: 'إنهاء' }).click()
  await expect(page.getByText('محلك جاهز!')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'دخول' }).click()
}

export async function loginWithPin(page: Page, pin = OWNER.pin): Promise<void> {
  await expect(page.getByText('أدخل الرقم السري')).toBeVisible()
  await page.keyboard.type(pin)
  await page.keyboard.press('Enter')
}
