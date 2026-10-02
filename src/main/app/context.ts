import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPaths, type AppPaths } from '../core/paths'
import { createLoggers, createSilentLoggers, type Loggers } from '../core/logger'
import { Mutex } from '../core/mutex'
import { configureConnection, createPrisma, type Db } from '../database/client'
import { loadMigrations, migrateDatabase, type MigrationResult } from '../database/migrator'
import { LicenseService, type LicensePlatform } from '../license/license-service'
import { LICENSE_PUBLIC_KEY_PEM } from '../license/public-key'
import { AuditService } from '../services/audit-service'
import { AuthService } from '../services/auth-service'
import { BootstrapService } from '../services/bootstrap-service'
import { CatalogService } from '../services/catalog-service'
import { InventoryService } from '../services/inventory-service'
import { SettingsService } from '../services/settings-service'
import { UserService } from '../services/user-service'

export interface AppContextOptions {
  rootDir: string
  migrationsDir: string
  deviceName: string
  platformName: string
  licensePlatform: LicensePlatform
  logToFiles?: boolean
  now?: () => Date
  publicKeyPem?: string
}

/**
 * Composition root. Builds every service once; nothing here depends on
 * Electron so the full stack is testable in plain Node.
 */
export class AppContext {
  readonly gate = new Mutex()
  readonly now: () => Date
  db!: Db
  paths!: AppPaths
  log!: Loggers
  deviceId!: string
  migration!: MigrationResult
  settings!: SettingsService
  audit!: AuditService
  auth!: AuthService
  license!: LicenseService
  users!: UserService
  catalog!: CatalogService
  inventory!: InventoryService
  bootstrap!: BootstrapService

  private constructor(readonly options: AppContextOptions) {
    this.now = options.now ?? (() => new Date())
  }

  static async create(options: AppContextOptions): Promise<AppContext> {
    const ctx = new AppContext(options)
    await ctx.#init()
    return ctx
  }

  async #init(): Promise<void> {
    const o = this.options
    this.paths = createPaths(o.rootDir)
    this.log = o.logToFiles === false ? createSilentLoggers() : createLoggers(this.paths.logs)
    this.deviceId = this.#loadDeviceId()
    this.migration = migrateDatabase(this.paths.database, loadMigrations(o.migrationsDir), {
      backupDir: this.paths.backups,
      logger: this.log.app
    })
    if (this.migration.applied.length) this.log.app.info('Database migrated', { applied: this.migration.applied })

    this.db = createPrisma(this.paths.database, this.deviceId)
    await configureConnection(this.db)
    this.settings = new SettingsService(this.db)
    await this.settings.load()
    this.audit = new AuditService(this.db)
    this.auth = new AuthService(this.db, this.settings, this.audit, this.log, this.now)
    this.license = new LicenseService(this.db, o.licensePlatform, this.audit, this.log, this.now, o.publicKeyPem ?? LICENSE_PUBLIC_KEY_PEM)
    this.users = new UserService(this.db, this.audit, () => this.license.maxUsers())
    this.catalog = new CatalogService(this.db, this.settings, this.audit)
    this.inventory = new InventoryService(this.db, this.settings, this.audit)
    this.bootstrap = new BootstrapService(this.db, this.settings, this.audit, this.deviceId, () => this.catalog)

    await this.bootstrap.ensureSeed(o.deviceName, o.platformName)
    await this.license.init()
    const stale = await this.auth.closeStaleSessions()
    if (stale > 0) this.log.app.warn('Closed sessions left open by an unclean shutdown', { count: stale })
  }

  /** Installation id: per install, outside the workspace (not moved with exports). */
  #loadDeviceId(): string {
    const file = join(this.paths.root, 'installation.json')
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as { deviceId?: string }
        if (parsed.deviceId) return parsed.deviceId
      } catch {
        this.log.app.warn('installation.json unreadable; generating a new device id')
      }
    }
    const deviceId = randomUUID()
    writeFileSync(file, JSON.stringify({ deviceId, createdAt: new Date().toISOString() }, null, 2))
    return deviceId
  }

  /** Tasks that must run before the app exits (e.g. backup on exit). */
  readonly shutdownTasks: Array<() => Promise<void>> = []

  async onShutdown(): Promise<void> {
    for (const task of this.shutdownTasks) {
      try {
        await task()
      } catch (err) {
        this.log.app.error('Shutdown task failed', { message: String(err) })
      }
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.auth?.shutdown()
    } finally {
      await this.db?.$disconnect()
    }
  }
}
