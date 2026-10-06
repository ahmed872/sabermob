import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { rawQuery, type Db } from '../database/client'
import type { AuditService } from './audit-service'
import type { Actor } from './auth-service'
import type { ResetSummary } from '@shared/types/backup'

/** Everything the shop does day to day: wiped by "start fresh". */
const BUSINESS_TABLES = [
  'OfferEvent', 'OfferProduct', 'Offer', 'ProductAffinity',
  'RepairPhoto', 'RepairPart', 'RepairStatusHistory', 'Repair',
  'RefundItem', 'Refund', 'Payment', 'SaleItem', 'Sale', 'HeldCart', 'QuotationItem', 'Quotation',
  'CashMovement', 'Shift',
  'PurchaseReturnItem', 'PurchaseReturn', 'PurchaseReceiptItem', 'PurchaseReceipt', 'PurchaseItem', 'PurchaseOrder',
  'SupplierPayment', 'SupplierLedger', 'Supplier',
  'LoyaltyTransaction', 'CustomerLedger', 'CustomerTag', 'Customer',
  'StockMovement', 'StockAdjustment', 'SerialItem',
  'SyncQueue', 'SyncConflict'
] as const

export interface ResetOptions {
  /** also remove categories, brands, phone models and the ready-made services */
  clearCatalog: boolean
}

/**
 * "Start fresh": removes the shop's business data (a trial period, a test run)
 * while keeping the store details, users and roles, settings, activation and —
 * unless asked — the catalog setup (categories, brands, models, services).
 * The caller takes a safety backup first; nothing here is reversible otherwise.
 */
export class ResetService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly mediaRoot: string
  ) {}

  async summary(): Promise<ResetSummary> {
    const n = async (sql: string) => (await rawQuery<{ n: number }>(this.db, sql))[0]?.n ?? 0
    return {
      sales: await n(`SELECT COUNT(*) AS n FROM "Sale"`),
      products: await n(`SELECT COUNT(*) AS n FROM "Product" WHERE deletedAt IS NULL AND type <> 'SERVICE'`),
      customers: await n(`SELECT COUNT(*) AS n FROM "Customer" WHERE deletedAt IS NULL`),
      suppliers: await n(`SELECT COUNT(*) AS n FROM "Supplier" WHERE deletedAt IS NULL`),
      repairs: await n(`SELECT COUNT(*) AS n FROM "Repair" WHERE deletedAt IS NULL`)
    }
  }

  async reset(opts: ResetOptions, actor: Actor): Promise<ResetSummary> {
    if (actor.roleKey !== 'OWNER') throw new AppError('FORBIDDEN', 'Only the owner can start fresh', { permission: 'manage_settings' })
    const before = await this.summary()
    await this.db.$transaction(async (tx) => {
      // Checked at commit: the rows kept must not point at anything removed.
      await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON')
      for (const table of BUSINESS_TABLES) await tx.$executeRawUnsafe(`DELETE FROM "${table}"`)
      const keepServices = opts.clearCatalog ? '' : ` WHERE "productId" NOT IN (SELECT id FROM "Product" WHERE type = 'SERVICE')`
      await tx.$executeRawUnsafe(`DELETE FROM "Barcode" WHERE "variantId" IN (SELECT id FROM "ProductVariant"${keepServices})`)
      await tx.$executeRawUnsafe(`DELETE FROM "ProductVariant"${keepServices}`)
      await tx.$executeRawUnsafe(`DELETE FROM "Product"${opts.clearCatalog ? '' : ` WHERE type <> 'SERVICE'`}`)
      // services that stay: forget sales history links
      await tx.$executeRawUnsafe(`UPDATE "Product" SET "supplierId" = NULL`)
      await tx.$executeRawUnsafe(`UPDATE "ProductVariant" SET "lastSoldAt" = NULL, "stockQty" = 0`)
      if (opts.clearCatalog) {
        await tx.$executeRawUnsafe(`DELETE FROM "DeviceModel"`)
        await tx.$executeRawUnsafe(`DELETE FROM "Brand"`)
        await tx.$executeRawUnsafe(`DELETE FROM "Category"`)
      }
      // numbering starts again at S-000001, RP-0001...; internal barcodes keep counting (kept items use them)
      await tx.$executeRawUnsafe(`DELETE FROM "Counter" WHERE key <> 'barcode'`)
      await this.audit.log({ userId: actor.userId, action: 'data.reset', metadata: { ...before, clearCatalog: opts.clearCatalog } }, tx)
    })
    this.#cleanMedia()
    return before
  }

  /** Photos and signatures of removed products and repairs. */
  #cleanMedia(): void {
    for (const dir of ['repairs', 'signatures', 'products']) {
      const full = join(this.mediaRoot, dir)
      let files: string[] = []
      try {
        files = readdirSync(full)
      } catch {
        continue
      }
      for (const f of files) {
        if (dir === 'products') continue // kept services may use them; unreferenced files are harmless
        try {
          rmSync(join(full, f), { recursive: true, force: true })
        } catch {
          /* a file in use stays; it is not referenced any more */
        }
      }
    }
  }
}
