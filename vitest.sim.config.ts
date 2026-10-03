import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Day boundaries, DST and 'localtime' SQL must behave like a shop PC in Egypt.
process.env.TZ = 'Africa/Cairo'

// Multi-year shop simulation: `npm run test:sim` (slow; not part of `npm test`).
// SIM_DAYS=60 npm run test:sim for a quick run.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: { include: ['tests/sim/**/*.test.ts'], environment: 'node', pool: 'forks', testTimeout: 4 * 3600_000, hookTimeout: 600_000 }
})
