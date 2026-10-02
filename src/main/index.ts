import { join } from 'node:path'
import { hostname } from 'node:os'
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import type { ApiEventName, ApiEvents } from '@shared/ipc/contract'
import { AppContext } from './app/context'
import { MigrationError } from './database/migrator'
import { ApiRouter } from './ipc/router'
import { registerAllHandlers } from './ipc/register'
import { OsLicensePlatform } from './platform/license-platform'
import { APP_SCHEME, handleAppProtocol, registerSchemePrivileges } from './platform/protocol'
import { startBackgroundJobs, stopBackgroundJobs } from './app/background'

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const DATA_DIR = process.env.CENTRAL_DATA_DIR || join(app.getPath('userData'))
const RENDERER_DIR = join(__dirname, '../renderer')
const MIGRATIONS_DIR = app.isPackaged ? join(process.resourcesPath, 'migrations') : join(app.getAppPath(), 'prisma/migrations')

let mainWindow: BrowserWindow | null = null
let ctx: AppContext | null = null
let router: ApiRouter | null = null
let quitting = false

registerSchemePrivileges()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

process.on('uncaughtException', (err) => {
  if (ctx) ctx.log.app.error('Uncaught exception', { message: err.message, stack: err.stack })
  else console.error('Uncaught exception', err)
})
process.on('unhandledRejection', (reason) => {
  if (ctx) ctx.log.app.error('Unhandled rejection', { reason: String(reason) })
  else console.error('Unhandled rejection', reason)
})

export function emit<E extends ApiEventName>(event: E, payload: ApiEvents[E]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents) w.webContents.send('api:event', event, payload)
  }
}

function isTrustedSender(url: string): boolean {
  if (url.startsWith(`${APP_SCHEME}://bundle/`)) return true
  if (isDev && process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return true
  return false
}

function hardenSession(): void {
  const ses = session.defaultSession
  // Only the camera (QR scanning) may be requested; everything else is denied.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const allowed = permission === 'media' && (details as { mediaTypes?: string[] }).mediaTypes?.every((m) => m === 'video')
    callback(!!allowed)
  })
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media')
  // Offline-first: block any outbound web request from the renderer.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url
    const local = u.startsWith(`${APP_SCHEME}:`) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('devtools:')
    const dev = isDev && (u.startsWith('http://localhost') || u.startsWith('ws://localhost') || u.startsWith('http://127.0.0.1') || u.startsWith('ws://127.0.0.1'))
    callback({ cancel: !(local || dev) })
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b1220',
    title: 'Central Pro',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged || process.env.CENTRAL_DEVTOOLS === '1'
    }
  })
  win.once('ready-to-show', () => {
    win.show()
    if (process.env.CENTRAL_MAXIMIZE !== '0') win.maximize()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedSender(url)) event.preventDefault()
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    ctx?.log.app.error('Renderer crashed', { reason: details.reason })
    if (!quitting && details.reason !== 'clean-exit') win.reload()
  })
  if (isDev) void win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else void win.loadURL(`${APP_SCHEME}://bundle/index.html`)
  return win
}

async function bootstrap(): Promise<void> {
  try {
    ctx = await AppContext.create({
      rootDir: DATA_DIR,
      migrationsDir: MIGRATIONS_DIR,
      deviceName: hostname(),
      platformName: `${process.platform}-${process.arch}`,
      licensePlatform: new OsLicensePlatform(DATA_DIR)
    })
  } catch (err) {
    console.error('Startup failed:', err)
    const restored = err instanceof MigrationError && err.restoredFrom
    dialog.showErrorBox(
      'Central Pro',
      restored
        ? `The database update could not be completed. Your data was restored safely and nothing was lost.\n\nPlease contact support.\n\n${(err as Error).message}`
        : `Central Pro could not open its database.\n\nYour data folder: ${DATA_DIR}\n\n${(err as Error).message}`
    )
    app.exit(1)
    return
  }

  router = new ApiRouter(ctx)
  registerAllHandlers(router, ctx, {
    appVersion: app.getVersion(),
    platform: process.platform,
    openPath: async (p) => {
      await shell.openPath(p)
    },
    getWindow: () => mainWindow,
    rendererDir: RENDERER_DIR,
    rendererUrl: isDev ? process.env.ELECTRON_RENDERER_URL! : `${APP_SCHEME}://bundle`,
    emit
  })

  ipcMain.handle('api:invoke', async (event, method: unknown, input: unknown) => {
    const senderUrl = event.senderFrame?.url ?? ''
    if (!isTrustedSender(senderUrl) || typeof method !== 'string' || !/^[a-z]+\.[a-zA-Z]+$/.test(method)) {
      ctx?.log.security.warn('Rejected IPC call', { method: String(method), senderUrl })
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Rejected' } }
    }
    return router!.dispatch(method, input)
  })

  ctx.auth.onChange(() => emit('session:changed', ctx!.auth.sessionInfo()))
  ctx.license.onChange(() => emit('license:changed', ctx!.license.state()))
  ctx.settings.onChange((group) => emit('settings:changed', { group }))

  handleAppProtocol(RENDERER_DIR, () => ctx!.paths.media)
  hardenSession()
  Menu.setApplicationMenu(null)
  mainWindow = createWindow()
  startBackgroundJobs(ctx, emit)
}

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', (event) => {
  if (quitting || !ctx) return
  event.preventDefault()
  quitting = true
  const c = ctx
  void (async () => {
    try {
      stopBackgroundJobs()
      await c.gate.run(() => c.onShutdown())
      await c.dispose()
    } catch (err) {
      c.log.app.error('Shutdown error', { message: String(err) })
    } finally {
      app.exit(0)
    }
  })()
})
