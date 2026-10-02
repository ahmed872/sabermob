export type ThemeMode = 'light' | 'dark' | 'system'

let media: MediaQueryList | null = null
let listener: (() => void) | null = null

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  const set = () => {
    const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', dark)
  }
  if (media && listener) media.removeEventListener('change', listener)
  media = window.matchMedia('(prefers-color-scheme: dark)')
  listener = set
  media.addEventListener('change', listener)
  set()
}

export function localPref(key: string): string | null {
  try {
    return localStorage.getItem(`central.${key}`)
  } catch {
    return null
  }
}

export function setLocalPref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`central.${key}`)
    else localStorage.setItem(`central.${key}`, value)
  } catch {
    /* storage unavailable — preference simply isn't remembered */
  }
}
