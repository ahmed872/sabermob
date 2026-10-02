// Quick manual smoke run: onboarding → login → screenshot.
import { _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const ROOT = resolve(import.meta.dirname, '../..')
const dir = process.env.DATA_DIR || mkdtempSync(join(tmpdir(), 'central-smoke-'))
const shots = process.env.SHOTS || '/tmp/claude-0/shots'
const app = await electron.launch({
  executablePath: join(ROOT, 'node_modules/electron/dist/electron'),
  args: [ROOT, '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, CENTRAL_DATA_DIR: dir, CENTRAL_MAXIMIZE: '0', ELECTRON_RENDERER_URL: '' }
})
app.process().stderr.on('data', (d) => process.stderr.write('[electron] ' + d))
const page = await app.firstWindow()
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.setViewportSize({ width: 1366, height: 800 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${shots}/01-start.png` })
console.log('title', await page.title(), 'dir', dir)
await app.close()
