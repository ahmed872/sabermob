import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Logger } from 'winston'

export interface MigrationFile {
  name: string
  sql: string
  checksum: string
}

export interface MigrationResult {
  applied: string[]
  backupPath: string | null
  fresh: boolean
}

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly restoredFrom: string | null
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

export function loadMigrations(dir: string): MigrationFile[] {
  if (!existsSync(dir)) throw new Error(`Migrations directory not found: ${dir}`)
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'migration.sql')))
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8')
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    })
}

function quickCheck(db: Database.Database): string {
  const rows = db.pragma('quick_check') as Array<{ quick_check: string }>
  return rows.map((r) => r.quick_check).join('; ')
}

/**
 * Applies pending migrations safely:
 *   validate → backup → migrate (single transaction) → verify → (restore on failure)
 * Business data is never discarded: on any failure the pre-migration copy is
 * restored and the error is surfaced to the user.
 */
export function migrateDatabase(
  dbPath: string,
  migrations: MigrationFile[],
  opts: { backupDir: string; logger?: Logger }
): MigrationResult {
  const log = opts.logger
  const existed = existsSync(dbPath)
  let db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS "_app_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY, "checksum" TEXT NOT NULL, "appliedAt" TEXT NOT NULL)`)

  const applied = new Map(
    (db.prepare('SELECT name, checksum FROM _app_migrations').all() as Array<{ name: string; checksum: string }>).map((r) => [
      r.name,
      r.checksum
    ])
  )
  for (const [name, checksum] of applied) {
    const file = migrations.find((m) => m.name === name)
    if (file && file.checksum !== checksum) log?.warn('Applied migration checksum differs from file', { name })
    // Opening a newer database with an older app version would run old code on a newer schema.
    if (!file) {
      db.close()
      throw new MigrationError(`This database was updated by a newer version of Central Pro (${name}). Install that version or newer.`, null)
    }
  }
  const pending = migrations.filter((m) => !applied.has(m.name))
  const fresh = !existed || applied.size === 0
  if (pending.length === 0) {
    db.close()
    return { applied: [], backupPath: null, fresh: false }
  }

  let backupPath: string | null = null
  if (existed) {
    const check = quickCheck(db)
    if (check !== 'ok') {
      db.close()
      throw new MigrationError(`Database integrity check failed before migration: ${check}`, null)
    }
    db.pragma('wal_checkpoint(TRUNCATE)')
    backupPath = join(opts.backupDir, `pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)
    log?.info('Pre-migration backup created', { backupPath })
  }

  try {
    // Prisma SQLite migrations may redefine tables; FK enforcement is
    // disabled for the migration and verified explicitly afterwards.
    db.pragma('foreign_keys = OFF')
    db.exec('BEGIN IMMEDIATE')
    try {
      const insert = db.prepare('INSERT INTO _app_migrations (name, checksum, appliedAt) VALUES (?, ?, ?)')
      for (const m of pending) {
        db.exec(m.sql)
        insert.run(m.name, m.checksum, new Date().toISOString())
        log?.info('Migration applied', { name: m.name })
      }
      const fkViolations = db.pragma('foreign_key_check') as unknown[]
      if (fkViolations.length > 0) throw new Error(`Foreign key violations after migration: ${fkViolations.length}`)
      db.exec('COMMIT')
    } catch (err) {
      if (db.inTransaction) db.exec('ROLLBACK')
      throw err
    }
    const check = quickCheck(db)
    if (check !== 'ok') throw new Error(`Integrity check failed after migration: ${check}`)
    db.pragma('foreign_keys = ON')
    db.close()
    return { applied: pending.map((m) => m.name), backupPath, fresh }
  } catch (err) {
    if (db.open) db.close()
    const message = err instanceof Error ? err.message : String(err)
    log?.error('Migration failed', { message })
    if (backupPath) {
      for (const suffix of ['-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
      copyFileSync(backupPath, dbPath)
      db = new Database(dbPath)
      const ok = quickCheck(db) === 'ok'
      db.close()
      log?.error('Database restored from pre-migration backup', { backupPath, ok })
      throw new MigrationError(message, backupPath)
    }
    if (!existed) {
      for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true })
    }
    throw new MigrationError(message, null)
  }
}
