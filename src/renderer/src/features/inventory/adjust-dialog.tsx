import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import type { VariantListItem } from '@shared/types/catalog'
import type { AdjustmentType } from '@shared/constants/enums'
import { useApiMutation } from '../../lib/query'
import { fmtNumber } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, NumberInput } from '../../components/ui/input'
import { Segmented } from '../../components/ui/misc'
import { ProductPicker } from '../../components/product-picker'

interface Line {
  item: VariantListItem
  qty: number
}

export function AdjustStockDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: VariantListItem | null }) {
  const { t } = useTranslation()
  const [type, setType] = useState<AdjustmentType>('COUNT')
  const [lines, setLines] = useState<Line[]>(initial ? [{ item: initial, qty: initial.stockQty }] : [])
  const [note, setNote] = useState('')
  const mutation = useApiMutation('inventory.adjust', {
    invalidate: ['catalog.', 'inventory.'],
    onSuccess: (res) => {
      toast.success(t('inventory.adjustDone', { number: res.number }))
      setLines([])
      setNote('')
      onOpenChange(false)
    }
  })

  const add = (item: VariantListItem) => {
    if (!item.trackStock) return
    setLines((ls) => (ls.some((l) => l.item.variantId === item.variantId) ? ls : [...ls, { item, qty: type === 'COUNT' ? item.stockQty : 1 }]))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t('inventory.adjustTitle')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={lines.length === 0}
            onClick={() => mutation.mutate({ type, note: note || null, items: lines.map((l) => ({ variantId: l.item.variantId, qty: l.qty })) })}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('inventory.adjustType')}>
          <Segmented
            className="w-full"
            value={type}
            onChange={(v) => {
              setType(v)
              setLines((ls) => ls.map((l) => ({ ...l, qty: v === 'COUNT' ? l.item.stockQty : 1 })))
            }}
            options={(['COUNT', 'DAMAGED', 'LOST', 'CORRECTION'] as const).map((v) => ({ value: v, label: t(`inventory.adjustTypes.${v}`) }))}
          />
        </Field>
        <ProductPicker onPick={add} autoFocus filter={(i) => i.trackStock} />
        <div className="divide-y divide-line rounded-xl border border-line">
          {lines.map((l, i) => (
            <div key={l.item.variantId} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.item.name}</p>
                <p className="text-xs text-muted">
                  {t('inventory.stockQty')}: {fmtNumber(l.item.stockQty)}
                </p>
              </div>
              <div className="w-28">
                <NumberInput
                  value={l.qty}
                  min={type === 'CORRECTION' ? -100000 : 0}
                  onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: v ?? 0 } : x)))}
                />
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {lines.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">{t('common.noResults')}</p> : null}
        </div>
        <Field label={t('common.note')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
