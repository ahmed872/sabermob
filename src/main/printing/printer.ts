import { randomBytes } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { AppError } from '@shared/errors'
import type { PrintDocument } from '@shared/types/printing'
import type { Loggers } from '../core/logger'

const MICRONS_PER_PX = 25400 / 96

function windowWidthPx(doc: PrintDocument): number {
  if (doc.paper === 'A4') return 794
  if (doc.paper === 'label' && doc.type === 'labels') return Math.round((doc.widthMm * 96) / 25.4)
  return doc.paper === '58mm' ? 219 : 302
}

/**
 * Prints documents through Chromium (hidden window + the same React
 * templates used for on-screen preview). This handles Arabic shaping and RTL
 * perfectly on any Windows printer driver, including 58/80 mm thermal
 * printers. A print failure never affects the saved transaction.
 */
export class Printer {
  readonly #jobs = new Map<string, PrintDocument>()

  constructor(
    private readonly rendererUrl: string,
    private readonly preload: string,
    private readonly log: Loggers
  ) {}

  job(token: string): PrintDocument | null {
    return this.#jobs.get(token) ?? null
  }

  async #render(doc: PrintDocument): Promise<{ win: BrowserWindow; heightPx: number; token: string }> {
    const token = randomBytes(16).toString('hex')
    this.#jobs.set(token, doc)
    const win = new BrowserWindow({
      show: false,
      width: windowWidthPx(doc),
      height: 1000,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    try {
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new AppError('PRINTER_UNAVAILABLE', 'Print page did not load')), 20_000)
        win.webContents.on('page-title-updated', (_e, title) => {
          if (title === 'ready') {
            clearTimeout(timer)
            resolve()
          } else if (title === 'error') {
            clearTimeout(timer)
            reject(new AppError('PRINTER_UNAVAILABLE', 'Print page failed'))
          }
        })
      })
      await win.loadURL(`${this.rendererUrl}/print.html?token=${token}`)
      await ready
      // Height of the actual content (scrollHeight never drops below the window height,
      // which would feed a long blank strip after every thermal receipt).
      const heightPx = (await win.webContents.executeJavaScript(
        `Math.ceil(Array.from(document.body.querySelectorAll('*')).reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0)) + 8`
      )) as number
      return { win, heightPx, token }
    } catch (err) {
      this.#jobs.delete(token)
      if (!win.isDestroyed()) win.destroy()
      throw err
    }
  }

  #pageSize(doc: PrintDocument, heightPx: number): Electron.WebContentsPrintOptions['pageSize'] {
    if (doc.paper === 'A4') return 'A4'
    if (doc.type === 'labels') return { width: doc.widthMm * 1000, height: doc.heightMm * 1000 }
    const width = doc.paper === '58mm' ? 58000 : 80000
    return { width, height: Math.max(Math.ceil(heightPx * MICRONS_PER_PX) + 2000, 50000) }
  }

  async listPrinters(win: BrowserWindow): Promise<string[]> {
    return (await win.webContents.getPrintersAsync()).map((p) => p.name)
  }

  async print(doc: PrintDocument, opts: { printer: string | null; copies: number; anyWindow: BrowserWindow | null }): Promise<void> {
    if (opts.printer && opts.anyWindow) {
      const available = await this.listPrinters(opts.anyWindow)
      if (!available.includes(opts.printer)) throw new AppError('PRINTER_UNAVAILABLE', 'Printer not found', { printer: opts.printer })
    }
    const { win, heightPx, token } = await this.#render(doc)
    try {
      await new Promise<void>((resolve, reject) => {
        win.webContents.print(
          {
            silent: true,
            deviceName: opts.printer ?? undefined,
            printBackground: true,
            copies: opts.copies,
            margins: { marginType: 'none' },
            pageSize: this.#pageSize(doc, heightPx)
          },
          (success, reason) => {
            if (success) resolve()
            else {
              this.log.app.warn('Print failed', { reason, type: doc.type, printer: opts.printer })
              reject(new AppError('PRINTER_UNAVAILABLE', reason || 'Print failed'))
            }
          }
        )
      })
    } finally {
      this.#jobs.delete(token)
      if (!win.isDestroyed()) win.destroy()
    }
  }

  async pdf(doc: PrintDocument): Promise<Buffer> {
    const { win, heightPx, token } = await this.#render(doc)
    try {
      const size = this.#pageSize(doc, heightPx)
      const pageSize =
        typeof size === 'string' ? size : { width: (size!.width / 25400) as number, height: (size!.height / 25400) as number }
      return await win.webContents.printToPDF({ printBackground: true, pageSize, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    } finally {
      this.#jobs.delete(token)
      if (!win.isDestroyed()) win.destroy()
    }
  }
}
