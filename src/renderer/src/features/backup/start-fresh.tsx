import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser } from 'lucide-react'
import { call, ApiError } from '../../lib/api'
import { errorMessage, useApi } from '../../lib/query'
import { fmtNumber } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input } from '../../components/ui/input'
import { Card, CardHeader, Checkbox } from '../../components/ui/misc'

/**
 * "Start fresh" (owner only): wipes a trial period's sales, products, customers,
 * suppliers, repairs... keeping the store details, users, settings and activation.
 * A safety backup is taken first; the app restarts afterwards.
 */
export function StartFreshCard() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Card className="border-danger/30">
      <CardHeader title={t('reset.title')} icon={Eraser} />
      <p className="mb-3 text-sm text-muted">{t('reset.body')}</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Eraser /> {t('reset.open')}
      </Button>
      {open ? <StartFreshDialog onClose={() => setOpen(false)} /> : null}
    </Card>
  )
}

function StartFreshDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const summary = useApi('data.resetSummary', undefined, { staleTime: 0 })
  const [clearCatalog, setClearCatalog] = useState(false)
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const word = t('reset.word')
  const ready = password.length > 0 && typed.trim() === word && !busy

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await call('data.reset', { password, confirm: 'RESET', clearCatalog })
      // the app restarts by itself in a moment
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL'))
      setBusy(false)
    }
  }

  const s = summary.data
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      size="md"
      title={t('reset.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={run} disabled={!ready} loading={busy}>
            <Eraser /> {t('reset.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          <p className="font-bold">{t('reset.willDelete')}</p>
          {s ? (
            <p className="mt-1">
              {t('reset.counts', { sales: fmtNumber(s.sales), products: fmtNumber(s.products), customers: fmtNumber(s.customers), suppliers: fmtNumber(s.suppliers), repairs: fmtNumber(s.repairs) })}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl bg-success-soft p-3 text-sm text-success">
          <p className="font-bold">{t('reset.willKeep')}</p>
          <p className="mt-1">{t('reset.keepList')}</p>
        </div>
        <Checkbox checked={clearCatalog} onCheckedChange={setClearCatalog} label={t('reset.clearCatalog')} />
        <p className="text-xs text-muted">{t('reset.backupNote')}</p>
        <Field label={t('reset.password')}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label={t('reset.typeWord', { word })}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} />
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft p-2 text-sm font-semibold text-danger">{error}</p> : null}
      </div>
    </Dialog>
  )
}
