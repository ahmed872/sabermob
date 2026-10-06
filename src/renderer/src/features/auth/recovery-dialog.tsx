import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, KeyRound, LifeBuoy } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, call } from '../../lib/api'
import { errorMessage } from '../../lib/query'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Checkbox } from '../../components/ui/misc'
import { Field, Input, Select, Textarea } from '../../components/ui/input'

/**
 * "Forgot password?" on the login screen. Staff: the owner resets it in
 * Settings → Users. Owner: send the recovery code to the vendor, enter the key
 * received and choose a new password (works offline, once, on this PC).
 */
export function RecoveryDialog({ onClose, onDone }: { onClose: () => void; onDone: (username: string) => void }) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<{ code: string; owners: Array<{ username: string; fullName: string }> } | null>(null)
  const [key, setKey] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pin, setPin] = useState('')
  const [alsoBackup, setAlsoBackup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void call('auth.recoveryCode').then((r) => {
      setInfo(r)
      setUsername(r.owners[0]?.username ?? '')
    })
  }, [])

  const mismatch = confirm.length > 0 && password !== confirm
  const ready = key.replace(/[^0-9a-z]/gi, '').length >= 120 && username && password.length > 0 && password === confirm && !busy

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await call('auth.recover', { key: key.trim(), username, password, pin: pin || null, alsoBackup })
      toast.success(res.backupPasswordChanged ? t('recovery.doneWithBackup') : t('recovery.done'), { duration: 8000 })
      onDone(username)
    } catch (err) {
      const reason = err instanceof ApiError ? err.details?.reason : undefined
      setError(
        reason === 'RECOVERY_INVALID' ? t('recovery.invalid') : reason === 'RECOVERY_EXPIRED' ? t('recovery.expired') : err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL')
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t('recovery.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!ready} loading={busy}>
            <KeyRound /> {t('recovery.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-info-soft p-3 text-sm text-info">
          <p className="flex items-center gap-2 font-bold">
            <LifeBuoy className="size-4" /> {t('recovery.staffTitle')}
          </p>
          <p className="mt-1">{t('recovery.staffBody')}</p>
        </div>
        <div>
          <p className="mb-1 text-sm font-bold">{t('recovery.step1')}</p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="selectable flex-1 rounded-xl border border-line-strong bg-sunken px-3 py-2.5 text-center font-mono text-base font-bold tracking-wider" data-testid="recovery-code">
              {info?.code ?? '…'}
            </code>
            <Button
              variant="outline"
              disabled={!info}
              onClick={() => {
                if (!info) return
                void navigator.clipboard.writeText(info.code)
                toast.success(t('common.copied'))
              }}
            >
              <Copy /> {t('license.copyCode')}
            </Button>
          </div>
        </div>
        <Field label={t('recovery.step2')}>
          <Textarea dir="ltr" rows={3} className="font-mono text-sm uppercase" placeholder={t('recovery.keyPlaceholder')} value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        {info && info.owners.length > 1 ? (
          <Field label={t('recovery.account')}>
            <Select value={username} onChange={(e) => setUsername(e.target.value)}>
              {info.owners.map((o) => (
                <option key={o.username} value={o.username}>
                  {o.fullName} ({o.username})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('auth.newPassword')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t('recovery.confirm')} error={mismatch ? t('recovery.mismatch') : undefined}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Field label={t('recovery.newPin')} optional>
          <Input dir="ltr" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Checkbox checked={alsoBackup} onCheckedChange={setAlsoBackup} label={t('recovery.alsoBackup')} />
        {error ? <p className="rounded-xl bg-danger-soft p-2 text-sm font-semibold text-danger">{error}</p> : null}
      </div>
    </Dialog>
  )
}
