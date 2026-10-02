export interface SystemInfo {
  appVersion: string
  platform: string
  deviceId: string
  needsOnboarding: boolean
  dataDir: string
  dbSizeBytes: number
  migrationApplied: string[]
  language: 'ar' | 'en'
  theme: 'light' | 'dark' | 'system'
  storeName: string
}
