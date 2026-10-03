// Renders docs/manual/booklet.html to docs/manual/Central-Pro-User-Guide-AR.pdf.
// Screenshots come from `CENTRAL_MANUAL_SHOTS=1 xvfb-run -a npx playwright test tests/e2e/11-manual-shots.spec.ts`
// (test-results/manual), resized into docs/manual/img.
import { chromium } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../docs/manual')
// CHROMIUM_PATH: use an existing Chromium when Playwright's own build is not downloaded.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(join(dir, 'booklet.html')).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.pdf({
    path: join(dir, 'Central-Pro-User-Guide-AR.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  })
  console.log('Wrote docs/manual/Central-Pro-User-Guide-AR.pdf')
} finally {
  await browser.close()
}
