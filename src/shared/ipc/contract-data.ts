/** Contract for backup/restore, workspace bundles and data import. */
import type { BackupInspection, BackupRecordDto, BackupStatus, BackupVerification, ResetSummary } from '../types/backup'
import type { ImportEntity, ImportMapping, ImportParseResult, ImportPreview, ImportResult } from '../import'

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
  /** "Start fresh": what would be removed. */
  'data.resetSummary': { in: Empty; out: ResetSummary }
  /** Owner only: safety backup, then remove the business data; the app restarts. */
  'data.reset': { in: { password: string; confirm: 'RESET'; clearCatalog: boolean }; out: Ok }

  /** `data` is the file content as base64 (CSV or XLSX, max 15 MB). */
  'import.parse': { in: { entity: ImportEntity; fileName: string; data: string }; out: ImportParseResult }
  'import.preview': { in: { token: string; entity: ImportEntity; mapping: ImportMapping }; out: ImportPreview }
  'import.commit': { in: { token: string; entity: ImportEntity; mapping: ImportMapping; mode: 'skip' | 'update' }; out: ImportResult }
}
