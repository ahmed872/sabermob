import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, History, ShieldCheck } from 'lucide-react'
import type { BackupInspection } from '@shared/types/backup'
import { call } from '../../lib/api'
import { errorMessage } from '../../lib/query'
import { fmtBytes, fmtDate } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input } from '../../components/ui/input'
import { Checkbox } from '../../components/ui/misc'
import { Spinner } from '../../components/ui/spinner'

/** Opens the OS file picker and returns what the chosen backup contains. */
export async function pickBackupFile(): Promise<BackupInspection | null> {
  return call('backup.inspect', {})
}

/**
 * Confirms and runs a restore. Used from Settings, the first-launch screen
 * and the activation screen. The app restarts when it finishes.
 */
export function RestoreDialog({ info, onClose, firstLaunch }: { info: BackupInspection; onClose: () => void; firstLaunch?: boolean }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [understood, setUnderstood] = useState(!!firstLaunch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await call('backup.restore', { token: info.token, password })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const counts = { products: 0, customers: 0, sales: 0, repairs: 0, ...info.counts }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      dismissable={!busy}
      title={
        <span className="flex items-center gap-2">
          <History className="size-5 text-primary" /> {t('backup.restoreTitle')}
        </span>
      }
      footer={
        busy ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Spinner className="size-4" /> {t('backup.restoring')}
          </p>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" disabled={info.newer || !understood || !password} onClick={() => void run()}>
              {t('backup.restoreNow')}
            </Button>
          </>
        )
      }
    >
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-sunken/60 p-3 text-sm">
        <dt className="text-muted">{t('backup.shop')}</dt>
        <dd className="font-bold">{info.shopName || '—'}</dd>
        <dt className="text-muted">{t('backup.createdAt')}</dt>
        <dd>{fmtDate(info.createdAt, true)}</dd>
        <dt className="text-muted">{t('backup.contents')}</dt>
        <dd>{t('backup.counts', counts)}</dd>
        <dt className="text-muted">{t('backup.version')}</dt>
        <dd className="text-xs text-muted" dir="ltr">
          {info.appVersion} · {fmtBytes(info.sizeBytes)} · {info.fileName}
        </dd>
      </dl>
      {info.newer ? (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" /> {t('backup.newer')}
        </p>
      ) : (
        <>
          {!firstLaunch ? (
            <div className="mb-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="size-5 shrink-0" /> {t('backup.restoreWarn')}
              </p>
              <p className="mt-1 flex items-center gap-2 text-[13px]">
                <ShieldCheck className="size-4 shrink-0" /> {t('backup.restoreSafety')}
              </p>
            </div>
          ) : null}
          <Field label={t('backup.password')} error={error}>
            <Input type="password" autoFocus value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && understood && password && void run()} />
          </Field>
          {!firstLaunch ? (
            <div className="mt-3">
              <Checkbox checked={understood} onCheckedChange={setUnderstood} label={t('backup.restoreUnderstand')} disabled={busy} />
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  )
}
