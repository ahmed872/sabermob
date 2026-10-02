import { useEffect } from 'react'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import type { LicenseState } from '@shared/types/license'
import type { SessionInfo } from '@shared/types/auth'
import { onEvent } from './lib/api'
import { applyLanguage } from './i18n'
import { applyTheme, localPref } from './lib/theme'
import { queryClient } from './lib/query'
import { useApp } from './stores/app'
import { ConfirmProvider } from './components/confirm'
import { OverrideProvider } from './components/override-provider'
import { PageLoader } from './components/ui/spinner'
import { Onboarding } from './features/onboarding/onboarding'
import { LoginScreen } from './features/auth/login-screen'
import { LockScreen } from './features/auth/lock-screen'
import { Shell } from './layouts/shell'
import { useActivityHeartbeat } from './lib/activity'

export function App() {
  const { ready, system, session, settings, load, setSession, setLicense, refreshSettings } = useApp()

  useEffect(() => {
    void load()
    const offs = [
      onEvent<SessionInfo | null>('session:changed', (s) => {
        const prev = useApp.getState().session
        setSession(s)
        if (!s || prev?.userId !== s.userId) queryClient.clear()
      }),
      onEvent<LicenseState>('license:changed', (l) => setLicense(l)),
      onEvent('settings:changed', () => void refreshSettings())
    ]
    return () => offs.forEach((o) => o())
  }, [load, setSession, setLicense, refreshSettings])

  useEffect(() => {
    if (!settings) return
    applyLanguage((localPref('language') as 'ar' | 'en' | null) ?? settings.general.language)
    applyTheme((localPref('theme') as 'light' | 'dark' | 'system' | null) ?? settings.general.theme)
  }, [settings])

  useActivityHeartbeat(!!session)

  let content
  if (!ready || !system) content = <PageLoader />
  else if (system.needsOnboarding) content = <Onboarding />
  else if (!session) content = <LoginScreen />
  else
    content = (
      <HashRouter>
        <Shell />
        {session.locked ? <LockScreen /> : null}
      </HashRouter>
    )

  return (
    <ConfirmProvider>
      <OverrideProvider>
        {content}
        <Toaster position="bottom-center" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
      </OverrideProvider>
    </ConfirmProvider>
  )
}
