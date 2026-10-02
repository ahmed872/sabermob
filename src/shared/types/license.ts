export interface LicenseState {
  status: 'TRIAL' | 'TRIAL_EXPIRED' | 'ACTIVE' | 'EXPIRED'
  tier: 'TRIAL' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE'
  /** business operations allowed */
  operational: boolean
  /** days until trial/license ends; null = lifetime license */
  daysLeft: number | null
  expiresAt: string | null
  inGrace: boolean
  serial: number | null
  requestCode: string
  trialStartedAt: string
  trialEndsAt: string
  clockWarning: boolean
  maxUsers: number
}
