import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { AppError } from '@shared/errors'
import type { PrintDocument, PrintRequest, PrintStore } from '@shared/types/printing'
import type { AppContext } from '../app/context'
import type { Actor } from '../services/auth-service'

function logoDataUrl(ctx: AppContext): string | null {
  const rel = ctx.settings.get('company').logoPath
  if (!rel || !ctx.settings.get('printing').showLogo) return null
  try {
    const full = ctx.media.resolve(rel)
    if (!existsSync(full)) return null
    const mime = extname(full) === '.png' ? 'image/png' : extname(full) === '.webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${readFileSync(full).toString('base64')}`
  } catch {
    return null
  }
}

export function printStore(ctx: AppContext): PrintStore {
  const c = ctx.settings.get('company')
  const inv = ctx.settings.get('invoices')
  return {
    name: c.storeName,
    phone: c.phone,
    phone2: c.phone2,
    address: c.address,
    taxNumber: c.taxNumber,
    commercialRegister: c.commercialRegister,
    logo: logoDataUrl(ctx),
    currency: c.currency,
    currencyDecimals: c.currencyDecimals,
    footer: inv.footerText,
    showCashier: inv.showCashier,
    showTaxNumber: inv.showTaxNumber,
    taxLabel: ctx.settings.get('taxes').taxLabel,
    language: ctx.settings.get('general').language
  }
}

/** Builds the full data for a printable document (shared by preview and print). */
export async function buildDocument(ctx: AppContext, req: PrintRequest, actor: Actor): Promise<PrintDocument> {
  const store = printStore(ctx)
  const qrOn = ctx.qr.enabled()
  const qrCfg = ctx.settings.get('qr')
  const paper = ctx.settings.get('printing').receiptPaper
  switch (req.type) {
    case 'receipt':
    case 'invoice': {
      const sale = await ctx.sales.get(req.saleId, actor)
      const wantQr = qrOn && (req.type === 'invoice' ? qrCfg.onInvoices : qrCfg.onReceipts || sale.qrEnabled)
      const qr = wantQr ? await ctx.qr.dataUrl('S', sale.invoiceNumber ?? sale.number) : null
      if (req.reprint) await ctx.sales.logReprint(sale.id, actor)
      return req.type === 'invoice'
        ? { type: 'invoice', paper: req.paper ?? ctx.settings.get('printing').invoicePaper, store, sale, qr, reprint: !!req.reprint }
        : { type: 'receipt', paper: req.paper ?? paper, store, sale, qr, reprint: !!req.reprint }
    }
    case 'repairTicket': {
      const repair = await ctx.repairs.get(req.repairId, actor)
      const qr = qrOn && qrCfg.onRepairs ? await ctx.qr.dataUrl('R', repair.number) : null
      return { type: 'repairTicket', paper, store, repair, qr, terms: ctx.settings.get('repairs').termsText }
    }
    case 'shiftReport':
      return { type: 'shiftReport', paper, store, shift: await ctx.shifts.summary(req.shiftId) }
    case 'labels': {
      const p = ctx.settings.get('printing')
      const labels: Extract<PrintDocument, { type: 'labels' }>['labels'] = []
      for (const it of req.items) {
        const v = await ctx.catalog.getVariantItem(it.variantId, false)
        const qr = qrOn && qrCfg.onLabels ? await ctx.qr.dataUrl('P', v.variantId) : null
        for (let i = 0; i < Math.min(it.qty, 500); i++) labels.push({ name: v.name, price: v.sellPrice, barcode: v.barcode ?? v.sku, qr })
      }
      if (labels.length === 0) throw new AppError('VALIDATION', 'Nothing to print')
      return { type: 'labels', paper: 'label', store, widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, labels }
    }
    case 'test':
      return { type: 'test', paper: req.paper ?? paper, store }
  }
}
