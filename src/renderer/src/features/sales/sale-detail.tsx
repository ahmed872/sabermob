import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Ban, RotateCcw, UserRound } from 'lucide-react'
import type { SaleDto } from '@shared/types/sales'
import { callWithOverride } from '../../lib/api'
import { invalidate, toastError, useApi } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, NumberInput, Select } from '../../components/ui/input'
import { Badge, Checkbox, type Tone } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { SaleDetailExtras } from './sale-detail-extras'

export const STATUS_TONE: Record<string, Tone> = { COMPLETED: 'success', PARTIALLY_REFUNDED: 'warning', REFUNDED: 'neutral', VOIDED: 'danger' }

export function SaleDetailDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const q = useApi('pos.sale', { id: saleId })
  const [mode, setMode] = useState<'view' | 'refund' | 'void'>('view')
  const sale = q.data
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="lg" title={sale ? `${t('sales.number')} ${sale.number}${sale.invoiceNumber ? ` · ${sale.invoiceNumber}` : ''}` : '…'}>
      {!sale ? (
        <PageLoader />
      ) : mode === 'refund' ? (
        <RefundForm sale={sale} onDone={() => setMode('view')} />
      ) : mode === 'void' ? (
        <VoidForm sale={sale} onDone={() => setMode('view')} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={STATUS_TONE[sale.status]}>{t(`sales.statuses.${sale.status}`)}</Badge>
            <Badge>{t(`sales.kinds.${sale.kind}`)}</Badge>
            <span className="text-muted">{fmtDate(sale.createdAt, true)}</span>
            <span className="text-muted">· {sale.cashierName}</span>
            {sale.approvedByName ? <span className="text-muted">· {t('sales.approvedBy')} {sale.approvedByName}</span> : null}
          </div>
          {sale.customer ? (
            <div className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm">
              <UserRound className="size-4 text-muted" />
              <span className="font-semibold">{sale.customer.name}</span>
              <span className="text-muted" dir="ltr">
                {sale.customer.phone}
              </span>
            </div>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-subtle">
                <th className="py-1.5 text-start font-bold">{t('common.name')}</th>
                <th className="py-1.5 text-center font-bold">{t('common.qty')}</th>
                <th className="py-1.5 text-end font-bold">{t('common.price')}</th>
                <th className="py-1.5 text-end font-bold">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-2">
                    <p className="font-semibold">{i.name}</p>
                    <p className="text-xs text-muted">
                      {i.serial ? `IMEI ${i.serial} · ` : ''}
                      {i.discount > 0 ? `${t('pos.discount')} ${fmtMoney(i.discount)} · ` : ''}
                      {i.warrantyDays ? t('sales.warranty', { days: i.warrantyDays }) : ''}
                      {i.refundedQty > 0 ? <span className="text-danger"> · {t('sales.refunded')} {i.refundedQty}</span> : null}
                    </p>
                  </td>
                  <td className="py-2 text-center tabular">{fmtNumber(i.qty)}</td>
                  <td className="py-2 text-end tabular">{fmtMoney(i.unitPrice)}</td>
                  <td className="py-2 text-end font-bold tabular">{fmtMoney(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 text-sm">
              <p className="mb-1 font-bold">{t('sales.payments')}</p>
              {sale.payments.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-muted">{t(`pos.methods.${p.method}`, { defaultValue: p.method })}</span>
                  <span className={cn('tabular', p.amount < 0 && 'text-danger')} dir="ltr">
                    {fmtMoney(p.amount)}
                  </span>
                </div>
              ))}
              {sale.creditAmount > 0 ? (
                <div className="flex justify-between text-warning">
                  <span>{t('sales.credit')}</span>
                  <span className="tabular">{fmtMoney(sale.creditAmount)}</span>
                </div>
              ) : null}
            </div>
            <div className="space-y-1 rounded-xl bg-sunken p-3 text-sm">
              {sale.discountTotal > 0 ? <Row label={t('pos.discount')} value={`- ${fmtMoney(sale.discountTotal)}`} /> : null}
              {sale.taxTotal > 0 ? <Row label={t('pos.tax')} value={fmtMoney(sale.taxTotal)} /> : null}
              <Row label={t('pos.total')} value={fmtMoney(sale.total)} bold />
              {sale.refundedTotal > 0 ? <Row label={t('sales.refunded')} value={`- ${fmtMoney(sale.refundedTotal)}`} /> : null}
              {sale.profit !== null ? <Row label={t('sales.profit')} value={fmtMoney(sale.profit)} /> : null}
            </div>
          </div>
          {sale.refunds.length ? (
            <div className="text-sm">
              <p className="mb-1 font-bold">{t('sales.refunds')}</p>
              {sale.refunds.map((r) => (
                <p key={r.id} className="text-muted">
                  {r.number} · {fmtDate(r.createdAt, true)} · {fmtMoney(r.total)} · {t(`pos.methods.${r.method}`, { defaultValue: r.method })} {r.reason ? `· ${r.reason}` : ''}
                </p>
              ))}
            </div>
          ) : null}
          {sale.voidReason ? <p className="rounded-xl bg-danger-soft p-2 text-sm text-danger">{sale.voidReason}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
            <SaleDetailExtras sale={sale} />
            {sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED' ? (
              <Button variant="outline" onClick={() => setMode('refund')}>
                <RotateCcw /> {t('sales.refund')}
              </Button>
            ) : null}
            {sale.status === 'COMPLETED' && (can('cancel_sale') || can('create_sale')) ? (
              <Button variant="danger" onClick={() => setMode('void')}>
                <Ban /> {t('sales.void')}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn('flex justify-between', bold && 'text-base font-extrabold')}>
      <span className={bold ? '' : 'text-muted'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}

function RefundForm({ sale, onDone }: { sale: SaleDto; onDone: () => void }) {
  const { t } = useTranslation()
  const [qty, setQty] = useState<Record<string, number>>({})
  const [restock, setRestock] = useState<Record<string, boolean>>({})
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'WALLET' | 'TRANSFER' | 'CREDIT'>(sale.creditAmount > 0 && sale.customer ? 'CREDIT' : 'CASH')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = sale.items.filter((i) => (qty[i.id] ?? 0) > 0)
  const estimate = selected.reduce((a, i) => a + Math.round((i.total * (qty[i.id] ?? 0)) / i.qty), 0)
  const submit = async () => {
    setBusy(true)
    try {
      await callWithOverride('pos.refund', {
        saleId: sale.id,
        items: selected.map((i) => ({ saleItemId: i.id, qty: qty[i.id]!, restock: restock[i.id] ?? true })),
        method,
        reason: reason || null
      })
      toast.success(t('sales.refundDone'))
      invalidate('pos.', 'catalog.', 'inventory.', 'shifts.', 'customers.', 'reports.')
      onDone()
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="font-bold">{t('sales.refundTitle', { number: sale.number })}</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {sale.items.map((i) => {
          const max = i.qty - i.refundedQty
          return (
            <div key={i.id} className={cn('flex items-center gap-3 px-3 py-2', max === 0 && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{i.name}</p>
                <p className="text-xs text-muted">
                  {fmtNumber(max)} / {fmtNumber(i.qty)} · {fmtMoney(i.total)}
                </p>
              </div>
              <Checkbox checked={restock[i.id] ?? true} onCheckedChange={(v) => setRestock({ ...restock, [i.id]: v })} label={t('sales.restock')} disabled={max === 0} />
              <div className="w-20">
                <NumberInput value={qty[i.id] ?? 0} min={0} max={max} disabled={max === 0} onChange={(v) => setQty({ ...qty, [i.id]: v ?? 0 })} aria-label={t('sales.refundQty')} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('sales.refundMethod')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {(['CASH', 'CARD', 'WALLET', 'TRANSFER'] as const).map((m) => (
              <option key={m} value={m}>
                {t(`pos.methods.${m}`)}
              </option>
            ))}
            {sale.customer ? <option value="CREDIT">{t('pos.methods.CREDIT')}</option> : null}
          </Select>
        </Field>
        <Field label={t('common.reason')} optional>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-between border-t border-line pt-3">
        <p className="text-sm">
          {t('sales.refundTotal')}: <b className="tabular">{fmtMoney(estimate)}</b>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            {t('common.back')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={selected.length === 0}>
            <RotateCcw /> {t('sales.refund')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function VoidForm({ sale, onDone }: { sale: SaleDto; onDone: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await callWithOverride('pos.void', { saleId: sale.id, reason })
      toast.success(t('sales.voided'))
      invalidate('pos.', 'catalog.', 'inventory.', 'shifts.', 'customers.', 'reports.')
      onDone()
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{t('sales.voidConfirm')}</p>
      <Field label={t('sales.voidReason')}>
        <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {t('common.back')}
        </Button>
        <Button variant="danger" onClick={submit} loading={busy} disabled={reason.trim().length < 2}>
          <Ban /> {t('sales.void')}
        </Button>
      </div>
    </div>
  )
}
