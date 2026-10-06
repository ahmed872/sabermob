import { randomBytes, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import Database from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type { BackupInspection, BackupKind, BackupRecordDto, BackupStatus, BackupVerification } from '@shared/types/backup'
import type { Loggers } from '../core/logger'
import type { Mutex } from '../core/mutex'
import type { AppPaths } from '../core/paths'
import type { Db } from '../database/client'
import type { AuditService } from '../services/audit-service'
import type { SettingsService } from '../services/settings-service'
import { extractArchive, keyIdOf, readHeader, unwrapKey, wrapKey, writeArchive, type ArchiveEntry, type WrappedKey } from './archive'

/** Protects the local copy of the backup key (Windows DPAPI via Electron safeStorage). */
export interface KeyProtector {
  kind: 'os' | 'plain'
  protect(data: Buffer): string
  unprotect(blob: string): Buffer
}

export const plainKeyProtector: KeyProtector = {
  kind: 'plain',
  protect: (d) => d.toString('base64'),
  unprotect: (b) => Buffer.from(b, 'base64')
}

const WRAP_SETTING = 'backup.wrap'
const RESTORE_JOURNAL = 'restore-journal.json'

/** Puts the data that was being replaced back in place. */
function rollbackSwap(paths: AppPaths, old: string): void {
  const oldDb = join(old, 'central.db')
  if (existsSync(oldDb)) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(paths.database + suffix, { force: true })
    renameSync(oldDb, paths.database)
  }
  const oldMedia = join(old, 'media')
  if (existsSync(oldMedia)) {
    rmSync(paths.media, { recursive: true, force: true })
    renameSync(oldMedia, paths.media)
  }
  rmSync(old, { recursive: true, force: true })
}

/**
 * Runs at startup before the database is opened: a restore interrupted in
 * the middle of swapping files (power loss) is rolled back to the old data.
 */
export function recoverInterruptedRestore(paths: AppPaths, log: Loggers): boolean {
  const journal = join(paths.root, RESTORE_JOURNAL)
  if (!existsSync(journal)) return false
  try {
    const { old } = JSON.parse(readFileSync(journal, 'utf8')) as { old: string }
    if (old && existsSync(old)) rollbackSwap(paths, old)
    log.app.warn('Interrupted restore rolled back; previous data kept', { old })
  } finally {
    rmSync(journal, { force: true })
  }
  return true
}
const COUNT_TABLES = { products: 'Product', customers: 'Customer', sales: 'Sale', repairs: 'Repair', suppliers: 'Supplier', users: 'User' } as const
const EXT = { backup: '.cpbak', bundle: '.centralbundle' }

export interface BackupDeps {
  db: Db
  paths: AppPaths
  settings: SettingsService
  audit: AuditService
  gate: Mutex
  log: Loggers
  deviceId: string
  appVersion: string
  knownMigrations: string[]
  protector: KeyProtector
  now: () => Date
}

/**
 * Encrypted backups, restore and workspace bundles.
 *
 * A random 256-bit data key encrypts every archive. Each archive carries
 * that key wrapped with the backup password (scrypt + AES-GCM), so any
 * backup can be restored on any PC with the password alone. A copy of the
 * key protected by the OS account lets automatic backups run unattended.
 * Changing the password re-wraps the same key; older files keep the
 * password they were made with.
 */
export class BackupService {
  #key: Buffer | null = null
  #picked = new Map<string, string>()
  #restoring = false
  #restartRequired = false

  constructor(private readonly d: BackupDeps) {}

  get restoring(): boolean {
    return this.#restoring
  }

  /** The database was closed for a restore (successful or rolled back): the app must restart. */
  get restartRequired(): boolean {
    return this.#restartRequired
  }

  get #keystore(): string {
    return join(this.d.paths.root, 'backup-key.json')
  }

  async init(): Promise<void> {
    await this.#consumeRestoreMarker()
    const wrap = await this.#wrap()
    if (!wrap || !existsSync(this.#keystore)) return
    try {
      const stored = JSON.parse(readFileSync(this.#keystore, 'utf8')) as { keyId: string; data: string }
      const key = this.d.protector.unprotect(stored.data)
      if (keyIdOf(key) === wrap.keyId) this.#key = key
      else this.d.log.app.warn('Local backup key does not match this workspace; backup password needed')
    } catch (err) {
      this.d.log.app.warn('Local backup key unreadable; backup password needed', { message: String(err) })
    }
  }

  async #wrap(): Promise<WrappedKey | null> {
    const raw = await this.d.settings.getRaw(WRAP_SETTING)
    return raw ? (JSON.parse(raw) as WrappedKey) : null
  }

  #storeLocal(key: Buffer): void {
    writeFileSync(this.#keystore, JSON.stringify({ keyId: keyIdOf(key), data: this.d.protector.protect(key) }))
    this.#key = key
  }

  get directory(): string {
    return this.d.settings.get('backup').directory || this.d.paths.backups
  }

  async status(): Promise<BackupStatus> {
    const cfg = this.d.settings.get('backup')
    const [last, lastAuto] = await Promise.all([
      this.d.db.backupRecord.findFirst({ where: { status: 'SUCCESS' }, orderBy: { createdAt: 'desc' } }),
      this.d.db.backupRecord.findFirst({ where: { status: 'SUCCESS', kind: 'AUTO' }, orderBy: { createdAt: 'desc' } })
    ])
    const configured = (await this.#wrap()) !== null
    const next = cfg.autoEnabled && configured ? new Date((lastAuto?.createdAt.getTime() ?? this.d.now().getTime()) + cfg.intervalHours * 3_600_000) : null
    return {
      configured,
      unlocked: this.#key !== null,
      protection: this.d.protector.kind,
      lastSuccessAt: last?.createdAt.toISOString() ?? null,
      lastAutoAt: lastAuto?.createdAt.toISOString() ?? null,
      nextAutoAt: next?.toISOString() ?? null,
      directory: this.directory,
      defaultDirectory: this.d.paths.backups,
      mirrorDirectory: cfg.mirrorDirectory,
      autoEnabled: cfg.autoEnabled,
      intervalHours: cfg.intervalHours,
      keepCount: cfg.keepCount,
      backupOnExit: cfg.backupOnExit
    }
  }

  /**
   * Sets or changes the backup password. The first call creates the data
   * key. Changing it needs the key on this PC (or the current password).
   */
  async setPassword(password: string, userId: string | null, currentPassword?: string): Promise<void> {
    if (password.length < 6) throw new AppError('VALIDATION', 'Password too short', { reason: 'backupPasswordShort' })
    const wrap = await this.#wrap()
    let key = this.#key
    if (wrap && !key) {
      if (!currentPassword) throw new AppError('BACKUP_PASSWORD')
      key = unwrapKey(wrap, currentPassword)
    }
    key ??= randomBytes(32)
    await this.d.settings.setRaw(WRAP_SETTING, JSON.stringify(wrapKey(key, password)))
    this.#storeLocal(key)
    await this.d.audit.log({ userId, action: wrap ? 'backup.password_changed' : 'backup.password_set' })
  }

  /** Re-enables automatic backups on this PC after the local key was lost. */
  async unlock(password: string, userId: string | null): Promise<void> {
    const wrap = await this.#wrap()
    if (!wrap) throw new AppError('INVALID_STATE', 'No backup password set', { reason: 'noBackupPassword' })
    this.#storeLocal(unwrapKey(wrap, password))
    await this.d.audit.log({ userId, action: 'backup.unlocked' })
  }

  async list(): Promise<BackupRecordDto[]> {
    const rows = await this.d.db.backupRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      fileName: basename(r.filePath),
      sizeBytes: r.sizeBytes,
      status: r.status,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      error: r.error,
      exists: existsSync(r.filePath)
    }))
  }

  #requireKey(): Buffer {
    if (!this.#key) throw new AppError('BACKUP_PASSWORD', 'Backup key locked')
    return this.#key
  }

  /** Consistent copy of the live database (a WAL reader never blocks the app). */
  #snapshot(target: string): { migrations: string[]; counts: Record<string, number> } {
    rmSync(target, { force: true })
    const src = new Database(this.d.paths.database, { readonly: true, fileMustExist: true })
    try {
      src.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    } finally {
      src.close()
    }
    return inspectDb(target)
  }

  #mediaEntries(): ArchiveEntry[] {
    const out: ArchiveEntry[] = []
    const walk = (dir: string) => {
      if (!existsSync(dir)) return
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.isFile()) out.push({ name: `media/${relative(this.d.paths.media, p).split(sep).join('/')}`, path: p })
      }
    }
    walk(this.d.paths.media)
    return out
  }

  /** Creates an encrypted backup (or a bundle when `target` is given). */
  async create(kind: BackupKind, userId: string | null, target?: string): Promise<BackupRecordDto> {
    const key = this.#requireKey()
    const wrap = (await this.#wrap())!
    const stamp = this.d.now().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = kind === 'BUNDLE' ? EXT.bundle : EXT.backup
    // Two backups in the same second must not overwrite each other.
    let file = target ?? join(this.directory, `central-${kind.toLowerCase()}-${stamp}${ext}`)
    for (let n = 2; !target && existsSync(file); n++) file = join(this.directory, `central-${kind.toLowerCase()}-${stamp}-${n}${ext}`)
    const snap = join(this.d.paths.temp, `snapshot-${randomUUID()}.db`)
    let record: BackupRecordDto
    try {
      const { migrations, counts } = this.#snapshot(snap)
      const media = this.#mediaEntries()
      const entries = [{ name: 'db/central.db', path: snap }, ...media]
      const { sha256, size } = await writeArchive(
        file,
        {
          kind,
          createdAt: this.d.now().toISOString(),
          appVersion: this.d.appVersion,
          deviceId: this.d.deviceId,
          shopName: this.d.settings.get('company').storeName,
          migrations,
          counts,
          files: entries.length,
          bytes: entries.reduce((n, e) => n + statSync(e.path).size, 0),
          wrap
        },
        entries,
        key
      )
      const row = await this.d.gate.run(() => this.d.db.backupRecord.create({ data: { kind, filePath: file, sizeBytes: size, sha256, status: 'SUCCESS', createdBy: userId, createdAt: this.d.now() } }))
      record = (await this.d.gate.run(() => this.list())).find((r) => r.id === row.id)!
      this.d.log.app.info('Backup created', { kind, file, size })
    } catch (err) {
      this.d.log.app.error('Backup failed', { kind, message: String(err) })
      await this.d.gate.run(() => this.d.db.backupRecord.create({ data: { kind, filePath: file, status: 'FAILED', error: String(err).slice(0, 500), createdBy: userId, createdAt: this.d.now() } }))
      throw err instanceof AppError ? err : new AppError(/ENOSPC/.test(String(err)) ? 'DISK_FULL' : 'FILE_ERROR', String(err))
    } finally {
      rmSync(snap, { force: true })
    }
    await this.d.gate.run(() => this.d.audit.log({ userId, action: 'backup.created', entity: 'BackupRecord', entityId: record.id, metadata: { kind, size: record.sizeBytes } }))
    if (kind === 'AUTO' || kind === 'MANUAL') {
      this.#mirror(file)
      if (kind === 'AUTO') await this.#prune()
    }
    return record
  }

  #mirror(file: string): void {
    const dir = this.d.settings.get('backup').mirrorDirectory
    if (!dir) return
    try {
      mkdirSync(dir, { recursive: true })
      copyFileSync(file, join(dir, basename(file)))
    } catch (err) {
      // A missing USB drive must never break the backup itself.
      this.d.log.app.warn('Backup mirror copy failed', { dir, message: String(err) })
    }
  }

  /** Keeps the newest `keepCount` automatic backups. */
  async #prune(): Promise<void> {
    const keep = this.d.settings.get('backup').keepCount
    const old = await this.d.gate.run(() => this.d.db.backupRecord.findMany({ where: { kind: 'AUTO', status: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, skip: keep }))
    for (const r of old) {
      rmSync(r.filePath, { force: true })
      await this.d.gate.run(() => this.d.db.backupRecord.delete({ where: { id: r.id } }))
    }
  }

  async #fileOf(id: string): Promise<string> {
    const r = await this.d.gate.run(() => this.d.db.backupRecord.findUnique({ where: { id } }))
    if (!r || !existsSync(r.filePath)) throw new AppError('NOT_FOUND')
    return r.filePath
  }

  /** Decrypts to a scratch folder and checks the database inside. */
  async #check(file: string, key: Buffer): Promise<{ dir: string; verification: BackupVerification; migrations: string[] }> {
    const dir = join(this.d.paths.temp, `verify-${randomUUID()}`)
    try {
      await extractArchive(file, key, dir)
      const db = join(dir, 'db', 'central.db')
      if (!existsSync(db)) throw new AppError('BACKUP_INVALID', 'No database in archive')
      const info = inspectDb(db)
      if (info.integrity !== 'ok') throw new AppError('BACKUP_INVALID', `Integrity: ${info.integrity}`)
      return { dir, verification: { ok: true, counts: info.counts, integrity: info.integrity }, migrations: info.migrations }
    } catch (err) {
      rmSync(dir, { recursive: true, force: true })
      throw err instanceof AppError ? err : new AppError('BACKUP_INVALID', String(err))
    }
  }

  async verify(id: string): Promise<BackupVerification> {
    const file = await this.#fileOf(id)
    const { header } = readHeader(file)
    const key = this.#key && keyIdOf(this.#key) === header.wrap.keyId ? this.#key : null
    if (!key) throw new AppError('BACKUP_PASSWORD')
    const { dir, verification } = await this.#check(file, key)
    rmSync(dir, { recursive: true, force: true })
    await this.d.gate.run(() => this.d.db.backupRecord.update({ where: { id }, data: { verifiedAt: this.d.now() } }))
    return verification
  }

  /** Registers a user-picked file and describes it (no password needed). */
  inspectFile(file: string): BackupInspection {
    const { header, size } = readHeader(file)
    const token = randomUUID()
    this.#picked.set(token, file)
    return {
      token,
      fileName: basename(file),
      kind: header.kind,
      createdAt: header.createdAt,
      shopName: header.shopName,
      appVersion: header.appVersion,
      sizeBytes: size,
      counts: header.counts,
      newer: header.migrations.some((m) => !this.d.knownMigrations.includes(m))
    }
  }

  async inspectRecord(id: string): Promise<BackupInspection> {
    return this.inspectFile(await this.#fileOf(id))
  }

  /**
   * Replaces the workspace with a backup. Verifies everything first, keeps
   * a pre-restore copy of the current data, then swaps files while holding
   * the database gate for good: the caller must restart the app.
   */
  async restore(token: string, password: string, userId: string | null): Promise<void> {
    if (this.#restoring) throw new AppError('INVALID_STATE', 'Restore in progress', { reason: 'restoreRunning' })
    const file = this.#picked.get(token)
    if (!file) throw new AppError('NOT_FOUND')
    const { header } = readHeader(file)
    if (header.migrations.some((m) => !this.d.knownMigrations.includes(m))) throw new AppError('BACKUP_INVALID', 'Backup made by a newer version')
    const key = unwrapKey(header.wrap, password)
    this.#restoring = true
    let staged: string | null = null
    try {
      const checked = await this.#check(file, key)
      staged = checked.dir

      // Safety net: the data being replaced. Its record is re-created in the
      // restored database on the next start (see #consumeRestoreMarker).
      let preRestore: string | null = null
      if (this.#key && (await this.#wrap())) {
        preRestore = join(this.directory, (await this.create('PRE_RESTORE', userId)).fileName)
      } else {
        const copy = join(this.d.paths.backups, `pre-restore-${Date.now()}.db`)
        this.#snapshot(copy)
        this.d.log.app.info('Unencrypted pre-restore copy kept', { copy })
      }
      await this.d.gate.run(() => this.d.audit.log({ userId, action: 'backup.restore_started', metadata: { file: basename(file), kind: header.kind, createdAt: header.createdAt } }))

      await this.d.gate.freeze()
      this.#restartRequired = true
      await this.d.db.$disconnect()
      const old = join(this.d.paths.temp, `replaced-${Date.now()}`)
      mkdirSync(old, { recursive: true })
      // Journal first: if power is lost mid-swap, the next start puts the old data back.
      const journal = join(this.d.paths.root, RESTORE_JOURNAL)
      writeFileSync(journal, JSON.stringify({ old, startedAt: this.d.now().toISOString() }))
      const db = this.d.paths.database
      try {
        for (const suffix of ['-wal', '-shm', '-journal']) rmSync(db + suffix, { force: true })
        if (existsSync(db)) renameSync(db, join(old, 'central.db'))
        renameSync(join(staged, 'db', 'central.db'), db)
        if (existsSync(this.d.paths.media)) renameSync(this.d.paths.media, join(old, 'media'))
        const stagedMedia = join(staged, 'media')
        if (existsSync(stagedMedia)) renameSync(stagedMedia, this.d.paths.media)
        else mkdirSync(this.d.paths.media, { recursive: true })
      } catch (err) {
        // e.g. a file locked by antivirus: undo, keep the current data
        rollbackSwap(this.d.paths, old)
        rmSync(journal, { force: true })
        this.d.log.app.error('Restore swap failed; current data kept', { message: String(err) })
        throw new AppError('FILE_ERROR', 'Restore could not replace the data files')
      }
      rmSync(journal, { force: true })
      this.#storeLocal(key)
      writeFileSync(join(this.d.paths.root, 'restore-marker.json'), JSON.stringify({ file: basename(file), kind: header.kind, createdAt: header.createdAt, restoredAt: this.d.now().toISOString(), userId, preRestore }))
      this.d.log.app.warn('Workspace restored from backup; restarting', { file: basename(file) })
      rmSync(old, { recursive: true, force: true })
    } catch (err) {
      this.#restoring = false
      throw err
    } finally {
      if (staged) rmSync(staged, { recursive: true, force: true })
    }
  }

  /** After a restore, record it in the restored database's audit log. */
  async #consumeRestoreMarker(): Promise<void> {
    const marker = join(this.d.paths.root, 'restore-marker.json')
    if (!existsSync(marker)) return
    try {
      const m = JSON.parse(readFileSync(marker, 'utf8')) as { preRestore?: string | null } & Record<string, unknown>
      if (m.preRestore && existsSync(m.preRestore)) {
        await this.d.db.backupRecord.create({ data: { kind: 'PRE_RESTORE', filePath: m.preRestore, sizeBytes: statSync(m.preRestore).size, status: 'SUCCESS' } })
      }
      await this.d.audit.log({ userId: null, action: 'backup.restored', metadata: m })
    } catch (err) {
      this.d.log.app.warn('Restore marker unreadable', { message: String(err) })
    } finally {
      rmSync(marker, { force: true })
    }
  }

  async #lastAge(): Promise<number> {
    const last = await this.d.gate.run(() => this.d.db.backupRecord.findFirst({ where: { status: 'SUCCESS', kind: { in: ['AUTO', 'MANUAL'] } }, orderBy: { createdAt: 'desc' } }))
    return last ? this.d.now().getTime() - last.createdAt.getTime() : Infinity
  }

  /** Scheduled backup (background job). */
  async runAutoIfDue(): Promise<BackupRecordDto | null> {
    const cfg = this.d.settings.get('backup')
    if (!cfg.autoEnabled || !this.#key || this.#restoring) return null
    if ((await this.#lastAge()) < cfg.intervalHours * 3_600_000) return null
    return this.create('AUTO', null)
  }

  /** Backup when the app closes (skipped if one was made in the last 10 minutes). */
  async onExit(): Promise<void> {
    if (!this.d.settings.get('backup').backupOnExit || !this.#key || this.#restoring) return
    if ((await this.#lastAge()) < 10 * 60_000) return
    await this.create('AUTO', null)
  }
}

/** Integrity, schema version and row counts of a database file. */
export function inspectDb(file: string): { integrity: string; migrations: string[]; counts: Record<string, number> } {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const integrity = (db.pragma('quick_check') as Array<{ quick_check: string }>).map((r) => r.quick_check).join('; ')
    const migrations = (db.prepare('SELECT name FROM _app_migrations ORDER BY name').all() as Array<{ name: string }>).map((r) => r.name)
    const counts: Record<string, number> = {}
    for (const [k, table] of Object.entries(COUNT_TABLES)) counts[k] = (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
    return { integrity, migrations, counts }
  } catch (err) {
    throw new AppError('BACKUP_INVALID', String(err))
  } finally {
    db.close()
  }
}
