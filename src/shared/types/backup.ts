export type BackupKind = 'AUTO' | 'MANUAL' | 'PRE_RESTORE' | 'PRE_UPDATE' | 'PRE_RESET' | 'BUNDLE'

/** What "start fresh" removes (counts shown before confirming). */
export interface ResetSummary {
  sales: number
  products: number
  customers: number
  suppliers: number
  repairs: number
}

export interface BackupRecordDto {
  id: string
  kind: string
  fileName: string
  sizeBytes: number
  status: string
  verifiedAt: string | null
  createdAt: string
  error: string | null
  exists: boolean
}

export interface BackupStatus {
  /** a backup password has been set */
  configured: boolean
  /** the data key is available on this PC (automatic backups can run) */
  unlocked: boolean
  /** how the local key copy is protected: by the OS account, or not */
  protection: 'os' | 'plain'
  lastSuccessAt: string | null
  lastAutoAt: string | null
  nextAutoAt: string | null
  directory: string
  defaultDirectory: string
  mirrorDirectory: string | null
  autoEnabled: boolean
  intervalHours: number
  keepCount: number
  backupOnExit: boolean
}

/** What a backup file contains, shown before restoring. */
export interface BackupInspection {
  token: string
  fileName: string
  kind: string
  createdAt: string
  shopName: string
  appVersion: string
  sizeBytes: number
  counts: Record<string, number>
  /** made by a newer version of the app: cannot be restored here */
  newer: boolean
}

export interface BackupVerification {
  ok: boolean
  counts: Record<string, number>
  integrity: string
}
