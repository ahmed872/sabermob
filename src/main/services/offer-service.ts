import { AppError } from '@shared/errors'
import { ratioBp } from '@shared/money'
import { lineOfferDiscount, runOffersEngine, type CartLineCtx, type OfferDef, type OfferType, type ProductCandidate } from '@shared/domain/offers'
import type { Discount } from '@shared/domain/pricing'
import type { OfferSaveInput, SuggestInput } from '@shared/schemas/offers'
import type { OfferDto, OfferInsights, OfferStats, SuggestResult } from '@shared/types/offers'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import type { OfferResolver } from './sales-service'
import type { SettingsService } from './settings-service'

type OfferRow = Awaited<ReturnType<Db['offer']['findMany']>>[number] & { products: Array<{ role: string; productId: string | null; categoryId: string | null }> }

function toDef(o: OfferRow): OfferDef {
  const pick = (role: string) => ({
    productIds: o.products.filter((p) => p.role === role && p.productId).map((p) => p.productId!),
    categoryIds: o.products.filter((p) => p.role === role && p.categoryId).map((p) => p.categoryId!)
  })
  return {
    id: o.id,
    name: o.name,
    type: o.type as OfferType,
    isActive: o.isActive,
    autoApply: o.autoApply,
    priority: o.priority,
    discountBp: o.discountBp,
    discountAmount: o.discountAmount,
    bundlePrice: o.bundlePrice,
    buyQty: o.buyQty,
    getQty: o.getQty,
    minQty: o.minQty,
    minCartTotal: o.minCartTotal,
    customerType: o.customerType,
    daysOfWeek: o.daysOfWeek ? o.daysOfWeek.split(',').filter(Boolean).map(Number) : null,
    hourFrom: o.hourFrom,
    hourTo: o.hourTo,
    startsAt: o.startsAt?.toISOString() ?? null,
    endsAt: o.endsAt?.toISOString() ?? null,
    maxUses: o.maxUses,
    usageCount: o.usageCount,
    triggers: pick('TRIGGER'),
    targets: pick('TARGET')
  }
}

/**
 * Owner-configured offers + the local recommendation engine. Also acts as
 * the SalesService OfferResolver: offer discounts are recomputed and
 * validated at checkout, never trusted from the screen.
 */
export class OfferService implements OfferResolver {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly now: () => Date
  ) {}

  async #defs(client: Tx = this.db, onlyActive = true): Promise<OfferDef[]> {
    const rows = await client.offer.findMany({ where: { deletedAt: null, ...(onlyActive ? { isActive: true } : {}) }, include: { products: true }, orderBy: { priority: 'desc' } })
    return rows.map((r) => toDef(r as OfferRow))
  }

  async list(): Promise<OfferDto[]> {
    const rows = await this.db.offer.findMany({ where: { deletedAt: null }, include: { products: true }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] })
    const productIds = [...new Set(rows.flatMap((r) => r.products.map((p) => p.productId).filter((x): x is string => !!x)))]
    const categoryIds = [...new Set(rows.flatMap((r) => r.products.map((p) => p.categoryId).filter((x): x is string => !!x)))]
    const [products, categories] = await Promise.all([
      this.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
      this.db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    ])
    const name = (pid: string | null, cid: string | null) => (pid ? products.find((p) => p.id === pid)?.name : categories.find((c) => c.id === cid)?.name) ?? '—'
    return rows.map((r) => ({
      ...toDef(r as OfferRow),
      description: r.description,
      triggerNames: r.products.filter((p) => p.role === 'TRIGGER').map((p) => name(p.productId, p.categoryId)),
      targetNames: r.products.filter((p) => p.role === 'TARGET').map((p) => name(p.productId, p.categoryId))
    }))
  }

  async save(input: OfferSaveInput, actor: Actor): Promise<OfferDto> {
    const hasBenefit = input.discountBp != null || input.discountAmount != null || input.bundlePrice != null || input.type === 'BUY_X_GET_Y'
    if (!hasBenefit) throw new AppError('VALIDATION', 'Offer needs a discount or bundle price', { reason: 'offerNoBenefit', field: 'discount' })
    const targets = input.targets ?? { productIds: [], categoryIds: [] }
    if ((targets.productIds?.length ?? 0) + (targets.categoryIds?.length ?? 0) === 0) throw new AppError('VALIDATION', 'Choose the products the offer applies to', { reason: 'offerNoTargets', field: 'targets' })
    const data = {
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      isActive: input.isActive ?? true,
      autoApply: input.autoApply ?? false,
      priority: input.priority ?? 0,
      discountBp: input.discountBp ?? null,
      discountAmount: input.discountAmount ?? null,
      bundlePrice: input.bundlePrice ?? null,
      buyQty: input.buyQty ?? null,
      getQty: input.getQty ?? null,
      minQty: input.minQty ?? null,
      minCartTotal: input.minCartTotal ?? null,
      customerType: input.customerType ?? null,
      daysOfWeek: input.daysOfWeek?.length ? input.daysOfWeek.join(',') : null,
      hourFrom: input.hourFrom ?? null,
      hourTo: input.hourTo ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      maxUses: input.maxUses ?? null
    }
    const links = [
      ...(input.triggers?.productIds ?? []).map((productId) => ({ role: 'TRIGGER', productId })),
      ...(input.triggers?.categoryIds ?? []).map((categoryId) => ({ role: 'TRIGGER', categoryId })),
      ...(targets.productIds ?? []).map((productId) => ({ role: 'TARGET', productId })),
      ...(targets.categoryIds ?? []).map((categoryId) => ({ role: 'TARGET', categoryId }))
    ]
    const id = await this.db.$transaction(async (tx) => {
      const o = input.id ? await tx.offer.update({ where: { id: input.id }, data }) : await tx.offer.create({ data })
      await tx.offerProduct.deleteMany({ where: { offerId: o.id } })
      if (links.length) await tx.offerProduct.createMany({ data: links.map((l) => ({ ...l, offerId: o.id })) })
      await this.audit.log({ userId: actor.userId, action: input.id ? 'offer.updated' : 'offer.created', entity: 'Offer', entityId: o.id, metadata: { name: o.name, type: o.type } }, tx)
      return o.id
    })
    return (await this.list()).find((o) => o.id === id)!
  }

  async remove(id: string, actor: Actor): Promise<void> {
    await this.db.offer.update({ where: { id }, data: { deletedAt: this.now(), isActive: false } })
    await this.audit.log({ userId: actor.userId, action: 'offer.deleted', entity: 'Offer', entityId: id })
  }

  async #cartLines(tx: Tx, lines: Array<{ variantId: string; qty: number; unitPrice: number }>): Promise<CartLineCtx[]> {
    const variants = await tx.productVariant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: { select: { id: true, categoryId: true } } } })
    return lines.flatMap((l) => {
      const v = variants.find((x) => x.id === l.variantId)
      return v ? [{ productId: v.productId, variantId: v.id, categoryId: v.product.categoryId, qty: l.qty, unitPrice: l.unitPrice, unitCost: v.costPrice, minPrice: v.minPrice }] : []
    })
  }

  async suggest(input: SuggestInput): Promise<SuggestResult> {
    const cfg = this.settings.get('offers')
    if (!cfg.enabled || input.lines.length === 0) return { suggestions: [], autoApply: [] }
    const customer = input.customerId ? await this.db.customer.findUnique({ where: { id: input.customerId } }) : null
    const lines = await this.#cartLines(this.db, input.lines)
    const offers = await this.#defs()
    // Candidate products: offer targets + learned co-purchases of cart items.
    const targetProductIds = new Set(offers.flatMap((o) => o.targets.productIds))
    const targetCategoryIds = new Set(offers.flatMap((o) => o.targets.categoryIds))
    const affinity = new Map<string, number>()
    if (cfg.useAffinity) {
      const rows = await this.db.productAffinity.findMany({ where: { productA: { in: lines.map((l) => l.productId) } }, orderBy: { count: 'desc' }, take: 30 })
      for (const r of rows) affinity.set(r.productB, (affinity.get(r.productB) ?? 0) + r.count)
    }
    const deadCutoff = new Date(this.now().getTime() - this.settings.get('inventory').deadStockDays * 86_400_000)
    const variants = await this.db.productVariant.findMany({
      where: {
        deletedAt: null,
        isDefault: true,
        product: {
          deletedAt: null,
          isActive: true,
          OR: [{ id: { in: [...targetProductIds, ...affinity.keys()] } }, ...(targetCategoryIds.size ? [{ categoryId: { in: [...targetCategoryIds] } }] : [])]
        }
      },
      include: { product: { select: { id: true, name: true, categoryId: true, trackStock: true } } },
      take: 300
    })
    const candidates: ProductCandidate[] = variants.map((v) => ({
      productId: v.productId,
      variantId: v.id,
      name: v.name ? `${v.product.name} — ${v.name}` : v.product.name,
      categoryId: v.product.categoryId,
      price: v.sellPrice,
      cost: v.costPrice,
      minPrice: v.minPrice,
      stockQty: v.stockQty,
      trackStock: v.product.trackStock,
      isDead: v.stockQty > 0 && (v.lastSoldAt ?? v.createdAt) < deadCutoff
    }))
    return runOffersEngine(offers, candidates.filter((c) => c.price > 0), {
      lines,
      customerType: customer?.type ?? null,
      now: this.now(),
      dismissed: input.dismissed ?? [],
      minMarginBp: cfg.minMarginBp,
      clearanceMaxDiscountBp: cfg.clearanceMaxDiscountBp,
      maxSuggestions: cfg.maxSuggestions,
      affinity
    })
  }

  // ── OfferResolver (used by SalesService inside the sale transaction) ──
  async resolve(
    tx: Tx,
    offerId: string,
    ctx: { productId: string | null; unitPrice: number; qty: number; customerType: string | null; cartProductIds: string[]; cartTotal: number }
  ): Promise<Discount | null> {
    if (!this.settings.get('offers').enabled || !ctx.productId) return null
    const row = await tx.offer.findUnique({ where: { id: offerId }, include: { products: true } })
    if (!row || row.deletedAt) return null
    const o = toDef(row as OfferRow)
    const variant = await tx.productVariant.findFirst({ where: { productId: ctx.productId, deletedAt: null }, include: { product: { select: { categoryId: true } } } })
    if (!variant) return null
    const others = await tx.product.findMany({ where: { id: { in: ctx.cartProductIds.filter((p) => p !== ctx.productId) } }, select: { id: true, categoryId: true } })
    const line: CartLineCtx = { productId: ctx.productId, variantId: variant.id, categoryId: variant.product.categoryId, qty: ctx.qty, unitPrice: ctx.unitPrice, unitCost: variant.costPrice, minPrice: variant.minPrice }
    // Other cart lines only need identity for trigger checks; their value is
    // represented by the gross cart total for threshold offers.
    const otherLines: CartLineCtx[] = others.map((p) => ({ productId: p.id, variantId: '', categoryId: p.categoryId, qty: 1, unitPrice: 0, unitCost: 0, minPrice: null }))
    const filler: CartLineCtx = { productId: '__rest__', variantId: '', categoryId: null, qty: 1, unitPrice: Math.max(0, ctx.cartTotal - ctx.unitPrice * ctx.qty), unitCost: 0, minPrice: null }
    const cfg = this.settings.get('offers')
    return lineOfferDiscount(o, line, { now: this.now(), customerType: ctx.customerType, cartLines: [line, ...otherLines, filler], minMarginBp: cfg.minMarginBp, clearanceMaxDiscountBp: cfg.clearanceMaxDiscountBp })
  }

  async recordUse(tx: Tx, offerId: string, saleId: string, discountAmount: number, revenue: number, profit: number, userId: string): Promise<void> {
    await tx.offer.update({ where: { id: offerId }, data: { usageCount: { increment: 1 }, version: undefined } })
    await tx.offerEvent.create({ data: { offerId, source: 'OFFER', event: 'CONVERTED', saleId, userId, discountAmount, revenue, profit } })
  }

  async analytics(from?: string, to?: string): Promise<OfferStats[]> {
    const params: unknown[] = []
    let where = '1 = 1'
    if (from) {
      where += ' AND e.createdAt >= ?'
      params.push(new Date(from).toISOString())
    }
    if (to) {
      where += ' AND e.createdAt < ?'
      params.push(new Date(to).toISOString())
    }
    const rows = await rawQuery<{ offerId: string | null; source: string; name: string | null; type: string | null; shown: number; accepted: number; dismissed: number; converted: number; revenue: number; discountCost: number; profit: number }>(
      this.db,
      `SELECT e.offerId, e.source, o.name, o.type,
              SUM(CASE WHEN e.event = 'SHOWN' THEN 1 ELSE 0 END) AS shown,
              SUM(CASE WHEN e.event = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted,
              SUM(CASE WHEN e.event = 'DISMISSED' THEN 1 ELSE 0 END) AS dismissed,
              SUM(CASE WHEN e.event = 'CONVERTED' THEN 1 ELSE 0 END) AS converted,
              COALESCE(SUM(e.revenue), 0) AS revenue, COALESCE(SUM(e.discountAmount), 0) AS discountCost, COALESCE(SUM(e.profit), 0) AS profit
       FROM OfferEvent e LEFT JOIN Offer o ON o.id = e.offerId
       WHERE ${where}
       GROUP BY e.offerId, CASE WHEN e.offerId IS NULL THEN e.source ELSE '' END
       ORDER BY revenue DESC`,
      ...params
    )
    return rows.map((r) => ({
      offerId: r.offerId,
      name: r.name ?? r.source,
      type: r.type ?? r.source,
      shown: r.shown,
      accepted: r.accepted,
      dismissed: r.dismissed,
      converted: r.converted,
      conversionBp: ratioBp(r.accepted || r.converted, Math.max(r.shown, r.accepted || r.converted)),
      revenue: r.revenue,
      discountCost: r.discountCost,
      profit: r.profit
    }))
  }

  async insights(): Promise<OfferInsights> {
    const cutoff = new Date(this.now().getTime() - this.settings.get('inventory').deadStockDays * 86_400_000).toISOString()
    const [dead] = await rawQuery<{ n: number; value: number }>(
      this.db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(v.stockQty * v.costPrice), 0) AS value FROM ProductVariant v JOIN Product p ON p.id = v.productId
       WHERE v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.trackStock = 1 AND v.stockQty > 0 AND COALESCE(v.lastSoldAt, v.createdAt) < ?`,
      cutoff
    )
    const active = await this.db.offer.count({ where: { deletedAt: null, isActive: true } })
    return { deadStockCount: dead?.n ?? 0, deadStockValue: dead?.value ?? 0, activeOffers: active }
  }
}
