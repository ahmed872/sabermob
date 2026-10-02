import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tags, Trash2 } from 'lucide-react'
import type { VariantListItem } from '@shared/types/catalog'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { NumberInput } from '../../components/ui/input'
import { ProductPicker } from '../../components/product-picker'
import { PrintPreviewDialog } from '../../components/print-preview'

export function LabelsDialog({ onClose, initial }: { onClose: () => void; initial?: VariantListItem[] }) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<Array<{ item: VariantListItem; qty: number }>>((initial ?? []).map((item) => ({ item, qty: Math.max(1, item.stockQty) })))
  const [preview, setPreview] = useState(false)
  if (preview) return <PrintPreviewDialog request={{ type: 'labels', items: lines.map((l) => ({ variantId: l.item.variantId, qty: l.qty })) }} onClose={onClose} />
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t('print.labels')}
      footer={
        <Button disabled={lines.length === 0} onClick={() => setPreview(true)}>
          <Tags /> {t('print.page')}
        </Button>
      }
    >
      <div className="space-y-3">
        <ProductPicker autoFocus onPick={(item) => setLines((ls) => (ls.some((l) => l.item.variantId === item.variantId) ? ls : [...ls, { item, qty: 1 }]))} />
        {lines.map((l, i) => (
          <div key={l.item.variantId} className="flex items-center gap-2 rounded-xl border border-line p-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.item.name}</span>
            <span className="font-mono text-xs text-muted" dir="ltr">
              {l.item.barcode ?? l.item.sku ?? '—'}
            </span>
            <div className="w-20">
              <NumberInput value={l.qty} min={1} max={500} aria-label={t('print.labelsCount')} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: v ?? 1 } : x)))} />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
