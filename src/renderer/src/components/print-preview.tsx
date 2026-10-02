import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDown, Printer } from 'lucide-react'
import type { PrintRequest } from '@shared/types/printing'
import { useApi } from '../lib/query'
import { printDocument, saveDocumentPdf } from '../lib/print'
import { PrintDocumentView } from '../print/templates'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { PageLoader } from './ui/spinner'

/** On-screen preview using exactly the same template that gets printed. */
export function PrintPreviewDialog({ request, onClose }: { request: PrintRequest; onClose: () => void }) {
  const { t } = useTranslation()
  const doc = useApi('printing.document', { request }, { staleTime: 0 })
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size={doc.data?.paper === 'A4' ? 'xl' : 'sm'}
      title={t('print.page')}
      footer={
        <>
          <Button variant="outline" onClick={() => void saveDocumentPdf(request)}>
            <FileDown /> {t('print.pdf')}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true)
              if (await printDocument(request)) onClose()
              setBusy(false)
            }}
          >
            <Printer /> {t('print.print')}
          </Button>
        </>
      }
    >
      <div className="flex justify-center overflow-auto rounded-xl bg-slate-200 p-4">
        {doc.data ? (
          <div className="origin-top shadow-lg" style={doc.data.paper === 'A4' ? { zoom: 0.8 } : undefined}>
            <PrintDocumentView doc={doc.data} />
          </div>
        ) : (
          <PageLoader />
        )}
      </div>
    </Dialog>
  )
}
