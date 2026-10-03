import { defineConfig } from '@playwright/test'

export default defineConfig({ testDir: '.', testMatch: 'packaged.smoke.ts', workers: 1, timeout: 120_000, reporter: 'list' })
