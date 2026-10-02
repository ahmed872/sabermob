import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, FileText, Printer } from 'lucide-react'
import type { SaleDto } from '@shared/types/sales'
import type { PrintRequest } from '@shared/types/printing'
import { printDocument } from '../../lib/print'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { PrintPreviewDialog } from '../../components/print-preview'

/**
 * Print actions after a sale. The normal path is one tap: the thermal
 * receipt (or a thermal-size invoice for invoice sales). A4 is optional.
 */
export function SaleDoneExtras({ sale }: { sale: SaleDto }) {
  const { t } = useTranslation()
  const auto = useApp((s) => s.settings?.pos.autoPrintReceipt)
  const [preview, setPreview] = useState<PrintRequest | null>(null)
  const printed = useRef<string | null>(null)
  const main: PrintRequest = { type: sale.kind === 'INVOICE' ? 'invoice' : 'receipt', saleId: sale.id }
  useEffect(() => {
    if (auto && printed.current !== sale.id) {
      printed.current = sale.id
      void printDocument(main)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, sale.id])
  return (
    <>
      <Button variant="outline" size="lg" onClick={() => void printDocument(main)}>
        <Printer /> {sale.kind === 'INVOICE' ? t('print.printInvoice') : t('print.printReceipt')}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => setPreview(main)}>
          <Eye /> {t('print.previewReceipt')}
        </Button>
        <Button variant="ghost" onClick={() => setPreview({ type: 'invoice', saleId: sale.id, paper: 'A4' })}>
          <FileText /> {t('print.a4')}
        </Button>
      </div>
      {preview ? <PrintPreviewDialog request={preview} onClose={() => setPreview(null)} /> : null}
    </>
  )
}
