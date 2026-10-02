import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import type { RepairDto } from '@shared/types/repairs'
import { Button } from '../../components/ui/button'
import { PrintPreviewDialog } from '../../components/print-preview'

export function RepairDetailExtras({ repair }: { repair: RepairDto }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Printer /> {t('print.printTicket')}
      </Button>
      {open ? <PrintPreviewDialog request={{ type: 'repairTicket', repairId: repair.id }} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
