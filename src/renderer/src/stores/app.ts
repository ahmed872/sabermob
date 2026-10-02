import { create } from 'zustand'
import type { AllSettings } from '@shared/settings'
import type { SessionInfo } from '@shared/types/auth'
import type { LicenseState } from '@shared/types/license'
import type { SystemInfo } from '@shared/types/system'
import type { PermissionKey } from '@shared/permissions'
import { call } from '../lib/api'

interface AppState {
  ready: boolean
  system: SystemInfo | null
  session: SessionInfo | null
  license: LicenseState | null
  settings: AllSettings | null
  load: () => Promise<void>
  refreshSettings: () => Promise<void>
  refreshLicense: () => Promise<void>
  setSession: (s: SessionInfo | null) => void
  setLicense: (l: LicenseState) => void
}

export const useApp = create<AppState>((set) => ({
  ready: false,
  system: null,
  session: null,
  license: null,
  settings: null,
  load: async () => {
    const [system, session, license, settings] = await Promise.all([
      call('system.info'),
      call('auth.session'),
      call('license.state'),
      call('settings.get')
    ])
    set({ system, session, license, settings, ready: true })
  },
  refreshSettings: async () => set({ settings: await call('settings.get') }),
  refreshLicense: async () => set({ license: await call('license.state') }),
  setSession: (session) => set({ session }),
  setLicense: (license) => set({ license })
}))

export function useCan(): (p: PermissionKey | PermissionKey[]) => boolean {
  const session = useApp((s) => s.session)
  return (p) => {
    if (!session) return false
    const list = Array.isArray(p) ? p : [p]
    return list.some((x) => session.permissions.includes(x))
  }
}

export function useSettings(): AllSettings {
  const s = useApp((st) => st.settings)
  if (!s) throw new Error('Settings not loaded')
  return s
}
