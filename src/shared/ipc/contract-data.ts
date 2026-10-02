/** Contract for backup/restore, workspace bundles and data import. */
import type { BackupInspection, BackupRecordDto, BackupStatus, BackupVerification } from '../types/backup'

type Empty = Record<string, never> | undefined
type Ok = { ok: true }

export interface DataContract {
  'backup.status': { in: Empty; out: BackupStatus }
  'backup.list': { in: Empty; out: BackupRecordDto[] }
  'backup.create': { in: Empty; out: BackupRecordDto }
  'backup.verify': { in: { id: string }; out: BackupVerification }
  'backup.setPassword': { in: { password: string; currentPassword?: string }; out: Ok }
  'backup.unlock': { in: { password: string }; out: Ok }
  /** Describe a listed backup (`id`) or one picked from disk (no id). Null when the picker is cancelled. */
  'backup.inspect': { in: { id?: string }; out: BackupInspection | null }
  /** Replaces all data with the inspected backup, then restarts the app. */
  'backup.restore': { in: { token: string; password: string }; out: Ok }
  'backup.exportBundle': { in: Empty; out: { path: string | null } }
  'backup.chooseFolder': { in: { target: 'directory' | 'mirrorDirectory'; clear?: boolean }; out: { path: string | null } }
  'backup.openFolder': { in: Empty; out: Ok }
}
