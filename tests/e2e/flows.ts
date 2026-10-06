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
  // tap the on-screen pad (keystrokes sent in the first milliseconds after a restart can be lost)
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'submit' }).click()
  // Wait for the signed-in shell before deep-linking anywhere.
  await expect(page.getByRole('link', { name: 'الإعدادات' })).toBeVisible()
}

export async function createProduct(page: Page, name: string, price: string, stock: string, barcode?: string): Promise<void> {
  await page.goto(page.url().replace(/#.*$/, '#/inventory/products/new'))
  await page.getByLabel('اسم الصنف').fill(name)
  await page.getByLabel('سعر البيع').fill(price)
  await page.getByLabel('الكمية اللي عندك دلوقتي').fill(stock)
  if (barcode) {
    const input = page.getByPlaceholder('6221234567890')
    await input.fill(barcode)
    await input.press('Enter')
  }
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByText('تم حفظ الصنف').last()).toBeVisible()
}
