// Refuses to build a release installer that still trusts the development
// license key (anyone with this repository could generate activation keys).
import { readFileSync } from 'node:fs'

const dev = readFileSync(new URL('./license/dev-public-key.pem', import.meta.url), 'utf8').trim()
const active = readFileSync(new URL('../src/main/license/public-key.ts', import.meta.url), 'utf8')
if (active.includes(dev.split('\n')[1])) {
  console.error('\n✖ Release blocked: the app still uses the DEVELOPMENT license public key.')
  console.error('  Run "npm run license:init" once on your secure machine, keep license-keys/ safe, then rebuild.\n')
  process.exit(1)
}
console.log('✔ Release check passed: production license key in use.')
