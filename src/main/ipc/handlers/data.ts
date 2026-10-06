import { join } from 'node:path'
import { z } from 'zod'
import { app as electronApp, dialog, session, shell, type BrowserWindow } from 'electron'
import { AppError } from '@shared/errors'
import { empty, id } from '@shared/schemas/common'
import type { AppContext } from '../../app/context'
import type { ApiRouter } from '../router'
import type { Actor } from '../../services/auth-service'
import type { Updater } from '../../platform/updater'

const password = z.string().min(6).max(128)

/**
 * Restore is also offered on the very first launch (moving to a new PC),
 * before any user exists. After onboarding it needs manage_backups.
 */
async function requireRestoreAccess(app: AppContext): Promise<string | null> {
  if (await app.gate.run(() => app.bootstrap.needsOnboarding())) return null
  const actor = app.auth.currentActor()
  if (!actor) throw new AppError('UNAUTHENTICATED')
  if (app.auth.isLocked()) throw new AppError('SESSION_LOCKED')
  if (!actor.permissions.has('manage_backups')) throw new AppError('FORBIDDEN', undefined, { permission: 'manage_backups' })
  return actor.userId
}

const entity = z.enum(['products', 'customers'])
const mapping = z.record(z.string().max(40), z.number().int().min(0).max(59).nullable())

/** Bulk import needs import_data plus the right to create what is imported. */
function requireImportPermission(actor: Actor, e: z.infer<typeof entity>): void {
  for (const perm of ['import_data', e === 'products' ? 'manage_inventory' : 'manage_customers'] as const) {
    if (!actor.permissions.has(perm)) throw new AppError('FORBIDDEN', 'Permission denied', { permission: perm })
  }
}

export function registerDataHandlers(r: ApiRouter, getWindow: () => BrowserWindow | null, updater: Updater | null): void {
  const opts = { permission: 'manage_backups' as const, allowUnlicensed: true }

  r.handle('data.resetSummary', { input: empty, permission: 'manage_settings', allowUnlicensed: true }, (_i, { app }) => app.reset.summary())
  r.handle(
    'data.reset',
    { input: z.object({ password: z.string().min(1).max(128), confirm: z.literal('RESET'), clearCatalog: z.boolean() }), permission: 'manage_settings', allowUnlicensed: true, skipGate: true },
    async (i, { app, actor }) => {
      if (actor!.roleKey !== 'OWNER') throw new AppError('FORBIDDEN', 'Only the owner can start fresh', { permission: 'manage_settings' })
      await app.gate.run(() => app.auth.confirmPassword(i.password))
      // A safety copy first: "start fresh" can be undone by restoring it.
      if (!(await app.backup.status()).unlocked) throw new AppError('INVALID_STATE', 'Backups must be on before starting fresh', { reason: 'resetNeedsBackup' })
      await app.backup.create('PRE_RESET', actor!.userId)
      await app.gate.run(() => app.reset.reset({ clearCatalog: i.clearCatalog }, actor!))
      // Open screens and a saved cart point at removed data: start the app again.
      await session?.defaultSession?.clearStorageData({ storages: ['localstorage'] }).catch(() => undefined)
      setTimeout(() => {
        if (!process.env.CENTRAL_E2E_PDF_DIR) electronApp.relaunch()
        electronApp.exit(0)
      }, 400)
      return { ok: true as const }
    }
  )

  r.handle('backup.status', { input: empty, ...opts }, (_i, { app }) => app.backup.status())
  r.handle('backup.list', { input: empty, ...opts }, (_i, { app }) => app.backup.list())
  // Long-running work takes the database gate only for short moments.
  r.handle('backup.create', { input: empty, ...opts, skipGate: true }, (_i, { app, actor }) => app.backup.create('MANUAL', actor!.userId))
  r.handle('backup.verify', { input: z.object({ id }), ...opts, skipGate: true }, (i, { app }) => app.backup.verify(i.id))
  r.handle('backup.setPassword', { input: z.object({ password, currentPassword: z.string().max(128).optional() }), ...opts, skipGate: true }, async (i, { app, actor }) => {
    await app.gate.run(() => app.backup.setPassword(i.password, actor!.userId, i.currentPassword))
    // Older backups keep the old password: make one with the new password right away.
    await app.backup.create('MANUAL', actor!.userId)
    return { ok: true as const }
  })
  r.handle('backup.unlock', { input: z.object({ password: z.string().min(1).max(128) }), ...opts }, async (i, { app, actor }) => {
    await app.backup.unlock(i.password, actor!.userId)
    return { ok: true as const }
  })

  r.handle('backup.inspect', { input: z.object({ id: id.optional() }), public: true, allowUnlicensed: true, skipGate: true }, async (i, { app }) => {
    await requireRestoreAccess(app)
    if (i.id) return app.backup.inspectRecord(i.id)
    const win = getWindow()
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Central Pro', extensions: ['cpbak', 'centralbundle'] }] })
      : { canceled: true, filePaths: [] }
    const file = res.filePaths[0]
    if (res.canceled || !file) return null
    return app.backup.inspectFile(file)
  })

  r.handle('backup.restore', { input: z.object({ token: z.string().uuid(), password: z.string().min(1).max(128) }), public: true, allowUnlicensed: true, skipGate: true }, async (i, { app }) => {
    const userId = await requireRestoreAccess(app)
    try {
      await app.backup.restore(i.token, i.password, userId)
    } finally {
      // Once the database was closed for the swap (done or rolled back), start fresh.
      if (app.backup.restartRequired) {
        // A saved in-progress cart may point at products of the replaced data.
        await session?.defaultSession?.clearStorageData({ storages: ['localstorage'] }).catch(() => undefined)
        setTimeout(() => {
          // E2E tests start the app again themselves.
          if (!process.env.CENTRAL_E2E_PDF_DIR) electronApp.relaunch()
          electronApp.exit(0)
        }, 400)
      }
    }
    return { ok: true as const }
  })

  r.handle('backup.exportBundle', { input: empty, ...opts, skipGate: true }, async (_i, { app, actor }) => {
    const name = `${app.settings.get('company').storeName.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'central'}-${new Date().toISOString().slice(0, 10)}.centralbundle`
    let path: string
    if (process.env.CENTRAL_E2E_PDF_DIR) path = join(process.env.CENTRAL_E2E_PDF_DIR, name)
    else {
      const win = getWindow()
      const res = win ? await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'Central Pro', extensions: ['centralbundle'] }] }) : { canceled: true, filePath: undefined }
      if (res.canceled || !res.filePath) return { path: null }
      path = res.filePath
    }
    await app.backup.create('BUNDLE', actor!.userId, path)
    return { path }
  })

  r.handle('backup.chooseFolder', { input: z.object({ target: z.enum(['directory', 'mirrorDirectory']), clear: z.boolean().optional() }), ...opts }, async (i, { app, actor }) => {
    let path: string | null = null
    if (!i.clear) {
      const win = getWindow()
      const res = win ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }) : { canceled: true, filePaths: [] }
      if (res.canceled || !res.filePaths[0]) return { path: null }
      path = res.filePaths[0]
    }
    await app.settings.update('backup', { [i.target]: path }, actor!.userId)
    return { path }
  })

  const importPerm = { permission: 'import_data' as const }
  r.handle('import.parse', { input: z.object({ entity, fileName: z.string().max(260), data: z.string().max(20_000_000) }), ...importPerm, skipGate: true }, (i, { app, actor }) => {
    requireImportPermission(actor!, i.entity)
    return app.imports.parse(i.fileName, Buffer.from(i.data, 'base64'), i.entity)
  })
  r.handle('import.preview', { input: z.object({ token: z.string().uuid(), entity, mapping }), ...importPerm }, (i, { app, actor }) => {
    requireImportPermission(actor!, i.entity)
    return app.imports.preview(i.token, i.entity, i.mapping)
  })
  r.handle('import.commit', { input: z.object({ token: z.string().uuid(), entity, mapping, mode: z.enum(['skip', 'update']) }), ...importPerm, skipGate: true }, (i, { app, actor }) => {
    requireImportPermission(actor!, i.entity)
    return app.imports.commit(i.token, i.entity, i.mapping, i.mode, actor!)
  })

  const upd = { input: empty, permission: 'manage_settings' as const, allowUnlicensed: true, skipGate: true }
  const off = { enabled: false, state: 'idle' as const, currentVersion: electronApp.getVersion(), version: null, progress: 0, error: null }
  r.handle('system.updateStatus', upd, () => updater?.status() ?? off)
  r.handle('system.checkUpdate', upd, async () => (updater ? updater.check() : off))
  r.handle('system.downloadUpdate', upd, async () => (updater ? updater.download() : off))
  r.handle('system.installUpdate', upd, async (_i, { actor }) => {
    await updater?.install(actor!.userId)
    return { ok: true as const }
  })

  r.handle('backup.openFolder', { input: empty, ...opts, skipGate: true }, async (_i, { app }) => {
    await shell.openPath(app.backup.directory)
    return { ok: true as const }
  })
}
