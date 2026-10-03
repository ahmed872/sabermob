// Smoke test of the packaged app (run after `npm run dist:linux`):
//   xvfb-run -a npx playwright test --config tests/e2e/packaged.config.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { ROOT } from './helpers'
import { createProduct, loginWithPin, onboard } from './flows'

test('packaged app: first launch, product, sale', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'central-packaged-'))
  const app = await electron.launch({
    executablePath: join(ROOT, 'dist/linux-unpacked/central-pro'),
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
  } finally {
    await app.close()
  }
})
