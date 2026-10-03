import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Stress / performance suite: `npm run test:perf` (slow; not part of `npm test`).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: { include: ['tests/perf/**/*.test.ts'], environment: 'node', pool: 'forks', testTimeout: 600_000, hookTimeout: 600_000 }
})
