import { DatabaseBackup } from 'lucide-react'
import { BackupSection } from '../backup/backup-section'
import type { SectionDef } from './settings-page'

/** Sections contributed by modules (backup & restore, data import). */
export const SETTINGS_EXTRA_SECTIONS: SectionDef[] = [{ key: 'backup', group: 'system', icon: DatabaseBackup, permission: ['manage_backups'], component: BackupSection }]
