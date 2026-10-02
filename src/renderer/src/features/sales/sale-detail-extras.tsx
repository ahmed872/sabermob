import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Printer } from 'lucide-react'
import type { SaleDto } from '@shared/types/sales'
import type { PrintRequest } from '@shared/types/printing'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { PrintPreviewDialog } from '../../components/print-preview'

/** Reprint receipt / A4 invoice (logged as a reprint in the audit trail). */
export function SaleDetailExtras({ sale }: { sale: SaleDto }) {
  const { t } = useTranslation()
  const can = useCan()
  const [req, setReq] = useState<PrintRequest | null>(null)
  if (!can('reprint_receipt')) return null
  return (
    <>
      <Button variant="outline" onClick={() => setReq({ type: 'receipt', saleId: sale.id, reprint: true })}>
        <Printer /> {t('pos.reprint')}
      </Button>
      <Button variant="outline" onClick={() => setReq({ type: 'invoice', saleId: sale.id, reprint: true })}>
        <FileText /> {t('print.printInvoice')}
      </Button>
      <Button variant="ghost" onClick={() => setReq({ type: 'invoice', saleId: sale.id, reprint: true, paper: 'A4' })}>
        {t('print.a4')}
      </Button>
      {req ? <PrintPreviewDialog request={req} onClose={() => setReq(null)} /> : null}
    </>
  )
}
