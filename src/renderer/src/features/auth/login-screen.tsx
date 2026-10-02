import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, KeyRound, UserRound } from 'lucide-react'
import type { LoginUserTile } from '@shared/types/auth'
import { ApiError, call } from '../../lib/api'
import { errorMessage } from '../../lib/query'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Field, Input } from '../../components/ui/input'
import { PinPad } from './pin-pad'
import { BrandMark } from '../../layouts/brand'
import { LanguageToggle } from '../../layouts/preferences'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500']

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
  const cls = size === 'lg' ? 'size-20 text-2xl' : size === 'sm' ? 'size-8 text-xs' : 'size-14 text-lg'
  return <div className={`${color} ${cls} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}>{initials(name)}</div>
}

/**
 * Sign-in / quick user switch. Shows employee tiles (like a POS terminal),
 * then a PIN pad or a password field.
 */
export function LoginScreen({ onDone, lockedUserId }: { onDone?: () => void; lockedUserId?: string }) {
  const { t } = useTranslation()
  const storeName = useApp((s) => s.system?.storeName)
  const setSession = useApp((s) => s.setSession)
  const [tiles, setTiles] = useState<LoginUserTile[]>([])
  const [selected, setSelected] = useState<LoginUserTile | null>(null)
  const [mode, setMode] = useState<'PIN' | 'PASSWORD'>('PIN')
  const [manual, setManual] = useState(false)
  const [username, setUsername] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void call('auth.loginTiles').then((list) => {
      setTiles(list)
      const pre = list.find((u) => u.id === lockedUserId) ?? (list.length === 1 ? list[0] : null)
      if (pre) choose(pre)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (u: LoginUserTile) => {
    setSelected(u)
    setMode(u.hasPin ? 'PIN' : 'PASSWORD')
    setSecret('')
    setError(null)
  }

  const submit = async (value = secret) => {
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      const session = lockedUserId
        ? await call('auth.unlock', { userId: selected!.id, secret: value, method: mode })
        : manual
          ? await call('auth.login', { username, secret: value, method: 'PASSWORD' })
          : await call('auth.login', { userId: selected!.id, secret: value, method: mode })
      setSession(session)
      onDone?.()
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL'))
      setSecret('')
    } finally {
      setBusy(false)
    }
  }

  // Physical keyboard support for the PIN pad.
  useEffect(() => {
    if (!selected || mode !== 'PIN' || manual) return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setSecret((s) => (s.length < 8 ? s + e.key : s))
      else if (e.key === 'Backspace') setSecret((s) => s.slice(0, -1))
      else if (e.key === 'Enter') void submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const showPicker = !selected && !manual
  return (
    <div className="relative flex h-full items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_top,var(--primary-soft),var(--bg)_60%)] p-6">
      <div className="absolute end-4 top-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="mb-3 size-14" />
          <h1 className="text-2xl font-extrabold">{storeName || t('app.name')}</h1>
          <p className="text-muted">{showPicker ? t('auth.whoIsWorking') : t('auth.welcomeBack')}</p>
        </div>

        {showPicker ? (
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {tiles.map((u) => (
              <button
                key={u.id}
                onClick={() => choose(u)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-primary"
              >
                <Avatar name={u.fullName} />
                <span className="w-full truncate text-sm font-bold">{u.fullName}</span>
                <span className="text-xs text-muted">{u.roleName}</span>
              </button>
            ))}
            <button
              onClick={() => {
                setManual(true)
                setMode('PASSWORD')
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-muted transition hover:border-primary hover:text-fg"
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-sunken">
                <UserRound className="size-6" />
              </div>
              <span className="text-sm font-semibold">{t('auth.otherUser')}</span>
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-pop)]">
            {!lockedUserId || tiles.length > 1 ? (
              <button
                className="mb-4 flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"
                onClick={() => {
                  setSelected(null)
                  setManual(false)
                  setError(null)
                }}
              >
                <ArrowLeft className="size-4 rtl:rotate-180" /> {t('auth.switchUser')}
              </button>
            ) : null}
            {selected && !manual ? (
              <div className="mb-4 flex flex-col items-center gap-2">
                <Avatar name={selected.fullName} size="lg" />
                <p className="text-lg font-bold">{selected.fullName}</p>
                <p className="text-sm text-muted">{mode === 'PIN' ? t('auth.enterPin') : t('auth.enterPassword')}</p>
              </div>
            ) : null}
            {mode === 'PIN' && !manual ? (
              <PinPad
                value={secret}
                onChange={setSecret}
                onSubmit={() => void submit()}
              />
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                {manual ? (
                  <Field label={t('auth.username')}>
                    <Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" dir="ltr" />
                  </Field>
                ) : null}
                <Field label={t('auth.password')}>
                  <Input type="password" autoFocus={!manual} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" />
                </Field>
                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  <KeyRound /> {t('auth.signIn')}
                </Button>
              </form>
            )}
            {error ? <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger">{error}</p> : null}
            {selected && !manual && selected.hasPin ? (
              <button className="mt-4 w-full text-center text-sm font-semibold text-primary" onClick={() => setMode(mode === 'PIN' ? 'PASSWORD' : 'PIN')}>
                {mode === 'PIN' ? t('auth.usePassword') : t('auth.usePin')}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
