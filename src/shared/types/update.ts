export interface UpdateStatus {
  /** online updates configured for this build (otherwise: new installer from the vendor) */
  enabled: boolean
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  version: string | null
  progress: number
  error: string | null
}
