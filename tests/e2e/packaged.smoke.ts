// Smoke test of the packaged app (run after `npm run dist:linux` or `dist:win`):
//   xvfb-run -a npx playwright test --config tests/e2e/packaged.config.ts
// CENTRAL_APP_EXE points at another executable (e.g. the copy installed by the NSIS installer).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { ROOT } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

test('packaged app: first launch, product, sale, encrypted backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'central-packaged-'))
  const app = await electron.launch({
    executablePath: process.env.CENTRAL_APP_EXE ?? (process.platform === 'win32' ? join(ROOT, 'dist/win-unpacked/Central Pro.exe') : join(ROOT, 'dist/linux-unpacked/central-pro')),
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...process.env, CENTRAL_DATA_DIR: dir, CENTRAL_E2E_PDF_DIR: dir, CENTRAL_MAXIMIZE: '0' }
  })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1366, height: 800 })
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    await onboard(page)
    await loginWithPin(page)
    await createProduct(page, 'منتج من النسخة المجمعة', '100', '3')
    await page.goto(page.url().replace(/#.*$/, '#/pos'))
    await page.getByLabel('النقدية في الدرج').fill('0')
    await page.getByRole('button', { name: 'فتح وردية' }).click()
    await page.getByPlaceholder(/امسح الباركود/).fill('النسخة المجمعة')
    await page.getByRole('button', { name: /منتج من النسخة المجمعة/ }).first().click()
    await page.keyboard.press('F8')
    await page.keyboard.press('F10')
    await expect(page.getByText('تم البيع')).toBeVisible()
    await page.keyboard.press('Escape')

    // Backup uses the OS key store (DPAPI on Windows) and the bundled SQLite driver.
    await page.goto(page.url().replace(/#.*$/, '#/settings/backup'))
    await page.getByRole('button', { name: 'نسخة احتياطية الآن' }).click()
    await expect(page.getByText('تم حفظ النسخة الاحتياطية مشفرة')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'فحص' }).first().click()
    await expect(page.getByText(/النسخة سليمة/)).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: 'test-results/shots/packaged-backup.png' })
  } finally {
    await app.close()
  }
})
