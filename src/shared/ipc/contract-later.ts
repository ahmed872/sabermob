/** Contract for printing/QR, offers, reports, search, backup and import/export. */
import type { PrintDocument, PrintRequest, QrResolution } from '../types/printing'
import type { LateContract } from './contract-late'

export interface PrintContract {
  'printing.document': { in: { request: PrintRequest }; out: PrintDocument }
  'printing.print': { in: { request: PrintRequest; printer?: string | null; copies?: number }; out: { ok: true } }
  'printing.pdf': { in: { request: PrintRequest }; out: { path: string | null } }
  'printing.job': { in: { token: string }; out: PrintDocument }
  'qr.resolve': { in: { text: string }; out: QrResolution }
  'settings.uploadLogo': { in: { dataUrl: string | null }; out: { logoPath: string | null } }
}

export interface LaterContract extends PrintContract, LateContract {}
