import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Printer } from 'lucide-react'
import type { SaleDto } from '@shared/types/sales'
import { printDocument } from '../../lib/print'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { PrintPreviewDialog } from '../../components/print-preview'

/** Print actions after a sale; auto-prints when enabled in settings. */
export function SaleDoneExtras({ sale }: { sale: SaleDto }) {
  const { t } = useTranslation()
  const auto = useApp((s) => s.settings?.pos.autoPrintReceipt)
  const [preview, setPreview] = useState(false)
  const printed = useRef<string | null>(null)
  useEffect(() => {
    if (auto && printed.current !== sale.id) {
      printed.current = sale.id
      void printDocument({ type: sale.kind === 'INVOICE' ? 'invoice' : 'receipt', saleId: sale.id }, { quiet: false })
    }
  }, [auto, sale])
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={() => void printDocument({ type: 'receipt', saleId: sale.id })}>
          <Printer /> {t('print.printReceipt')}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setPreview(true)}>
          <FileText /> {t('print.printInvoice')}
        </Button>
      </div>
      {preview ? <PrintPreviewDialog request={{ type: 'invoice', saleId: sale.id }} onClose={() => setPreview(false)} /> : null}
    </>
  )
}
