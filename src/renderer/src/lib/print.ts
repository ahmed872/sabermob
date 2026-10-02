import { toast } from 'sonner'
import type { PrintRequest } from '@shared/types/printing'
import i18n from '../i18n'
import { call } from './api'
import { toastError } from './query'

/** Sends a document to its configured printer. Never throws (sale is already saved). */
export async function printDocument(request: PrintRequest, opts: { quiet?: boolean } = {}): Promise<boolean> {
  const id = opts.quiet ? undefined : toast.loading(i18n.t('print.printing'))
  try {
    await call('printing.print', { request })
    if (id !== undefined) toast.success(i18n.t('print.printed'), { id })
    return true
  } catch (err) {
    if (id !== undefined) toast.dismiss(id)
    toastError(err)
    return false
  }
}

export async function saveDocumentPdf(request: PrintRequest): Promise<void> {
  try {
    const res = await call('printing.pdf', { request })
    if (res.path) toast.success(res.path)
  } catch (err) {
    toastError(err)
  }
}
