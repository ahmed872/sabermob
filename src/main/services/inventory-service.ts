import { AppError } from '@shared/errors'
import { divRound } from '@shared/money'
import type { StockMovementType } from '@shared/constants/enums'
import type { MovementQueryInput, StockAdjustInput } from '@shared/schemas/catalog'
import type { InventoryValuation, Paged, StockAlerts, StockMovementDto } from '@shared/types/catalog'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import { nextNumber } from './numbering'
import type { SettingsService } from './settings-service'

export interface StockChange {
  variantId: string
  type: StockMovementType
  /** signed quantity: + adds stock, − removes stock */
  qty: number
  unitCost?: number
  refType?: string
  refId?: string
  reason?: string | null
  userId?: string | null
  allowNegative?: boolean
}

/**
 * Applies one stock change inside the caller's transaction:
 * updates the cached quantity (and weighted average cost for purchases)
 * and writes the immutable StockMovement row. Inventory is never modified
 * any other way.
 */
export async function applyStockChange(tx: Tx, c: StockChange): Promise<{ balanceAfter: number; tracked: boolean }> {
  if (!Number.isSafeInteger(c.qty)) throw new AppError('VALIDATION', 'Invalid quantity', { reason: 'invalidQty' })
  const v = await tx.productVariant.findUnique({
    where: { id: c.variantId },
    select: { stockQty: true, costPrice: true, deletedAt: true, product: { select: { trackStock: true, name: true } } }
  })
  if (!v) throw new AppError('NOT_FOUND', 'Product not found', { variantId: c.variantId })
  if (!v.product.trackStock || c.qty === 0) return { balanceAfter: v.stockQty, tracked: false }

  const data: { stockQty: { increment: number }; costPrice?: number } = { stockQty: { increment: c.qty } }
  if (c.type === 'PURCHASE' && c.qty > 0 && c.unitCost !== undefined) {
    // Weighted average cost; negative/zero stock resets to the new cost.
    data.costPrice = v.stockQty <= 0 ? c.unitCost : divRound(v.stockQty * v.costPrice + c.qty * c.unitCost, v.stockQty + c.qty)
  }
  if (c.qty < 0 && !c.allowNegative) {
    const res = await tx.productVariant.updateMany({ where: { id: c.variantId, stockQty: { gte: -c.qty } }, data })
    if (res.count === 0) {
      throw new AppError('INSUFFICIENT_STOCK', 'Not enough stock', {
        variantId: c.variantId,
        name: v.product.name,
        available: v.stockQty,
        requested: -c.qty
      })
    }
  } else {
    await tx.productVariant.update({ where: { id: c.variantId }, data })
  }
  const balanceAfter = v.stockQty + c.qty
  await tx.stockMovement.create({
    data: {
      variantId: c.variantId,
      type: c.type,
      qty: c.qty,
      unitCost: c.unitCost ?? v.costPrice,
      balanceAfter,
      refType: c.refType ?? null,
      refId: c.refId ?? null,
      reason: c.reason ?? null,
      userId: c.userId ?? null
    }
  })
  return { balanceAfter, tracked: true }
}

export class InventoryService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService
  ) {}

  /** Manual stock adjustments (count, damaged, lost, correction, opening). */
  async adjust(input: StockAdjustInput, actor: Actor): Promise<{ id: string; number: string }> {
    return this.db.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'adjustment', 'ADJ-')
      const adj = await tx.stockAdjustment.create({
        data: { number, type: input.type, note: input.note ?? null, userId: actor.userId }
      })
      const summary: Array<{ variantId: string; delta: number; before: number }> = []
      for (const item of input.items) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true } })
        if (!v || v.deletedAt) throw new AppError('NOT_FOUND', 'Product not found', { variantId: item.variantId })
        if (!v.product.trackStock) continue
        let delta: number
        let movementType: StockMovementType
        switch (input.type) {
          case 'COUNT':
            if (item.qty < 0) throw new AppError('VALIDATION', 'Counted quantity cannot be negative', { reason: 'countNegative' })
            delta = item.qty - v.stockQty
            movementType = 'ADJUSTMENT'
            break
          case 'DAMAGED':
          case 'LOST':
            if (item.qty <= 0) throw new AppError('VALIDATION', 'Quantity must be positive', { reason: 'qtyPositive' })
            delta = -item.qty
            movementType = input.type
            break
          case 'OPENING':
            delta = item.qty
            movementType = 'OPENING'
            break
          default:
            delta = item.qty
            movementType = 'CORRECTION'
        }
        if (delta === 0) continue
        await applyStockChange(tx, {
          variantId: v.id,
          type: movementType,
          qty: delta,
          refType: 'StockAdjustment',
          refId: adj.id,
          reason: input.note ?? input.type,
          userId: actor.userId,
          // a physical count is the truth even if it implies negative history
          allowNegative: input.type === 'COUNT' || input.type === 'CORRECTION'
        })
        summary.push({ variantId: v.id, delta, before: v.stockQty })
      }
      await this.audit.log(
        { userId: actor.userId, action: 'stock.adjusted', entity: 'StockAdjustment', entityId: adj.id, metadata: { type: input.type, items: summary } },
        tx
      )
      return { id: adj.id, number }
    })
  }

  async movements(input: MovementQueryInput, canViewCost: boolean): Promise<Paged<StockMovementDto>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where = { ...(input.variantId ? { variantId: input.variantId } : {}), ...(input.type ? { type: input.type } : {}) }
    const [rows, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variant: { select: { name: true, product: { select: { name: true } } } } }
      }),
      this.db.stockMovement.count({ where })
    ])
    const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))]
    const users = userIds.length ? await this.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : []
    const names = new Map(users.map((u) => [u.id, u.fullName]))
    return {
      items: rows.map((r) => ({
        id: r.id,
        variantId: r.variantId,
        productName: [r.variant.product.name, r.variant.name].filter(Boolean).join(' — '),
        type: r.type,
        qty: r.qty,
        unitCost: canViewCost ? r.unitCost : null,
        balanceAfter: r.balanceAfter,
        refType: r.refType,
        refId: r.refId,
        reason: r.reason,
        userName: r.userId ? (names.get(r.userId) ?? null) : null,
        createdAt: r.createdAt.toISOString()
      })),
      total,
      page,
      pageSize
    }
  }

  deadStockCutoff(now = new Date()): string {
    const days = this.settings.get('inventory').deadStockDays
    return new Date(now.getTime() - days * 86_400_000).toISOString()
  }

  async alerts(): Promise<StockAlerts> {
    const cutoff = this.deadStockCutoff()
    const [row] = await rawQuery<StockAlerts>(
      this.db,
      `SELECT
         SUM(CASE WHEN v.stockQty > 0 AND v.stockQty <= v.minStock THEN 1 ELSE 0 END) AS low,
         SUM(CASE WHEN v.stockQty <= 0 THEN 1 ELSE 0 END) AS out,
         SUM(CASE WHEN v.maxStock IS NOT NULL AND v.stockQty > v.maxStock THEN 1 ELSE 0 END) AS over,
         SUM(CASE WHEN v.stockQty > 0 AND COALESCE(v.lastSoldAt, v.createdAt) < ? THEN 1 ELSE 0 END) AS dead
       FROM ProductVariant v JOIN Product p ON p.id = v.productId
       WHERE v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.isActive = 1 AND p.trackStock = 1`,
      cutoff
    )
    return { low: row?.low ?? 0, out: row?.out ?? 0, over: row?.over ?? 0, dead: row?.dead ?? 0 }
  }

  async valuation(): Promise<InventoryValuation> {
    const [row] = await rawQuery<InventoryValuation>(
      this.db,
      `SELECT COALESCE(SUM(CASE WHEN v.stockQty > 0 THEN v.stockQty ELSE 0 END), 0) AS totalUnits,
              COALESCE(SUM(CASE WHEN v.stockQty > 0 THEN v.stockQty * v.costPrice ELSE 0 END), 0) AS costValue,
              COALESCE(SUM(CASE WHEN v.stockQty > 0 THEN v.stockQty * v.sellPrice ELSE 0 END), 0) AS retailValue,
              COUNT(*) AS skuCount
       FROM ProductVariant v JOIN Product p ON p.id = v.productId
       WHERE v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.trackStock = 1`
    )
    return row ?? { totalUnits: 0, costValue: 0, retailValue: 0, skuCount: 0 }
  }

  /** Recomputes cached quantities from the movement ledger (integrity tool). */
  async verifyLedger(): Promise<Array<{ variantId: string; cached: number; ledger: number }>> {
    return rawQuery(
      this.db,
      `SELECT v.id AS variantId, v.stockQty AS cached, COALESCE(SUM(m.qty), 0) AS ledger
       FROM ProductVariant v JOIN Product p ON p.id = v.productId
       LEFT JOIN StockMovement m ON m.variantId = v.id
       WHERE p.trackStock = 1
       GROUP BY v.id HAVING cached <> ledger`
    )
  }
}
