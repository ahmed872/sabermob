import { useEffect, useRef } from 'react'

/**
 * Detects USB / keyboard-emulation barcode scanners: characters arriving
 * faster than a human types (< 40 ms apart) followed by Enter.
 * Only active while focus is not in a regular text field, so typing in
 * forms is never hijacked.
 */
export function useScanner(onScan: (code: string) => void, enabled = true): void {
  const buffer = useRef('')
  const last = useRef(0)
  const cb = useRef(onScan)
  cb.current = onScan

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) && !el.dataset.scannerTarget
      if (typing || e.ctrlKey || e.altKey || e.metaKey) return
      const now = performance.now()
      if (now - last.current > 40) buffer.current = ''
      last.current = now
      if (e.key === 'Enter') {
        if (buffer.current.length >= 4) {
          e.preventDefault()
          cb.current(buffer.current)
        }
        buffer.current = ''
      } else if (e.key.length === 1) {
        buffer.current += e.key
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled])
}

/** Short confirmation beep using WebAudio (no files, works offline). */
export function beep(ok = true): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = ok ? 1250 : 330
    gain.gain.value = 0.06
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.07 : 0.22))
    osc.onended = () => void ctx.close()
  } catch {
    /* audio unavailable */
  }
}
