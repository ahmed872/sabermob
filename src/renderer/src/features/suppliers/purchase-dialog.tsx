import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, PackageCheck } from 'lucide-react'
import type { PurchaseDto } from '@shared/types/suppliers'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { useCan } from '../../stores/app'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { NumberInput, Textarea } from '../../components/ui/input'
import { Badge, type Tone } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'

export const PURCHASE_TONE: Record<string, Tone> = { DRAFT: 'neutral', ORDERED: 'info', PARTIAL: 'warning', RECEIVED: 'success', CANCELLED: 'danger' }

export function PurchaseDialog({ purchaseId, onClose }: { purchaseId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const confirm = useConfirm()
  const q = useApi('purchases.get', { id: purchaseId })
  const [receiving, setReceiving] = useState(false)
  const cancel = useApiMutation('purchases.cancel', { invalidate: ['purchases.', 'suppliers.'], success: 'common.saved' })
  const po = q.data
  const open = po && (po.status === 'ORDERED' || po.status === 'PARTIAL')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="lg" title={po ? `${po.number} · ${po.supplierName}` : '…'}>
      {!po ? (
        <PageLoader />
      ) : receiving ? (
        <ReceiveForm po={po} onDone={() => setReceiving(false)} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={PURCHASE_TONE[po.status]}>{t(`suppliers.statuses.${po.status}`)}</Badge>
            <span className="text-muted">{fmtDate(po.orderedAt, true)}</span>
            {po.supplierInvoiceNo ? <span className="text-muted">· {t('suppliers.invoiceNo')}: {po.supplierInvoiceNo}</span> : null}
            <span className="text-muted">· {po.userName}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-subtle">
                <th className="py-1.5 text-start">{t('common.name')}</th>
                <th className="py-1.5 text-center">{t('suppliers.ordered')}</th>
                <th className="py-1.5 text-center">{t('suppliers.received')}</th>
                <th className="py-1.5 text-center">{t('suppliers.damaged')}</th>
                <th className="py-1.5 text-end">{t('suppliers.unitCost')}</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{i.name}</td>
                  <td className="py-2 text-center tabular">{fmtNumber(i.qtyOrdered)}</td>
                  <td className="py-2 text-center tabular">{fmtNumber(i.qtyReceived)}</td>
                  <td className="py-2 text-center tabular text-danger">{i.qtyDamaged || '—'}</td>
                  <td className="py-2 text-end tabular">{fmtMoney(i.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-sunken p-3 text-sm">
            <span>
              {t('suppliers.valueReceived')}: <b className="tabular">{fmtMoney(po.total)}</b>
            </span>
            <span>
              {t('suppliers.paidNow')}: <b className="tabular">{fmtMoney(po.paid)}</b>
            </span>
          </div>
          {po.notes ? <p className="text-sm text-muted">{po.notes}</p> : null}
          {open && can('manage_purchases') ? (
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              {po.items.every((i) => i.qtyReceived === 0) ? (
                <Button variant="ghost" onClick={async () => (await confirm({ title: t('suppliers.cancelPurchase'), danger: true })) && cancel.mutate({ id: po.id })}>
                  <Ban /> {t('suppliers.cancelPurchase')}
                </Button>
              ) : null}
              <Button onClick={() => setReceiving(true)}>
                <PackageCheck /> {t('suppliers.receive')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}

function ReceiveForm({ po, onDone }: { po: PurchaseDto; onDone: () => void }) {
  const { t } = useTranslation()
  const lines = po.items.map((i) => ({ ...i, outstanding: i.qtyOrdered - i.qtyReceived - i.qtyDamaged }))
  const [good, setGood] = useState<Record<string, number>>(Object.fromEntries(lines.map((l) => [l.id, l.outstanding])))
  const [bad, setBad] = useState<Record<string, number>>({})
  const [serials, setSerials] = useState<Record<string, string>>({})
  const receive = useApiMutation('purchases.receive', { invalidate: ['purchases.', 'suppliers.', 'catalog.', 'inventory.'], success: 'common.saved', onSuccess: onDone })
  return (
    <div className="space-y-3">
      {lines
        .filter((l) => l.outstanding > 0)
        .map((l) => (
          <div key={l.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.name}</span>
              <span className="text-xs text-muted">
                {t('suppliers.outstanding')}: {l.outstanding}
              </span>
              <label className="w-24 text-xs">
                {t('suppliers.received')}
                <NumberInput value={good[l.id] ?? 0} max={l.outstanding} onChange={(v) => setGood({ ...good, [l.id]: v ?? 0 })} />
              </label>
              <label className="w-24 text-xs">
                {t('suppliers.damaged')}
                <NumberInput value={bad[l.id] ?? 0} max={l.outstanding} onChange={(v) => setBad({ ...bad, [l.id]: v ?? 0 })} />
              </label>
            </div>
            {l.trackSerials && (good[l.id] ?? 0) > 0 ? (
              <Textarea
                dir="ltr"
                rows={2}
                className="mt-2 font-mono"
                placeholder={`${t('suppliers.imeis', { count: good[l.id] })} — ${t('suppliers.imeisHint')}`}
                value={serials[l.id] ?? ''}
                onChange={(e) => setSerials({ ...serials, [l.id]: e.target.value })}
              />
            ) : null}
          </div>
        ))}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {t('common.back')}
        </Button>
        <Button
          loading={receive.isPending}
          onClick={() =>
            receive.mutate({
              purchaseOrderId: po.id,
              items: lines
                .filter((l) => (good[l.id] ?? 0) + (bad[l.id] ?? 0) > 0)
                .map((l) => ({
                  purchaseItemId: l.id,
                  qtyReceived: good[l.id] ?? 0,
                  qtyDamaged: bad[l.id] ?? 0,
                  serials: l.trackSerials ? (serials[l.id] ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : undefined
                }))
            })
          }
        >
          <PackageCheck /> {t('suppliers.receive')}
        </Button>
      </div>
    </div>
  )
}
