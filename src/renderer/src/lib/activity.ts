import { useEffect } from 'react'
import { call } from './api'

/**
 * Reports user activity to the main process (at most every 20 s) so the
 * idle-lock timer is based on real keyboard/mouse/touch use.
 */
export function useActivityHeartbeat(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let last = 0
    const ping = () => {
      const now = Date.now()
      if (now - last < 20_000) return
      last = now
      void call('auth.heartbeat').catch(() => undefined)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, ping, { passive: true })
    return () => {
      for (const e of events) window.removeEventListener(e, ping)
    }
  }, [enabled])
}
