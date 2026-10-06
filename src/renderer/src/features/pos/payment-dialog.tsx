import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, CreditCard, Landmark, Plus, Smartphone, Trash2, CheckCircle2, Gift } from 'lucide-react'
import { settlePayments } from '@shared/domain/pricing'
import type { PaymentMethod } from '@shared/constants/enums'
import type { SaleDto } from '@shared/types/sales'
import { ApiError, callWithOverride } from '../../lib/api'
import { errorMessage } from '../../lib/query'
import { fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { MoneyInput } from '../../components/ui/input'
import { Checkbox, Kbd, Segmented } from '../../components/ui/misc'
import { useCart } from './cart-store'

const ICONS: Record<PaymentMethod, typeof Banknote> = { CASH: Banknote, CARD: CreditCard, WALLET: Smartphone, TRANSFER: Landmark }

interface Row {
  method: PaymentMethod
  amount: number
}

/** Rounded banknote suggestions above the total (e.g. 370 → 400, 500, 1000). */
function quickAmounts(total: number, configured: number[]): number[] {
  const out = new Set<number>()
  for (const step of [5000, 10000, 20000, 50000, 100000, 200000]) {
    const v = Math.ceil(total / step) * step
    if (v > total) out.add(v)
  }
  for (const v of configured) if (v > total) out.add(v)
  return [...out].sort((a, b) => a - b).slice(0, 4)
}

export function PaymentDialog({ open, onOpenChange, total, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; total: number; onDone: (s: SaleDto) => void }) {
  const { t } = useTranslation()
  const settings = useApp((s) => s.settings)!
  const cart = useCart()
  const methods = (['CASH', ...settings.pos.enabledPaymentMethods.filter((m) => m !== 'CASH')] as PaymentMethod[]).filter((m, i, a) => a.indexOf(m) === i)
  const [rows, setRows] = useState<Row[]>([])
  const [active, setActive] = useState(0)
  const [usePoints, setUsePoints] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInput = useRef<HTMLDivElement>(null)

  const loyalty = settings.loyalty
  const customer = cart.customer
  const canRedeem = loyalty.enabled && !!customer && customer.loyaltyPoints >= Math.max(loyalty.minRedeemPoints, 1)
  const pointsValue = canRedeem && usePoints ? Math.min(customer!.loyaltyPoints * loyalty.pointValue, total) : 0
  const redeemPoints = pointsValue > 0 ? Math.ceil(pointsValue / loyalty.pointValue) : 0
  const due = total - pointsValue

  useEffect(() => {
    if (open) {
      setRows([{ method: settings.pos.defaultPaymentMethod as PaymentMethod, amount: total }])
      setActive(0)
      setError(null)
      setUsePoints(false)
    }
  }, [open, total, settings.pos.defaultPaymentMethod])

  useEffect(() => {
    // keep a single-row payment equal to what is due when points change
    setRows((rs) => (rs.length === 1 ? [{ ...rs[0]!, amount: rs[0]!.method === 'CASH' ? Math.max(rs[0]!.amount, due) : due }] : rs))
  }, [due])

  const settled = useMemo(() => settlePayments(due, rows), [due, rows])
  const nonCash = rows.filter((r) => r.method !== 'CASH').reduce((a, r) => a + r.amount, 0)
  const overpaidCard = nonCash > due
  const needsCustomer = settled.remaining > 0 && !customer
  const creditBlocked = settled.remaining > 0 && !settings.pos.allowCreditSales
  const canComplete = !busy && !overpaidCard && !needsCustomer && !creditBlocked && cart.lines.length > 0

  const setAmount = (i: number, amount: number) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, amount } : r)))

  const complete = async () => {
    if (!canComplete) return
    setBusy(true)
    setError(null)
    const s = useCart.getState()
    try {
      const sale = await callWithOverride('pos.complete', {
        idempotencyKey: s.idempotencyKey,
        kind: s.kind,
        customerId: s.customer?.id ?? null,
        lines: s.lines.map((l) => ({
          variantId: l.variantId,
          name: l.variantId ? undefined : l.name,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          serial: l.serial,
          offerId: l.offerId
        })),
        cartDiscount: s.cartDiscount,
        payments: rows.filter((r) => r.amount > 0).map((r) => ({ method: r.method, amount: r.amount })),
        redeemPoints,
        note: s.note || null,
        offerEvents: s.offerEvents
      })
      onDone(sale)
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : t('errors.INTERNAL'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F10' || (e.key === 'Enter' && !(e.target as HTMLElement).closest('button'))) {
        e.preventDefault()
        void complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const quick = quickAmounts(due, settings.pos.quickAmounts)

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} size="lg" title={t('pos.payment')}>
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4" ref={firstInput}>
          {rows.map((r, i) => (
            <div key={i} className={cn('rounded-2xl border p-3 transition', active === i ? 'border-primary bg-primary-soft/30' : 'border-line')} onClick={() => setActive(i)}>
              <div className="mb-2 flex items-center gap-2">
                <Segmented
                  className="flex-1"
                  size="lg"
                  value={r.method}
                  onChange={(m) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, method: m } : x)))}
                  options={methods.map((m) => ({ value: m, label: t(`pos.methods.${m}`), icon: ICONS[m] }))}
                />
                {rows.length > 1 ? (
                  <Button variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
              <MoneyInput autoFocus={i === 0} value={r.amount} onChange={(v) => setAmount(i, v ?? 0)} className="h-14 text-2xl font-extrabold" />
              {r.method === 'CASH' && i === active ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="soft" size="sm" onClick={() => setAmount(i, Math.max(0, due - (settled.tendered - r.amount)))}>
                    {t('pos.exact')}
                  </Button>
                  {quick.map((q) => (
                    <Button key={q} variant="outline" size="sm" onClick={() => setAmount(i, q)} className="tabular">
                      {fmtMoney(q)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {rows.length < 4 && settled.remaining > 0 ? (
            <Button
              variant="soft"
              onClick={() => {
                const used = new Set(rows.map((r) => r.method))
                const next = methods.find((m) => !used.has(m)) ?? 'CASH'
                setRows((rs) => [...rs, { method: next, amount: settled.remaining }])
                setActive(rows.length)
              }}
            >
              <Plus /> {t('pos.addPayment')}
            </Button>
          ) : null}
          {canRedeem ? (
            <div className="rounded-xl border border-line p-3">
              <Checkbox
                checked={usePoints}
                onCheckedChange={setUsePoints}
                label={
                  <span className="flex items-center gap-1.5">
                    <Gift className="size-4 text-primary" /> {t('pos.redeemPoints')} — {t('pos.pointsAvailable', { count: customer!.loyaltyPoints })} ({fmtMoney(customer!.loyaltyPoints * loyalty.pointValue)})
                  </span>
                }
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-sunken p-4">
          <div>
            <p className="text-sm font-semibold text-muted">{t('pos.total')}</p>
            <p className="text-3xl font-black tabular">{fmtMoney(total)}</p>
            {pointsValue > 0 ? (
              <p className="text-sm text-success">
                - {fmtMoney(pointsValue)} ({fmtNumber(redeemPoints)} {t('pos.points')})
              </p>
            ) : null}
          </div>
          <Line label={t('pos.tendered')} value={fmtMoney(settled.tendered)} />
          {settled.change > 0 ? (
            <div className="rounded-xl bg-success-soft p-3 text-success">
              <p className="text-sm font-bold">{t('pos.change')}</p>
              <p className="text-2xl font-black tabular">{fmtMoney(settled.change)}</p>
            </div>
          ) : null}
          {settled.remaining > 0 ? (
            <div className={cn('rounded-xl p-3', customer ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger')}>
              <p className="text-sm font-bold">{customer ? t('pos.onCredit') : t('pos.remaining')}</p>
              <p className="text-2xl font-black tabular">{fmtMoney(settled.remaining)}</p>
              {creditBlocked ? (
                <p className="mt-1 text-xs font-semibold">{t('pos.creditDisabled')}</p>
              ) : !customer ? (
                <p className="mt-1 text-xs font-semibold">{t('pos.creditNeedsCustomer')}</p>
              ) : null}
            </div>
          ) : null}
          {overpaidCard ? <p className="text-sm font-semibold text-danger">{t('errors.PAYMENT_MISMATCH')}</p> : null}
          {error ? <p className="rounded-xl bg-danger-soft p-2 text-sm font-semibold text-danger">{error}</p> : null}
          <div className="mt-auto">
            <Button variant="success" size="xl" className="w-full" disabled={!canComplete} loading={busy} onClick={complete}>
              <CheckCircle2 /> {t('pos.complete')}
            </Button>
            <p className="mt-1.5 text-center text-xs text-muted">
              <Kbd>F10</Kbd> / <Kbd>Enter</Kbd>
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-bold tabular">{value}</span>
    </div>
  )
}
