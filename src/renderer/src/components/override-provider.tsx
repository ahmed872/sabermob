import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import type { LoginUserTile } from '@shared/types/auth'
import { call, setOverrideHandler, ApiError } from '../lib/api'
import { errorMessage } from '../lib/query'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field, Input, Select } from './ui/input'

interface Pending {
  permissions: string[]
  resolve: (token: string | null) => void
}

/**
 * Lets a manager approve one restricted action (discount above limit,
 * refund, price below minimum…) without logging the cashier out.
 */
export function OverrideProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)
  const [users, setUsers] = useState<LoginUserTile[]>([])
  const [userId, setUserId] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<Pending | null>(null)

  useEffect(() => {
    setOverrideHandler(
      (permissions) =>
        new Promise<string | null>((resolve) => {
          const p = { permissions, resolve }
          pendingRef.current = p
          setPending(p)
          setSecret('')
          setError(null)
          void call('auth.loginTiles').then((u) => {
            setUsers(u)
            setUserId((prev) => prev || u[0]?.id || '')
          })
        })
    )
    return () => setOverrideHandler(null)
  }, [])

  const close = (token: string | null) => {
    pendingRef.current?.resolve(token)
    pendingRef.current = null
    setPending(null)
  }

  const submit = async () => {
    if (!pending || !userId || !secret) return
    setBusy(true)
    setError(null)
    const user = users.find((u) => u.id === userId)
    try {
      const res = await call('auth.override', {
        userId,
        secret,
        method: user?.hasPin && /^\d{4,8}$/.test(secret) ? 'PIN' : 'PASSWORD',
        permission: pending.permissions[0] as never,
        permissions: pending.permissions as never
      })
      close(res.token)
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {children}
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && close(null)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {t('auth.approvalTitle')}
          </span>
        }
        description={pending ? t('auth.approvalBody', { permission: pending.permissions.map((p) => t(`permissions.${p}`)).join('، ') }) : null}
        footer={
          <>
            <Button variant="outline" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={busy} disabled={!secret}>
              {t('auth.approve')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('auth.approver')}>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {u.roleName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`${t('auth.pin')} / ${t('auth.password')}`} error={error}>
            <Input type="password" autoFocus value={secret} onChange={(e) => setSecret(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
