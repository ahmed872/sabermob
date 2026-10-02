import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, PackagePlus, Save, Trash2 } from 'lucide-react'
import type { VariantListItem } from '@shared/types/catalog'
import type { PaymentMethod } from '@shared/constants/enums'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtMoney } from '../../lib/format'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Field, Input, MoneyInput, NumberInput, Select, Textarea } from '../../components/ui/input'
import { Card, SwitchRow } from '../../components/ui/misc'
import { ProductPicker } from '../../components/product-picker'

interface Line {
  item: VariantListItem
  qty: number
  unitCost: number
  serials: string
}

/** One-screen purchase entry: pick supplier, scan products, set cost, receive & pay. */
export default function PurchaseEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [params] = useSearchParams()
  const suppliers = useApi('suppliers.list', { page: 1, pageSize: 200 })
  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [receiveNow, setReceiveNow] = useState(true)
  const [paid, setPaid] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const total = lines.reduce((a, l) => a + l.qty * l.unitCost, 0)
  const save = useApiMutation('purchases.create', {
    invalidate: ['purchases.', 'suppliers.', 'catalog.', 'inventory.', 'shifts.'],
    success: 'suppliers.purchaseSaved',
    onSuccess: (po) => navigate(`/suppliers/${po.supplierId}`)
  })
  const add = (item: VariantListItem) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item.variantId === item.variantId)
      if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l))
      return [...ls, { item, qty: 1, unitCost: item.costPrice ?? 0, serials: '' }]
    })
  const serialCount = (l: Line) => l.serials.split(/\r?\n/).filter((s) => s.trim()).length
  const serialsOk = !receiveNow || lines.every((l) => !l.item.trackSerials || serialCount(l) === l.qty)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
          <h1 className="text-lg font-extrabold">{t('suppliers.newPurchase')}</h1>
        </div>
        <Button
          loading={save.isPending}
          disabled={!supplierId || lines.length === 0 || !serialsOk}
          onClick={() =>
            save.mutate({
              supplierId,
              supplierInvoiceNo: invoiceNo || null,
              notes: notes || null,
              receiveNow,
              items: lines.map((l) => ({ variantId: l.item.variantId, qty: l.qty, unitCost: l.unitCost })),
              serials: receiveNow
                ? Object.fromEntries(lines.filter((l) => l.item.trackSerials).map((l) => [l.item.variantId, l.serials.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)]))
                : undefined,
              payment: paid > 0 ? { amount: paid, method } : null
            })
          }
        >
          <Save /> {t('common.save')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('suppliers.title')}>
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">{t('common.select')}</option>
                    {suppliers.data?.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('suppliers.invoiceNo')} optional>
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                </Field>
              </div>
            </Card>
            <Card>
              <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                <PackagePlus className="size-4" /> {t('suppliers.addItems')}
              </p>
              <ProductPicker autoFocus onPick={add} filter={(i) => i.trackStock} />
              <div className="mt-3 space-y-2">
                {lines.map((l, i) => (
                  <div key={l.item.variantId} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-40 flex-1">
                        <p className="truncate text-sm font-semibold">{l.item.name}</p>
                        <p className="text-xs text-muted">{t('inventory.stockQty')}: {l.item.stockQty}</p>
                      </div>
                      <Field label={t('common.qty')} className="w-24">
                        <NumberInput value={l.qty} min={1} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: v ?? 1 } : x)))} />
                      </Field>
                      <Field label={t('suppliers.unitCost')} className="w-36">
                        <MoneyInput value={l.unitCost} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, unitCost: v ?? 0 } : x)))} />
                      </Field>
                      <span className="w-28 pb-2.5 text-end font-bold tabular">{fmtMoney(l.qty * l.unitCost)}</span>
                      <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                    {l.item.trackSerials && receiveNow ? (
                      <Textarea
                        dir="ltr"
                        rows={2}
                        className="mt-2 font-mono"
                        placeholder={`${t('suppliers.imeis', { count: l.qty })} — ${t('suppliers.imeisHint')}`}
                        value={l.serials}
                        aria-invalid={serialCount(l) !== l.qty || undefined}
                        onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, serials: e.target.value } : x)))}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <Field label={t('common.notes')} optional>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <p className="text-sm font-semibold text-muted">{t('common.total')}</p>
              <p className="text-3xl font-black tabular">{fmtMoney(total)}</p>
              <SwitchRow label={t('suppliers.receiveNow')} hint={t('suppliers.receiveNowHint')} checked={receiveNow} onCheckedChange={setReceiveNow} />
            </Card>
            {can('pay_suppliers') ? (
              <Card>
                <Field label={t('suppliers.paidNow')}>
                  <MoneyInput value={paid} onChange={(v) => setPaid(v ?? 0)} />
                </Field>
                <Button variant="link" size="sm" onClick={() => setPaid(total)}>
                  {t('pos.exact')}
                </Button>
                <Field label={t('pos.payment')}>
                  <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {(['CASH', 'TRANSFER', 'WALLET', 'CARD'] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(`pos.methods.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {total - paid > 0 ? (
                  <p className="mt-2 text-sm font-semibold text-danger">
                    {t('suppliers.weOwe')} {fmtMoney(total - paid)}
                  </p>
                ) : null}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
