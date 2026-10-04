export interface LicenseState {
  status: 'TRIAL' | 'TRIAL_EXPIRED' | 'ACTIVE' | 'EXPIRED'
  tier: 'TRIAL' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE'
  /** what the customer has: the free trial, a (3-month) subscription, or a lifetime key */
  plan: 'TRIAL' | 'SUBSCRIPTION' | 'LIFETIME'
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
