import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * The only bridge between the UI and the system. It exposes a single
 * request function and an event subscription — no Node APIs, no direct
 * ipcRenderer access. Every request is validated again in the main process.
 */
const EVENTS = new Set(['session:changed', 'license:changed', 'settings:changed', 'notice', 'menu:command'])

const api = {
  invoke(method: string, input?: unknown): Promise<unknown> {
    if (typeof method !== 'string' || !/^[a-z]+\.[a-zA-Z]+$/.test(method)) {
      return Promise.resolve({ ok: false, error: { code: 'VALIDATION', message: 'Bad method' } })
    }
    return ipcRenderer.invoke('api:invoke', method, input)
  },
  on(event: string, listener: (payload: unknown) => void): () => void {
    if (!EVENTS.has(event)) return () => undefined
    const handler = (_e: IpcRendererEvent, name: string, payload: unknown) => {
      if (name === event) listener(payload)
    }
    ipcRenderer.on('api:event', handler)
    return () => ipcRenderer.removeListener('api:event', handler)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('central', api)
