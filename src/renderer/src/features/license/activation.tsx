import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BadgeCheck, Clock, Copy, DatabaseBackup, KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { call, ApiError } from '../../lib/api'
import { errorMessage, useApiMutation } from '../../lib/query'
import { fmtDate } from '../../lib/format'
import { useApp, useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/input'
import { Badge, Card } from '../../components/ui/misc'
import { cn } from '../../lib/utils'

/** Compact status chip in the top bar (trial days left / expiring soon). */
export function LicenseBadge() {
  const { t } = useTranslation()
  const license = useApp((s) => s.license)
  const navigate = useNavigate()
  const can = useCan()
  if (!license) return null
  let tone: 'warning' | 'danger' | 'info' | null = null
  let text = ''
  if (license.status === 'TRIAL') {
    tone = (license.daysLeft ?? 0) <= 3 ? 'danger' : 'info'
    text = t('license.trialDaysLeft', { count: license.daysLeft ?? 0 })
  } else if (license.inGrace) {
    tone = 'danger'
    text = t('license.graceWarning', { count: Math.max(0, 3 + (license.daysLeft ?? 0)) })
  } else if (license.status === 'ACTIVE' && license.daysLeft !== null && license.daysLeft <= 14) {
    tone = 'warning'
    text = t('license.expiringSoon', { count: license.daysLeft })
  }
  if (!tone) return null
  return (
    <button onClick={() => can('manage_license') && navigate('/settings/license')} className="me-1">
      <Badge tone={tone} dot>
        <Clock className="size-3.5" />
        {text}
      </Badge>
    </button>
  )
}

export function LicensePanel({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  const license = useApp((s) => s.license)
  const setLicense = useApp((s) => s.setLicense)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!license) return null

  const activate = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await call('license.activate', { key: key.trim() })
      setLicense(s)
      setKey('')
      toast.success(t('license.activated'))
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL'))
    } finally {
      setBusy(false)
    }
  }

  const statusText =
    license.status === 'TRIAL'
      ? t('license.trialDaysLeft', { count: license.daysLeft ?? 0 })
      : license.status === 'TRIAL_EXPIRED'
        ? t('license.trialEnded')
        : license.status === 'EXPIRED'
          ? t('license.expired')
          : license.daysLeft === null
            ? t('license.lifetime')
            : t('license.expiresOn', { date: fmtDate(license.expiresAt) })

  return (
    <div className="space-y-4">
      <div className={cn('flex items-center gap-3 rounded-2xl p-4', license.operational ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
        {license.status === 'ACTIVE' && license.operational ? <BadgeCheck className="size-7 shrink-0" /> : <ShieldCheck className="size-7 shrink-0" />}
        <div>
          <p className="text-base font-extrabold">{statusText}</p>
          <p className="text-sm opacity-90">
            {t('license.tier')}: {t(`license.tiers.${license.tier}`)} · {t('license.maxUsers', { count: license.maxUsers })}
            {license.serial ? ` · ${t('license.serial')} ${license.serial}` : ''}
          </p>
        </div>
      </div>
      {license.clockWarning ? (
        <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
          <AlertTriangle className="size-4" /> {t('license.clockWarning')}
        </p>
      ) : null}
      {!compact ? <p className="text-sm text-muted">{t('license.requiredBody')}</p> : null}
      <div>
        <p className="mb-1.5 text-[13px] font-semibold">{t('license.requestCode')}</p>
        <div className="flex items-center gap-2">
          <code dir="ltr" className="selectable flex-1 rounded-xl border border-line-strong bg-sunken px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.2em]">
            {license.requestCode}
          </code>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              void navigator.clipboard.writeText(license.requestCode)
              toast.success(t('common.copied'))
            }}
          >
            <Copy /> {t('license.copyCode')}
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold">{t('license.activationKey')}</p>
        <Textarea dir="ltr" rows={4} className="font-mono text-sm uppercase" placeholder={t('license.keyPlaceholder')} value={key} onChange={(e) => setKey(e.target.value)} />
        {error ? <p className="mt-1.5 text-sm font-semibold text-danger">{error}</p> : null}
      </div>
      <Button size="lg" className="w-full" onClick={activate} loading={busy} disabled={key.replace(/[^0-9a-z]/gi, '').length < 120}>
        <KeyRound /> {t('license.activate')}
      </Button>
    </div>
  )
}

/** Shown instead of the app when the trial/license is no longer valid. */
export function ActivationScreen() {
  const { t } = useTranslation()
  const license = useApp((s) => s.license)
  const can = useCan()
  const backup = useApiMutation('backup.create', { success: 'backup.created' })
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <Card className="w-full max-w-xl p-6">
        <h1 className="mb-1 text-2xl font-extrabold">{license?.status === 'EXPIRED' ? t('license.expired') : t('license.trialEnded')}</h1>
        <p className="mb-5 text-sm text-muted">{t('license.dataSafe')}</p>
        <LicensePanel />
        {can('manage_backups') ? (
          <Button className="mt-4" variant="outline" loading={backup.isPending} onClick={() => backup.mutate(undefined)}>
            <DatabaseBackup /> {t('backup.now')}
          </Button>
        ) : null}
      </Card>
    </div>
  )
}
