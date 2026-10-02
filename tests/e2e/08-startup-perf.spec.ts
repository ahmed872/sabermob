import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'
import { loginWithPin, onboard } from './flows'

test('cold start reaches the sign-in screen quickly', async () => {
  const first = await launchApp()
  await onboard(first.page)
  await loginWithPin(first.page)
  await first.app.close()
  const started = Date.now()
  const { app, page } = await launchApp(first.dataDir)
  try {
    await expect(page.getByText('أدخل الرقم السري')).toBeVisible()
    const ms = Date.now() - started
    console.log(`[perf] cold start to sign-in: ${ms} ms`)
    expect(ms).toBeLessThan(8000)
  } finally {
    await app.close()
  }
})
