import { createHmac, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import { AppError } from '@shared/errors'
import type { QrResolution } from '@shared/types/printing'
import type { Db } from '../database/client'
import type { SecretsService } from '../security/secrets'
import type { SettingsService } from './settings-service'

export type QrKind = 'S' | 'R' | 'P' | 'C'

/**
 * Compact, signed QR payloads: `CP1:<kind>:<ref>:<mac>`.
 * The QR never contains personal or financial data — only a document
 * reference plus an HMAC (96 bits) proving it was issued by this store.
 * Everything keeps working when QR is disabled; only generation and
 * scanning are turned off.
 */
export class QrService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly secrets: SecretsService
  ) {}

  enabled(): boolean {
    return this.settings.get('qr').enabled
  }

  #mac(kind: QrKind, ref: string): string {
    return createHmac('sha256', this.secrets.key('qr-signing')).update(`${kind}:${ref}`).digest('base64url').slice(0, 16)
  }

  payload(kind: QrKind, ref: string): string {
    return `CP1:${kind}:${ref}:${this.#mac(kind, ref)}`
  }

  async dataUrl(kind: QrKind, ref: string): Promise<string> {
    return QRCode.toDataURL(this.payload(kind, ref), { errorCorrectionLevel: 'M', margin: 1, width: 220 })
  }

  /** Verifies a scanned payload and finds what it points to. */
  async resolve(text: string): Promise<QrResolution> {
    if (!this.enabled()) throw new AppError('QR_DISABLED')
    const m = /^CP1:([SRPC]):([^:]{1,64}):([A-Za-z0-9_-]{16})$/.exec(text.trim())
    if (!m) throw new AppError('QR_INVALID')
    const [, kind, ref, mac] = m as unknown as [string, QrKind, string, string]
    const expected = Buffer.from(this.#mac(kind, ref))
    if (!timingSafeEqual(expected, Buffer.from(mac))) throw new AppError('QR_INVALID')
    switch (kind) {
      case 'S': {
        const s = await this.db.sale.findFirst({ where: { OR: [{ number: ref }, { invoiceNumber: ref }] } })
        if (!s) throw new AppError('NOT_FOUND')
        return { kind: 'sale', id: s.id, label: s.invoiceNumber ?? s.number }
      }
      case 'R': {
        const r = await this.db.repair.findFirst({ where: { number: ref, deletedAt: null } })
        if (!r) throw new AppError('NOT_FOUND')
        return { kind: 'repair', id: r.id, label: r.number }
      }
      case 'P': {
        const v = await this.db.productVariant.findUnique({ where: { id: ref }, include: { product: true } })
        if (!v || v.deletedAt) throw new AppError('NOT_FOUND')
        return { kind: 'product', id: v.productId, variantId: v.id, label: v.product.name }
      }
      case 'C': {
        const c = await this.db.customer.findUnique({ where: { id: ref } })
        if (!c || c.deletedAt) throw new AppError('NOT_FOUND')
        return { kind: 'customer', id: c.id, label: c.name }
      }
    }
  }
}
