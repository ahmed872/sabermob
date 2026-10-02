import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ShoppingCart } from 'lucide-react'
import type { SaleDto } from '@shared/types/sales'
import { fmtMoney } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Kbd } from '../../components/ui/misc'
import { SaleDoneExtras } from './sale-done-extras'

export function SaleDoneDialog({ sale, onNew }: { sale: SaleDto | null; onNew: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!sale) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'F2') {
        e.preventDefault()
        onNew()
      }
    }
    // Small delay so the Enter that completed the sale doesn't close this immediately.
    const id = setTimeout(() => window.addEventListener('keydown', onKey), 250)
    return () => {
      clearTimeout(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [sale, onNew])
  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onNew()} size="sm" hideClose>
      {sale ? (
        <div className="py-2 text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-9" />
          </div>
          <p className="text-lg font-extrabold">{t('pos.saleDone')}</p>
          <p className="text-sm text-muted">{t('pos.receiptNo', { number: sale.invoiceNumber ?? sale.number })}</p>
          {sale.changeDue > 0 ? (
            <div className="mx-auto mt-4 rounded-2xl bg-success-soft px-4 py-3 text-success">
              <p className="text-sm font-bold">{t('pos.changeDue')}</p>
              <p className="text-4xl font-black tabular">{fmtMoney(sale.changeDue)}</p>
            </div>
          ) : (
            <p className="mt-4 text-3xl font-black tabular">{fmtMoney(sale.total)}</p>
          )}
          {sale.creditAmount > 0 ? (
            <p className="mt-2 text-sm font-semibold text-warning">
              {t('pos.onCredit')}: {fmtMoney(sale.creditAmount)}
            </p>
          ) : null}
          <div className="mt-5 grid gap-2">
            <SaleDoneExtras sale={sale} />
            <Button size="lg" onClick={onNew} autoFocus>
              <ShoppingCart /> {t('pos.newSale')} <Kbd>Enter</Kbd>
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
