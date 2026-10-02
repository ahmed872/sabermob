import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, Lock, Wallet } from 'lucide-react'
import type { ShiftSummary } from '@shared/types/sales'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput } from '../../components/ui/input'
import { Card, Segmented } from '../../components/ui/misc'

export function useCurrentShift() {
  return useApi('shifts.current', undefined, { staleTime: 5_000 })
}

/** Shown in the POS when selling requires an open shift. */
export function OpenShiftCard() {
  const { t } = useTranslation()
  const can = useCan()
  const [cash, setCash] = useState(0)
  const open = useApiMutation('shifts.open', { invalidate: ['shifts.'] })
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Wallet className="size-7" />
        </div>
        <h2 className="text-xl font-extrabold">{t('pos.openShiftTitle')}</h2>
        <p className="mb-4 text-sm text-muted">{t('pos.openShiftBody')}</p>
        {can('manage_shifts') ? (
          <>
            <Field label={t('pos.openingCash')} className="text-start">
              <MoneyInput autoFocus value={cash} onChange={(v) => setCash(v ?? 0)} className="h-12 text-lg font-bold" onEnter={() => open.mutate({ openingCash: cash })} />
            </Field>
            <Button size="lg" className="mt-4 w-full" loading={open.isPending} onClick={() => open.mutate({ openingCash: cash })}>
              {t('pos.openShift')}
            </Button>
          </>
        ) : (
          <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{t('errors.SHIFT_REQUIRED')}</p>
        )}
      </Card>
    </div>
  )
}

export function ShiftSummaryView({ s }: { s: ShiftSummary }) {
  const { t } = useTranslation()
  const rows: Array<[string, number, string?]> = [
    [t('pos.openingCash'), s.openingCash],
    [t('pos.salesTotal'), s.salesTotal],
    [t('pos.refundsTotal'), -s.refundsTotal, 'text-danger'],
    [t('pos.cashIn'), s.cashIn],
    [t('pos.cashOut'), -s.cashOut, 'text-danger'],
    [t('pos.supplierPayments'), -s.supplierPayments, 'text-danger']
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-sunken p-3">
          <p className="text-muted">{t('pos.salesCount')}</p>
          <p className="text-lg font-extrabold tabular">{fmtNumber(s.salesCount)}</p>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <p className="text-muted">{t('pos.expectedCash')}</p>
          <p className="text-lg font-extrabold tabular">{fmtMoney(s.expectedCash)}</p>
        </div>
      </div>
      <dl className="divide-y divide-line rounded-xl border border-line px-3 text-sm">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex justify-between py-2">
            <dt className="text-muted">{k}</dt>
            <dd className={cn('font-semibold tabular', cls)}>{fmtMoney(v)}</dd>
          </div>
        ))}
      </dl>
      {Object.keys(s.byMethod).length ? (
        <div>
          <p className="mb-1 text-xs font-bold text-muted">{t('pos.byMethod')}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(s.byMethod).map(([m, v]) => (
              <span key={m} className="rounded-lg bg-sunken px-2.5 py-1 text-xs font-semibold">
                {t(`pos.methods.${m}`, { defaultValue: m })}: <span className="tabular">{fmtMoney(v)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {s.status === 'CLOSED' ? (
        <div className={cn('rounded-xl p-3 text-sm font-bold', (s.difference ?? 0) === 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
          {t('pos.countedCash')}: {fmtMoney(s.countedCash)} · {t('pos.difference')}: <span className="tabular" dir="ltr">{fmtMoney(s.difference)}</span>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        {s.openedBy} · {fmtDate(s.openedAt, true)}
        {s.closedAt ? ` → ${fmtDate(s.closedAt, true)}` : ''}
      </p>
    </div>
  )
}

export function ShiftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const shift = useCurrentShift()
  const [mode, setMode] = useState<'summary' | 'cash' | 'close'>('summary')
  const [amount, setAmount] = useState(0)
  const [type, setType] = useState<'PAY_IN' | 'PAY_OUT'>('PAY_OUT')
  const [reason, setReason] = useState('')
  const [counted, setCounted] = useState<number | null>(null)
  const cash = useApiMutation('shifts.cash', {
    invalidate: ['shifts.'],
    success: 'common.saved',
    onSuccess: () => {
      setAmount(0)
      setReason('')
      setMode('summary')
    }
  })
  const close = useApiMutation('shifts.close', {
    invalidate: ['shifts.'],
    onSuccess: () => {
      toast.success(t('pos.shiftClosed'))
      onOpenChange(false)
      setMode('summary')
    }
  })
  const s = shift.data
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={s ? `${t('pos.shiftSummary')} — ${s.number}` : t('pos.noShift')} size="sm">
      {s ? (
        <div className="space-y-4">
          <Segmented
            className="w-full"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'summary', label: t('pos.shiftSummary') },
              ...(can('manage_cash_drawer') ? [{ value: 'cash' as const, label: t('pos.cashMovement') }] : []),
              { value: 'close', label: t('pos.closeShift') }
            ]}
          />
          {mode === 'summary' ? <ShiftSummaryView s={s} /> : null}
          {mode === 'cash' ? (
            <div className="space-y-3">
              <Segmented
                className="w-full"
                value={type}
                onChange={setType}
                options={[
                  { value: 'PAY_OUT', label: t('pos.cashOut'), icon: ArrowUpFromLine },
                  { value: 'PAY_IN', label: t('pos.cashIn'), icon: ArrowDownToLine }
                ]}
              />
              <Field label={t('common.amount')}>
                <MoneyInput autoFocus value={amount} onChange={(v) => setAmount(v ?? 0)} />
              </Field>
              <Field label={t('common.reason')}>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button className="w-full" disabled={amount <= 0 || reason.trim().length < 2} loading={cash.isPending} onClick={() => cash.mutate({ type, amount, reason })}>
                {t('common.save')}
              </Button>
            </div>
          ) : null}
          {mode === 'close' ? (
            <div className="space-y-3">
              <div className="flex justify-between rounded-xl bg-sunken p-3 text-sm">
                <span className="text-muted">{t('pos.expectedCash')}</span>
                <span className="font-extrabold tabular">{fmtMoney(s.expectedCash)}</span>
              </div>
              <Field label={t('pos.countedCash')}>
                <MoneyInput autoFocus allowEmpty value={counted} onChange={setCounted} className="h-12 text-lg font-bold" />
              </Field>
              {counted !== null ? (
                <p className={cn('text-sm font-bold', counted - s.expectedCash === 0 ? 'text-success' : 'text-warning')}>
                  {t('pos.difference')}: <span dir="ltr">{fmtMoney(counted - s.expectedCash)}</span>
                </p>
              ) : null}
              <Button variant="danger" className="w-full" disabled={counted === null} loading={close.isPending} onClick={() => close.mutate({ countedCash: counted ?? 0 })}>
                <Lock /> {t('pos.closeShift')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  )
}
