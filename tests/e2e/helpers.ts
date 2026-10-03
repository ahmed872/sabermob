import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export const ROOT = resolve(__dirname, '../..')
// Electron 44 downloads its binary on first use; requiring the package resolves (and fetches) it.
const ELECTRON = createRequire(join(ROOT, 'package.json'))('electron') as string

export async function launchApp(dataDir?: string): Promise<{ app: ElectronApplication; page: Page; dataDir: string }> {
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), 'central-e2e-'))
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, CENTRAL_E2E_PDF_DIR: dir, CENTRAL_DATA_DIR: dir, CENTRAL_MAXIMIZE: '0', NODE_ENV: 'production', ELECTRON_RENDERER_URL: '' }
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1366, height: 800 })
  await page.waitForLoadState('domcontentloaded')
  return { app, page, dataDir: dir }
}
