export interface CentralBridge {
  invoke(method: string, input?: unknown): Promise<unknown>
  on(event: string, listener: (payload: unknown) => void): () => void
  platform: string
}

declare global {
  interface Window {
    central: CentralBridge
  }
}
