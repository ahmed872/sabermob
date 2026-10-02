import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { dialog, type BrowserWindow } from 'electron'
import { AppError } from '@shared/errors'
import type { PrintRequest } from '@shared/types/printing'
import type { PermissionKey } from '@shared/permissions'
import type { ApiRouter } from '../router'
import type { Actor } from '../../services/auth-service'
import type { AppContext } from '../../app/context'
import { buildDocument } from '../../printing/documents'
import type { Printer } from '../../printing/printer'

const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['receipt', 'invoice']), saleId: z.string().min(1).max(64), reprint: z.boolean().optional() }),
  z.object({ type: z.literal('repairTicket'), repairId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('shiftReport'), shiftId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('labels'), items: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(500) })).min(1).max(200) }),
  z.object({ type: z.literal('test'), paper: z.enum(['58mm', '80mm', 'A4']).optional() })
])

const PERMS: Record<PrintRequest['type'], PermissionKey[]> = {
  receipt: ['create_sale', 'view_sales'],
  invoice: ['create_sale', 'view_sales'],
  repairTicket: ['view_repairs'],
  shiftReport: ['manage_shifts', 'view_all_shifts'],
  labels: ['view_inventory'],
  test: ['manage_settings']
}

function check(actor: Actor, req: PrintRequest): void {
  if (!PERMS[req.type].some((p) => actor.permissions.has(p))) throw new AppError('FORBIDDEN', 'Not allowed', { permission: PERMS[req.type][0] })
  if ((req.type === 'receipt' || req.type === 'invoice') && req.reprint && !actor.permissions.has('reprint_receipt')) {
    throw new AppError('FORBIDDEN', 'Reprint not allowed', { permission: 'reprint_receipt' })
  }
}

function printerFor(app: AppContext, req: PrintRequest): string | null {
  const p = app.settings.get('printing')
  if (req.type === 'labels') return p.labelPrinter
  if (req.type === 'invoice') return p.a4Printer
  if (req.type === 'test' && req.paper === 'A4') return p.a4Printer
  return p.receiptPaper === 'A4' ? p.a4Printer : p.receiptPrinter
}

export function registerPrintingHandlers(r: ApiRouter, printer: Printer, getWindow: () => BrowserWindow | null): void {
  r.handle('printing.document', { input: z.object({ request: requestSchema }), permission: null }, async (input, { app, actor }) => {
    check(actor!, input.request)
    return buildDocument(app, input.request, actor!)
  })

  // Rendering & spooling can take seconds: build the document under the DB
  // gate, then print outside it so the POS stays responsive.
  r.handle('printing.print', { input: z.object({ request: requestSchema, printer: z.string().max(300).nullish(), copies: z.number().int().min(1).max(5).optional() }), permission: null, skipGate: true }, async (input, { app, actor }) => {
    check(actor!, input.request)
    const doc = await app.gate.run(() => buildDocument(app, input.request, actor!))
    await printer.print(doc, {
      printer: input.printer ?? printerFor(app, input.request),
      copies: input.copies ?? app.settings.get('printing').copies,
      anyWindow: getWindow()
    })
    return { ok: true as const }
  })

  r.handle('printing.pdf', { input: z.object({ request: requestSchema }), permission: null, skipGate: true }, async (input, { app, actor }) => {
    check(actor!, input.request)
    const doc = await app.gate.run(() => buildDocument(app, input.request, actor!))
    const pdf = await printer.pdf(doc)
    const name = doc.type === 'invoice' || doc.type === 'receipt' ? (doc.sale.invoiceNumber ?? doc.sale.number) : doc.type === 'repairTicket' ? doc.repair.number : doc.type
    // Automated tests save without the native dialog.
    if (process.env.CENTRAL_E2E_PDF_DIR) {
      const path = `${process.env.CENTRAL_E2E_PDF_DIR}/${name}.pdf`
      writeFileSync(path, pdf)
      return { path }
    }
    const win = getWindow()
    const res = win ? await dialog.showSaveDialog(win, { defaultPath: `${name}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }) : { canceled: true, filePath: undefined }
    if (res.canceled || !res.filePath) return { path: null }
    try {
      writeFileSync(res.filePath, pdf)
    } catch {
      throw new AppError('FILE_ERROR')
    }
    return { path: res.filePath }
  })

  // Called by the hidden print window; the random token is the credential.
  r.handle('printing.job', { input: z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) }), public: true, allowUnlicensed: true, skipGate: true }, (input) => {
    const doc = printer.job(input.token)
    if (!doc) throw new AppError('NOT_FOUND')
    return doc
  })

  r.handle('qr.resolve', { input: z.object({ text: z.string().max(200) }), permission: null }, (input, { app }) => app.qr.resolve(input.text))

  r.handle('settings.uploadLogo', { input: z.object({ dataUrl: z.string().max(4_000_000).nullable() }), permission: 'manage_settings' }, async (input, { app, actor }) => {
    const old = app.settings.get('company').logoPath
    const logoPath = input.dataUrl ? app.media.saveDataUrl('branding', input.dataUrl) : null
    await app.settings.update('company', { logoPath }, actor!.userId)
    if (old && old !== logoPath) app.media.remove(old)
    await app.audit.log({ userId: actor!.userId, action: 'settings.changed', entity: 'Setting', entityId: 'company', metadata: { changed: ['logo'] } })
    return { logoPath }
  })
}
