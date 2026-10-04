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
import { SUBSCRIPTION } from '@shared/subscription'
import type { LicenseState } from '@shared/types/license'

const GRACE_DAYS = 3
const graceLeft = (l: LicenseState) => Math.max(0, GRACE_DAYS + (l.daysLeft ?? 0))
const planText = (t: (k: string, o?: Record<string, unknown>) => string) => t('license.planSubscription', { months: SUBSCRIPTION.months, price: SUBSCRIPTION.priceEgp })

/** Compact status chip in the top bar: trial or subscription days left, always visible. */
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
    text = license.plan === 'SUBSCRIPTION' ? t('license.subGrace', { count: graceLeft(license) }) : t('license.graceWarning', { count: graceLeft(license) })
  } else if (license.status === 'ACTIVE' && license.plan === 'SUBSCRIPTION' && license.daysLeft !== null) {
    tone = license.daysLeft <= 3 ? 'danger' : license.daysLeft <= SUBSCRIPTION.warnDays ? 'warning' : 'info'
    text = t('license.subDaysLeft', { count: license.daysLeft })
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
      toast.success(s.plan === 'SUBSCRIPTION' ? t('license.renewed', { date: fmtDate(s.expiresAt) }) : t('license.activated'))
    } catch (err) {
      const reason = err instanceof ApiError ? err.details?.reason : undefined
      setError(reason === 'USED' ? t('license.keyUsed') : reason === 'EXPIRED' ? t('license.keyExpired') : err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL'))
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
          ? license.plan === 'SUBSCRIPTION'
            ? t('license.subExpired')
            : t('license.expired')
          : license.daysLeft === null
            ? t('license.lifetime')
            : license.plan === 'SUBSCRIPTION'
              ? t('license.subUntil', { date: fmtDate(license.expiresAt), count: Math.max(0, license.daysLeft) })
              : t('license.expiresOn', { date: fmtDate(license.expiresAt) })

  return (
    <div className="space-y-4">
      <div className={cn('flex items-center gap-3 rounded-2xl p-4', license.operational ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
        {license.status === 'ACTIVE' && license.operational ? <BadgeCheck className="size-7 shrink-0" /> : <ShieldCheck className="size-7 shrink-0" />}
        <div>
          <p className="text-base font-extrabold">{statusText}</p>
          <p className="text-sm opacity-90">
            {license.plan === 'SUBSCRIPTION'
              ? `${t('license.plan')}: ${planText(t)} · ${t('license.noUserLimit')}`
              : `${t('license.tier')}: ${t(`license.tiers.${license.tier}`)} · ${t('license.maxUsers', { count: license.maxUsers })}`}
            {license.serial ? ` · ${t('license.serial')} ${license.serial}` : ''}
          </p>
        </div>
      </div>
      {license.clockWarning ? (
        <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
          <AlertTriangle className="size-4" /> {t('license.clockWarning')}
        </p>
      ) : null}
      {license.plan === 'SUBSCRIPTION' ? (
        <p className="text-sm text-muted">{t('license.renewHow', { months: SUBSCRIPTION.months })}</p>
      ) : !compact ? (
        <p className="text-sm text-muted">{t('license.requiredBody')}</p>
      ) : null}
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

/**
 * Strip above every screen in the last days of a subscription and in the grace
 * period: what it costs, the request code to send, and where to enter the key.
 * Can be hidden for the rest of the day except in the last 3 days.
 */
export function RenewalNotice() {
  const { t } = useTranslation()
  const license = useApp((s) => s.license)
  const navigate = useNavigate()
  const can = useCan()
  const today = new Date().toDateString()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('central.renewalNoticeHidden') === today
    } catch {
      return false
    }
  })
  if (!license || license.plan !== 'SUBSCRIPTION' || license.daysLeft === null || !license.operational) return null
  const urgent = license.inGrace || license.daysLeft <= 3
  if (!license.inGrace && license.daysLeft > SUBSCRIPTION.noticeDays) return null
  if (hidden && !urgent) return null
  const text = license.inGrace
    ? t('license.renewNoticeGrace', { count: graceLeft(license), months: SUBSCRIPTION.months, price: SUBSCRIPTION.priceEgp })
    : t('license.renewNotice', { count: license.daysLeft, date: fmtDate(license.expiresAt), months: SUBSCRIPTION.months, price: SUBSCRIPTION.priceEgp })
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm font-semibold', urgent ? 'border-danger/30 bg-danger-soft text-danger' : 'border-warning/30 bg-warning-soft text-warning')} data-testid="renewal-notice">
      <Clock className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      <code dir="ltr" className="selectable rounded-lg bg-surface/70 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-fg">
        {license.requestCode}
      </code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(license.requestCode)
          toast.success(t('common.copied'))
        }}
      >
        <Copy /> {t('license.copyCode')}
      </Button>
      {can('manage_license') ? (
        <Button size="sm" onClick={() => navigate('/settings/license')}>
          <KeyRound /> {t('license.enterRenewalKey')}
        </Button>
      ) : null}
      {!urgent ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem('central.renewalNoticeHidden', today)
            } catch {
              /* per-viewer convenience only */
            }
            setHidden(true)
          }}
        >
          {t('license.hideToday')}
        </Button>
      ) : null}
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
        <h1 className="mb-1 text-2xl font-extrabold">
          {license?.status === 'EXPIRED' ? (license.plan === 'SUBSCRIPTION' ? t('license.subExpired') : t('license.expired')) : t('license.trialEnded')}
        </h1>
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
