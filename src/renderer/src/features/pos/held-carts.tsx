import { useTranslation } from 'react-i18next'
import { PauseCircle, Play, Trash2 } from 'lucide-react'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtMoney, fmtRelative } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/misc'
import { useCart, type CartSnapshot } from './cart-store'

export function HeldCartsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const held = useApi('pos.held', undefined, { enabled: open })
  const take = useApiMutation('pos.takeHeld', {
    invalidate: ['pos.held'],
    onSuccess: (h) => {
      try {
        useCart.getState().load(JSON.parse(h.payload) as CartSnapshot, null)
      } catch {
        /* corrupted snapshot: ignore */
      }
      onOpenChange(false)
    }
  })
  const del = useApiMutation('pos.deleteHeld', { invalidate: ['pos.held'] })
  const hasCart = useCart((s) => s.lines.length > 0)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('pos.held')} size="md">
      {held.data?.length === 0 ? <EmptyState icon={PauseCircle} title={t('pos.noHeld')} /> : null}
      <div className="space-y-2">
        {held.data?.map((h) => (
          <div key={h.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{h.label}</p>
              <p className="text-xs text-muted">
                {h.userName} · {fmtRelative(h.createdAt)}
              </p>
            </div>
            <span className="font-extrabold tabular">{fmtMoney(h.total)}</span>
            <Button size="sm" disabled={hasCart} onClick={() => take.mutate({ id: h.id })}>
              <Play /> {t('pos.resume')}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => del.mutate({ id: h.id })}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
