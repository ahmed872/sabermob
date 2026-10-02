import type { BrowserWindow } from 'electron'
import type { ApiEventName, ApiEvents } from '@shared/ipc/contract'
import type { AppContext } from '../app/context'
import type { ApiRouter } from './router'
import { registerCoreHandlers } from './handlers/core'
import { registerPosHandlers } from './handlers/pos'
import { registerModuleHandlers } from './handlers/modules'
import { registerPrintingHandlers } from './handlers/printing'
import { Printer } from '../printing/printer'

export interface HandlerDeps {
  appVersion: string
  platform: string
  openPath: (path: string) => Promise<void>
  getWindow: () => BrowserWindow | null
  rendererDir: string
  rendererUrl: string
  preloadPath: string
  emit: <E extends ApiEventName>(event: E, payload: ApiEvents[E]) => void
}

export function registerAllHandlers(router: ApiRouter, ctx: AppContext, deps: HandlerDeps): void {
  const listPrinters = async () => {
    const win = deps.getWindow()
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!(p as { isDefault?: boolean }).isDefault }))
  }
  registerCoreHandlers(router, { ...deps, listPrinters })
  registerPosHandlers(router)
  registerModuleHandlers(router)
  registerPrintingHandlers(router, new Printer(deps.rendererUrl, deps.preloadPath, ctx.log), deps.getWindow)
}
