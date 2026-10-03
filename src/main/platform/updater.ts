import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types/update'
import type { AppContext } from '../app/context'

/**
 * Optional online updates (electron-updater, generic server). Only active in
 * builds made with CENTRAL_UPDATE_URL (electron-builder writes
 * resources/app-update.yml). Nothing is downloaded or installed without the
 * user asking; a backup is taken right before installing, and installers
 * are verified (sha512, and the code signature when the build is signed).
 */
export class Updater {
  readonly feedUrl: string | null
  #status: UpdateStatus

  constructor(
    private readonly ctx: AppContext,
    private readonly onStatus: (s: UpdateStatus) => void
  ) {
    const config = join(process.resourcesPath ?? '', 'app-update.yml')
    const url = app.isPackaged && existsSync(config) ? /^url:\s*(\S+)/m.exec(readFileSync(config, 'utf8'))?.[1] ?? null : null
    this.feedUrl = url?.replace(/^['"]|['"]$/g, '') ?? null
    this.#status = { enabled: !!this.feedUrl, state: 'idle', currentVersion: app.getVersion(), version: null, progress: 0, error: null }
    if (!this.feedUrl) return
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = null
    autoUpdater.on('checking-for-update', () => this.#set({ state: 'checking', error: null }))
    autoUpdater.on('update-not-available', () => this.#set({ state: 'none' }))
    autoUpdater.on('update-available', (i) => this.#set({ state: 'available', version: i.version }))
    autoUpdater.on('download-progress', (p) => this.#set({ state: 'downloading', progress: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => this.#set({ state: 'ready', version: i.version, progress: 100 }))
    autoUpdater.on('error', (err) => {
      ctx.log.app.warn('Update failed', { message: String(err) })
      this.#set({ state: 'error', error: 'offline' })
    })
  }

  /** Main-process requests to the update server are let through the offline guard. */
  allows(url: string): boolean {
    return !!this.feedUrl && url.startsWith(this.feedUrl.replace(/\/?$/, '/'))
  }

  status(): UpdateStatus {
    return this.#status
  }

  #set(patch: Partial<UpdateStatus>): void {
    this.#status = { ...this.#status, ...patch }
    this.onStatus(this.#status)
  }

  async check(): Promise<UpdateStatus> {
    if (!this.feedUrl) return this.#status
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* reported through the 'error' event */
    }
    return this.#status
  }

  async download(): Promise<UpdateStatus> {
    if (this.#status.state !== 'available') return this.#status
    this.#set({ state: 'downloading', progress: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch {
      /* reported through the 'error' event */
    }
    return this.#status
  }

  async install(userId: string): Promise<void> {
    if (this.#status.state !== 'ready') return
    // Safety net: the database as it is right before the new version runs.
    if ((await this.ctx.backup.status()).unlocked) await this.ctx.backup.create('PRE_UPDATE', userId)
    await this.ctx.audit.log({ userId, action: 'app.update_installing', metadata: { from: this.#status.currentVersion, to: this.#status.version } })
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 300)
  }
}
