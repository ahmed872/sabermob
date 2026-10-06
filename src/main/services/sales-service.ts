import { AppError } from '@shared/errors'
import { divRound } from '@shared/money'
import { priceCart, settlePayments, type Discount, type PricingLineInput } from '@shared/domain/pricing'
import type { PermissionKey } from '@shared/permissions'
import type { CompleteSaleInput, HoldCartInput, RefundInput, SaleQueryInput, VoidSaleInput } from '@shared/schemas/sales'
import type { HeldCartDto, SaleDto, SaleListItem } from '@shared/types/sales'
import type { Paged } from '@shared/types/catalog'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Loggers } from '../core/logger'
import type { Actor, AuthService } from './auth-service'
import type { AuditService } from './audit-service'
import type { CustomerService } from './customer-service'
import { applyStockChange } from './inventory-service'
import { nextNumber } from './numbering'
import type { SettingsService } from './settings-service'
import type { ShiftService } from './shift-service'

/** Discounts produced by the offer engine are validated server-side. */
export interface OfferResolver {
  /**
   * Returns the discount an offer legitimately grants a line, or null when
   * the offer does not apply. Offer discounts are owner-configured so they
   * do not count against the cashier's personal discount limit.
   */
  resolve(
    tx: Tx,
    offerId: string,
    ctx: { productId: string | null; unitPrice: number; qty: number; customerType: string | null; cartProductIds: string[]; cartTotal: number }
  ): Promise<Discount | null>
  recordUse(tx: Tx, offerId: string, saleId: string, discountAmount: number, revenue: number, profit: number, userId: string): Promise<void>
}

interface PreparedLine {
  input: CompleteSaleInput['lines'][number]
  variantId: string | null
  productId: string | null
  productType: string
  name: string
  sku: string | null
  unitCost: number
  taxBp: number
  trackStock: boolean
  trackSerials: boolean
  warrantyDays: number | null
  minPrice: number | null
  offerDiscount: Discount | null
}

export class SalesService {
  offers: OfferResolver | null = null

  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly shifts: ShiftService,
    private readonly customers: CustomerService,
    private readonly log: Loggers
  ) {}

  /**
   * Completes a sale atomically: sale, items, payments, stock movements,
   * customer debt, loyalty, audit — all or nothing. Re-sending the same
   * idempotency key returns the already-saved sale (no double charge).
   */
  async complete(input: CompleteSaleInput, actor: Actor): Promise<SaleDto> {
    const existing = await this.db.sale.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) {
      this.log.app.info('Duplicate sale submission ignored (idempotent)', { saleId: existing.id })
      return this.get(existing.id, actor)
    }
    const pos = this.settings.get('pos')
    const taxes = this.settings.get('taxes')
    const loyalty = this.settings.get('loyalty')
    const company = this.settings.get('company')

    const saleId = await this.db.$transaction(async (tx) => {
      const shift = await this.shifts.currentShift(tx)
      if (pos.requireShift && !shift) throw new AppError('SHIFT_REQUIRED')

      const customer = input.customerId ? await tx.customer.findUnique({ where: { id: input.customerId } }) : null
      if (input.customerId && (!customer || customer.deletedAt)) throw new AppError('NOT_FOUND', 'Customer not found')

      // ── Load authoritative product data ──
      const variantIds = [...new Set(input.lines.map((l) => l.variantId).filter((x): x is string => !!x))]
      const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: true } })
      const byId = new Map(variants.map((v) => [v.id, v]))
      const required = new Set<PermissionKey>(['create_sale'])
      const prepared: PreparedLine[] = []
      const cartProductIds = variants.map((v) => v.productId)
      for (const line of input.lines) {
        if (!line.variantId) {
          const name = line.name?.trim()
          if (!name) throw new AppError('VALIDATION', 'Custom item needs a name', { reason: 'customName' })
          prepared.push({
            input: line,
            variantId: null,
            productId: null,
            productType: 'CUSTOM',
            name,
            sku: null,
            unitCost: 0,
            taxBp: taxes.enabled ? taxes.defaultTaxBp : 0,
            trackStock: false,
            trackSerials: false,
            warrantyDays: null,
            minPrice: null,
            offerDiscount: null
          })
          continue
        }
        const v = byId.get(line.variantId)
        if (!v || v.deletedAt || v.product.deletedAt || !v.product.isActive) throw new AppError('NOT_FOUND', 'Product not available', { variantId: line.variantId })
        const openPrice = v.sellPrice === 0
        const wholesale = customer?.type === 'WHOLESALE' && v.wholesalePrice !== null && line.unitPrice === v.wholesalePrice
        if (line.unitPrice !== v.sellPrice && !openPrice && !wholesale) required.add('edit_price')
        let offerDiscount: Discount | null = null
        if (line.offerId && this.offers) {
          offerDiscount = await this.offers.resolve(tx, line.offerId, {
            productId: v.productId,
            unitPrice: line.unitPrice,
            qty: line.qty,
            customerType: customer?.type ?? null,
            cartProductIds,
            cartTotal: input.lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
          })
        }
        prepared.push({
          input: line,
          variantId: v.id,
          productId: v.productId,
          productType: v.product.type,
          name: v.name ? `${v.product.name} — ${v.name}` : v.product.name,
          sku: v.sku,
          unitCost: v.costPrice,
          taxBp: taxes.enabled ? (v.product.taxBp ?? taxes.defaultTaxBp) : 0,
          trackStock: v.product.trackStock,
          trackSerials: v.product.trackSerials,
          warrantyDays: v.product.warrantyDays,
          minPrice: v.minPrice,
          offerDiscount
        })
      }

      // ── Price the cart (same engine as the screen) ──
      const pricingLines: PricingLineInput[] = prepared.map((p, i) => ({
        key: String(i),
        qty: p.input.qty,
        unitPrice: p.input.unitPrice,
        unitCost: p.unitCost,
        taxBp: p.taxBp,
        // A valid offer replaces any manual discount on that line.
        discount: p.offerDiscount ?? (p.input.discount as Discount | null | undefined) ?? null,
        minPrice: p.minPrice
      }))
      const priced = priceCart({ lines: pricingLines, cartDiscount: (input.cartDiscount as Discount | null) ?? null, pricesIncludeTax: taxes.pricesIncludeTax })

      // Manual discount share (offer discounts are owner-approved).
      const manualDiscount = priced.lines.reduce((a, l, i) => a + (prepared[i]!.offerDiscount ? l.cartDiscount : l.discount), 0)
      const grossForManual = priced.lines.reduce((a, l) => a + l.gross, 0)
      const maxLineBp = Math.max(0, ...priced.lines.map((l, i) => (prepared[i]!.offerDiscount ? 0 : l.discountBp)))
      const manualBp = Math.max(maxLineBp, grossForManual ? divRound(manualDiscount * 10_000, grossForManual) : 0)
      if (manualDiscount > 0) required.add('apply_discount')
      if (priced.lines.some((l) => l.belowMinPrice)) required.add('sell_below_min_price')

      // ── Payments ──
      let redeemValue = 0
      if (input.redeemPoints && input.redeemPoints > 0) {
        if (!loyalty.enabled || !customer) throw new AppError('VALIDATION', 'Loyalty points need a customer', { reason: 'pointsNeedCustomer' })
        if (input.redeemPoints > customer.loyaltyPoints) throw new AppError('VALIDATION', 'Not enough points', { reason: 'notEnoughPoints' })
        if (input.redeemPoints < loyalty.minRedeemPoints) throw new AppError('VALIDATION', 'Below minimum points to redeem', { reason: 'pointsBelowMin', min: loyalty.minRedeemPoints })
        redeemValue = Math.min(input.redeemPoints * loyalty.pointValue, priced.total)
      }
      const enabled = new Set(['CASH', ...pos.enabledPaymentMethods])
      for (const p of input.payments) if (!enabled.has(p.method)) throw new AppError('VALIDATION', 'Payment method disabled', { reason: 'paymentMethodDisabled', method: p.method })
      const dueAfterPoints = priced.total - redeemValue
      const settled = settlePayments(dueAfterPoints, input.payments)
      const nonCash = input.payments.filter((p) => p.method !== 'CASH').reduce((a, p) => a + p.amount, 0)
      if (nonCash > dueAfterPoints) throw new AppError('PAYMENT_MISMATCH', 'Card/wallet payment exceeds the total')
      const credit = settled.remaining
      if (credit > 0) {
        if (!customer) throw new AppError('CREDIT_REQUIRES_CUSTOMER')
        if (!pos.allowCreditSales) throw new AppError('PAYMENT_MISMATCH', 'Credit sales are disabled')
        required.add('sell_on_credit')
        if (customer.creditLimit !== null) {
          const balance = await this.customers.balance(customer.id, tx)
          if (balance + credit > customer.creditLimit) throw new AppError('CREDIT_LIMIT', 'Credit limit exceeded', { limit: customer.creditLimit, balance })
        }
      }

      // ── Authorization (single manager approval covers everything) ──
      const approvedById = this.auth.authorizeAll(actor, [...required], input.overrideToken, { discountBp: manualDiscount > 0 ? manualBp : 0 })

      // ── Persist ──
      const number = await nextNumber(tx, 'sale', 'S-')
      const invoiceNumber = input.kind === 'INVOICE' ? await nextNumber(tx, 'invoice', 'INV-') : null
      const qr = this.settings.get('qr')
      const sale = await tx.sale.create({
        data: {
          number,
          invoiceNumber,
          kind: input.kind ?? 'QUICK',
          customerId: customer?.id ?? null,
          userId: actor.userId,
          shiftId: shift?.id ?? null,
          pricesIncludeTax: taxes.pricesIncludeTax,
          subtotal: priced.subtotal,
          discountTotal: priced.discountTotal,
          taxTotal: priced.taxTotal,
          total: priced.total,
          paidTotal: settled.paid + redeemValue,
          changeDue: settled.change,
          creditAmount: credit,
          costTotal: priced.costTotal,
          currency: company.currency,
          note: input.note ?? null,
          qrEnabled: qr.enabled && (input.kind === 'INVOICE' ? qr.onInvoices : qr.onReceipts),
          idempotencyKey: input.idempotencyKey,
          approvedById
        }
      })

      for (const [i, p] of prepared.entries()) {
        const l = priced.lines[i]!
        let serial: string | null = null
        // Units without a registered IMEI (stock entered by count, not by IMEI) can be sold
        // without one, or with an IMEI typed at the counter that is recorded now.
        let unregistered = 0
        if (p.trackSerials && p.variantId) {
          serial = p.input.serial?.trim() || null
          const v = await tx.productVariant.findUniqueOrThrow({ where: { id: p.variantId }, select: { stockQty: true } })
          unregistered = v.stockQty - (await tx.serialItem.count({ where: { variantId: p.variantId, status: 'IN_STOCK' } }))
          if (serial && p.input.qty !== 1) throw new AppError('VALIDATION', 'One line per IMEI', { reason: 'oneLinePerImei', name: p.name })
          if (!serial && unregistered < p.input.qty) throw new AppError('SERIAL_REQUIRED', 'Select the IMEI/serial of the unit sold', { name: p.name })
        }
        const item = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            variantId: p.variantId,
            productType: p.productType,
            name: p.name,
            sku: p.sku,
            serial,
            qty: l.qty,
            unitPrice: l.unitPrice,
            unitCost: p.unitCost,
            discount: l.discount,
            taxBp: p.taxBp,
            tax: l.tax,
            total: l.total,
            offerId: p.offerDiscount ? (p.input.offerId ?? null) : null,
            warrantyDays: p.warrantyDays
          }
        })
        if (serial && p.variantId) {
          const s = await tx.serialItem.updateMany({ where: { serial, variantId: p.variantId, status: 'IN_STOCK' }, data: { status: 'SOLD', saleItemId: item.id } })
          if (s.count === 0) {
            const known = await tx.serialItem.findUnique({ where: { serial } })
            if (known || unregistered < 1) throw new AppError('INSUFFICIENT_STOCK', 'IMEI not in stock', { name: `${p.name} (${serial})`, available: 0 })
            await tx.serialItem.create({ data: { variantId: p.variantId, serial, status: 'SOLD', costPrice: p.unitCost, saleItemId: item.id } })
          }
        }
        if (p.variantId && p.trackStock) {
          await applyStockChange(tx, {
            variantId: p.variantId,
            type: 'SALE',
            qty: -l.qty,
            unitCost: p.unitCost,
            refType: 'Sale',
            refId: sale.id,
            reason: number,
            userId: actor.userId,
            allowNegative: pos.allowNegativeStock
          })
        }
        if (p.variantId) await tx.productVariant.update({ where: { id: p.variantId }, data: { lastSoldAt: new Date(), version: undefined } })
        if (p.offerDiscount && p.input.offerId && this.offers) {
          await this.offers.recordUse(tx, p.input.offerId, sale.id, l.lineDiscount, l.total - l.tax, l.total - l.tax - l.cost, actor.userId)
        }
      }

      // Payments: one row per method with the money actually kept.
      let changeLeft = settled.change
      for (const p of input.payments) {
        let amount = p.amount
        if (p.method === 'CASH' && changeLeft > 0) {
          const take = Math.min(changeLeft, amount)
          amount -= take
          changeLeft -= take
        }
        if (amount <= 0) continue
        await tx.payment.create({
          data: { kind: 'SALE', method: p.method, amount, reference: p.reference ?? null, saleId: sale.id, customerId: customer?.id ?? null, shiftId: shift?.id ?? null, userId: actor.userId }
        })
      }
      if (redeemValue > 0 && customer) {
        await tx.payment.create({ data: { kind: 'SALE', method: 'POINTS', amount: redeemValue, saleId: sale.id, customerId: customer.id, shiftId: shift?.id ?? null, userId: actor.userId } })
        await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { decrement: input.redeemPoints! } } })
        await tx.loyaltyTransaction.create({ data: { customerId: customer.id, points: -input.redeemPoints!, reason: 'REDEEM', refId: sale.id } })
      }
      if (credit > 0 && customer) {
        await tx.customerLedger.create({ data: { customerId: customer.id, type: 'SALE_CREDIT', amount: credit, refType: 'Sale', refId: sale.id, note: number, userId: actor.userId } })
      }
      if (loyalty.enabled && customer) {
        const earned = Math.floor((priced.total - redeemValue) / loyalty.amountPerPoint)
        if (earned > 0) {
          const updated = await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { increment: earned } } })
          await tx.loyaltyTransaction.create({ data: { customerId: customer.id, points: earned, reason: 'EARN', refId: sale.id } })
          if (customer.type === 'REGULAR' && loyalty.vipThresholdPoints > 0 && updated.loyaltyPoints >= loyalty.vipThresholdPoints) {
            await tx.customer.update({ where: { id: customer.id }, data: { type: 'VIP' } })
          }
        }
      }

      await this.#recordAffinity(tx, prepared.map((p) => p.productId).filter((x): x is string => !!x))
      for (const ev of input.offerEvents ?? []) {
        await tx.offerEvent.create({ data: { offerId: ev.offerId ?? null, source: ev.source, event: ev.event, productId: ev.productId ?? null, saleId: sale.id, userId: actor.userId } })
      }

      await this.audit.log(
        {
          userId: actor.userId,
          action: 'sale.completed',
          entity: 'Sale',
          entityId: sale.id,
          metadata: {
            number,
            total: priced.total,
            discount: priced.discountTotal,
            credit,
            approvedBy: approvedById,
            customItems: prepared.filter((p) => !p.variantId).length,
            priceEdits: required.has('edit_price')
          }
        },
        tx
      )
      return sale.id
    })
    return this.get(saleId, actor)
  }

  /** Counts products bought together (learned cross-sell relationships). */
  async #recordAffinity(tx: Tx, productIds: string[]): Promise<void> {
    const unique = [...new Set(productIds)].slice(0, 20)
    for (let i = 0; i < unique.length; i++) {
      for (let j = 0; j < unique.length; j++) {
        if (i === j) continue
        await tx.productAffinity.upsert({
          where: { productA_productB: { productA: unique[i]!, productB: unique[j]! } },
          create: { productA: unique[i]!, productB: unique[j]!, count: 1 },
          update: { count: { increment: 1 } }
        })
      }
    }
  }

  async refund(input: RefundInput, actor: Actor): Promise<SaleDto> {
    const needsApproval = this.settings.get('security').requireApprovalForRefund
    await this.db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { items: true, refunds: { include: { items: true } } } })
      if (!sale) throw new AppError('NOT_FOUND')
      if (sale.status === 'VOIDED' || sale.status === 'REFUNDED') throw new AppError('INVALID_STATE', 'Sale already fully returned', { reason: 'saleFullyReturned' })
      const approvedById = this.auth.authorize(actor, needsApproval ? 'refund_sale' : 'create_sale', input.overrideToken)
      if (input.method === 'CREDIT' && !sale.customerId) throw new AppError('CREDIT_REQUIRES_CUSTOMER')
      const shift = await this.shifts.currentShift(tx)
      if (input.method !== 'CREDIT' && this.settings.get('pos').requireShift && !shift) throw new AppError('SHIFT_REQUIRED')
      await this.#refundItems(tx, sale, input.items, input.method, input.reason ?? null, actor, approvedById, shift?.id ?? null)
    })
    return this.get(input.saleId, actor)
  }

  async #refundItems(
    tx: Tx,
    sale: { id: string; number: string; customerId: string | null; items: Array<{ id: string; qty: number; total: number; tax: number; unitCost: number; refundedQty: number; variantId: string | null; serial: string | null; name: string }>; refunds: Array<{ items: Array<{ saleItemId: string; amount: number }> }> },
    items: RefundInput['items'],
    method: RefundInput['method'] | 'ORIGINAL',
    reason: string | null,
    actor: Actor,
    approvedById: string | null,
    shiftId: string | null
  ): Promise<number> {
    const refundedAmountByItem = new Map<string, number>()
    for (const r of sale.refunds) for (const ri of r.items) refundedAmountByItem.set(ri.saleItemId, (refundedAmountByItem.get(ri.saleItemId) ?? 0) + ri.amount)
    const number = await nextNumber(tx, 'refund', 'R-')
    const lines: Array<{ saleItemId: string; qty: number; amount: number; restock: boolean }> = []
    for (const req of items) {
      const item = sale.items.find((i) => i.id === req.saleItemId)
      if (!item) throw new AppError('NOT_FOUND', 'Sale item not found')
      const remainingQty = item.qty - item.refundedQty
      if (req.qty > remainingQty) throw new AppError('VALIDATION', 'Return quantity exceeds what was sold', { reason: 'returnTooMany', name: item.name, max: remainingQty })
      // The last returned unit takes the rounding remainder so refunds never exceed the line total.
      const already = refundedAmountByItem.get(item.id) ?? 0
      const amount = req.qty === remainingQty ? item.total - already : divRound(item.total * req.qty, item.qty)
      lines.push({ saleItemId: item.id, qty: req.qty, amount, restock: req.restock ?? true })
      await tx.saleItem.update({ where: { id: item.id }, data: { refundedQty: { increment: req.qty } } })
      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: { select: { trackStock: true } } } })
        if (variant?.product.trackStock && (req.restock ?? true)) {
          await applyStockChange(tx, { variantId: item.variantId, type: 'SALE_RETURN', qty: req.qty, unitCost: item.unitCost, refType: 'Sale', refId: sale.id, reason: `${number} ← ${sale.number}`, userId: actor.userId })
        }
        if (item.serial) {
          await tx.serialItem.updateMany({ where: { serial: item.serial }, data: { status: (req.restock ?? true) ? 'IN_STOCK' : 'DEFECTIVE', saleItemId: null } })
        }
      }
    }
    const total = lines.reduce((a, l) => a + l.amount, 0)
    const refundMethod = method === 'ORIGINAL' ? 'ORIGINAL' : method
    const refund = await tx.refund.create({
      data: { number, saleId: sale.id, reason, total, method: refundMethod, userId: actor.userId, approvedById, shiftId, items: { create: lines } }
    })

    // Money back.
    if (method === 'CREDIT') {
      await tx.customerLedger.create({ data: { customerId: sale.customerId!, type: 'REFUND', amount: -total, refType: 'Refund', refId: refund.id, note: number, userId: actor.userId } })
    } else if (method === 'ORIGINAL') {
      // Void: reverse each original payment and any debt created by the sale.
      const payments = await tx.payment.findMany({ where: { saleId: sale.id, kind: 'SALE' } })
      for (const p of payments) {
        if (p.method === 'POINTS' && p.customerId) {
          const points = await tx.loyaltyTransaction.findFirst({ where: { refId: sale.id, reason: 'REDEEM' } })
          if (points) {
            await tx.customer.update({ where: { id: p.customerId }, data: { loyaltyPoints: { increment: -points.points } } })
            await tx.loyaltyTransaction.create({ data: { customerId: p.customerId, points: -points.points, reason: 'REVERSAL', refId: sale.id } })
          }
          continue
        }
        await tx.payment.create({ data: { kind: 'REFUND', method: p.method, amount: -p.amount, saleId: sale.id, refundId: refund.id, customerId: p.customerId, shiftId, userId: actor.userId } })
      }
      const debt = await tx.customerLedger.findFirst({ where: { refType: 'Sale', refId: sale.id, type: 'SALE_CREDIT' } })
      if (debt) await tx.customerLedger.create({ data: { customerId: debt.customerId, type: 'REFUND', amount: -debt.amount, refType: 'Refund', refId: refund.id, note: number, userId: actor.userId } })
    } else {
      await tx.payment.create({ data: { kind: 'REFUND', method, amount: -total, saleId: sale.id, refundId: refund.id, customerId: sale.customerId, shiftId, userId: actor.userId } })
    }

    // Reverse loyalty points earned on the returned value.
    const loyalty = this.settings.get('loyalty')
    if (sale.customerId && loyalty.enabled) {
      const earned = await tx.loyaltyTransaction.findFirst({ where: { refId: sale.id, reason: 'EARN' } })
      if (earned) {
        const s = await tx.sale.findUniqueOrThrow({ where: { id: sale.id } })
        const reverse = Math.min(earned.points, Math.floor((total * earned.points) / Math.max(s.total, 1)))
        if (reverse > 0) {
          const c = await tx.customer.findUniqueOrThrow({ where: { id: sale.customerId } })
          const take = Math.min(reverse, c.loyaltyPoints)
          await tx.customer.update({ where: { id: sale.customerId }, data: { loyaltyPoints: { decrement: take } } })
          await tx.loyaltyTransaction.create({ data: { customerId: sale.customerId, points: -take, reason: 'REVERSAL', refId: refund.id } })
        }
      }
    }

    const updated = await tx.sale.update({ where: { id: sale.id }, data: { refundedTotal: { increment: total } }, include: { items: true } })
    const allReturned = updated.items.every((i) => i.refundedQty >= i.qty)
    await tx.sale.update({ where: { id: sale.id }, data: { status: allReturned ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } })
    await this.audit.log(
      { userId: actor.userId, action: 'sale.refunded', entity: 'Sale', entityId: sale.id, metadata: { refund: number, total, method: refundMethod, approvedBy: approvedById, reason } },
      tx
    )
    return total
  }

  /** Cancels a whole sale: every item back to stock, every payment reversed. */
  async void(input: VoidSaleInput, actor: Actor): Promise<SaleDto> {
    await this.db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { items: true, refunds: { include: { items: true } } } })
      if (!sale) throw new AppError('NOT_FOUND')
      if (sale.status !== 'COMPLETED') throw new AppError('INVALID_STATE', 'Only sales without returns can be voided', { reason: 'voidOnlyCompleted' })
      const approvedById = this.auth.authorize(actor, 'cancel_sale', input.overrideToken)
      const shift = await this.shifts.currentShift(tx)
      await this.#refundItems(
        tx,
        sale,
        sale.items.map((i) => ({ saleItemId: i.id, qty: i.qty, restock: true })),
        'ORIGINAL',
        input.reason,
        actor,
        approvedById,
        shift?.id ?? null
      )
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'VOIDED', voidedAt: new Date(), voidedById: actor.userId, voidReason: input.reason } })
      await this.audit.log({ userId: actor.userId, action: 'sale.voided', entity: 'Sale', entityId: sale.id, metadata: { number: sale.number, reason: input.reason, approvedBy: approvedById } }, tx)
    })
    return this.get(input.saleId, actor)
  }

  async get(id: string, actor: Actor | null, tx?: Tx): Promise<SaleDto> {
    const client = tx ?? this.db
    const s = await client.sale.findUnique({
      where: { id },
      include: {
        items: { orderBy: { id: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        refunds: { include: { items: true }, orderBy: { createdAt: 'asc' } },
        user: { select: { fullName: true } },
        customer: true
      }
    })
    if (!s) throw new AppError('NOT_FOUND', 'Sale not found')
    const canProfit = !!actor?.permissions.has('view_profit')
    const canCost = !!actor?.permissions.has('view_cost')
    const userIds = [s.approvedById, ...s.refunds.map((r) => r.userId)].filter((x): x is string => !!x)
    const users = await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    const name = (uid: string | null) => (uid ? (users.find((u) => u.id === uid)?.fullName ?? null) : null)
    const earned = s.customerId ? await client.loyaltyTransaction.findFirst({ where: { refId: s.id, reason: 'EARN' } }) : null
    const refundCost = s.items.reduce((a, i) => a + i.unitCost * i.refundedQty, 0)
    const refundTax = s.items.reduce((a, i) => a + (i.qty ? divRound(i.tax * i.refundedQty, i.qty) : 0), 0)
    return {
      id: s.id,
      number: s.number,
      invoiceNumber: s.invoiceNumber,
      kind: s.kind as 'QUICK' | 'INVOICE',
      status: s.status,
      customer: s.customer ? { id: s.customer.id, name: s.customer.name, phone: s.customer.phone, balance: await this.customers.balance(s.customer.id, client) } : null,
      cashierName: s.user.fullName,
      approvedByName: name(s.approvedById),
      pricesIncludeTax: s.pricesIncludeTax,
      subtotal: s.subtotal,
      discountTotal: s.discountTotal,
      taxTotal: s.taxTotal,
      total: s.total,
      paidTotal: s.paidTotal,
      changeDue: s.changeDue,
      creditAmount: s.creditAmount,
      refundedTotal: s.refundedTotal,
      profit: canProfit ? s.total - s.taxTotal - s.costTotal - (s.refundedTotal - refundTax - refundCost) : null,
      currency: s.currency,
      note: s.note,
      qrEnabled: s.qrEnabled && this.settings.get('qr').enabled,
      createdAt: s.createdAt.toISOString(),
      voidReason: s.voidReason,
      loyaltyEarned: earned?.points ?? 0,
      items: s.items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        productType: i.productType,
        name: i.name,
        sku: i.sku,
        serial: i.serial,
        qty: i.qty,
        unitPrice: i.unitPrice,
        unitCost: canCost ? i.unitCost : null,
        discount: i.discount,
        taxBp: i.taxBp,
        tax: i.tax,
        total: i.total,
        refundedQty: i.refundedQty,
        warrantyDays: i.warrantyDays
      })),
      payments: s.payments.map((p) => ({ id: p.id, method: p.method, amount: p.amount, kind: p.kind, reference: p.reference, createdAt: p.createdAt.toISOString() })),
      refunds: s.refunds.map((r) => ({
        id: r.id,
        number: r.number,
        total: r.total,
        method: r.method,
        reason: r.reason,
        userName: name(r.userId),
        createdAt: r.createdAt.toISOString(),
        items: r.items.map((ri) => ({ saleItemId: ri.saleItemId, qty: ri.qty, amount: ri.amount, restock: ri.restock }))
      }))
    }
  }

  async findByNumber(number: string, actor: Actor): Promise<SaleDto | null> {
    const s = await this.db.sale.findFirst({ where: { OR: [{ number }, { invoiceNumber: number }] } })
    return s ? this.get(s.id, actor) : null
  }

  async list(input: SaleQueryInput, actor: Actor): Promise<Paged<SaleListItem>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where: string[] = ['1 = 1']
    const params: unknown[] = []
    if (input.q) {
      where.push(`(s.number LIKE ? OR s.invoiceNumber LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`)
      const like = `%${input.q.trim()}%`
      params.push(like, like, like, like)
    }
    if (input.from) {
      where.push('s.createdAt >= ?')
      params.push(new Date(input.from).toISOString())
    }
    if (input.to) {
      where.push('s.createdAt < ?')
      params.push(new Date(input.to).toISOString())
    }
    for (const [col, val] of [
      ['s.userId', input.userId],
      ['s.customerId', input.customerId],
      ['s.shiftId', input.shiftId],
      ['s.status', input.status],
      ['s.kind', input.kind]
    ] as const) {
      if (val) {
        where.push(`${col} = ?`)
        params.push(val)
      }
    }
    // Cashiers without view_sales only see their own sales.
    if (!actor.permissions.has('view_sales')) {
      where.push('s.userId = ?')
      params.push(actor.userId)
    }
    const sql = `FROM Sale s LEFT JOIN Customer c ON c.id = s.customerId JOIN User u ON u.id = s.userId WHERE ${where.join(' AND ')}`
    const [count] = await rawQuery<{ n: number }>(this.db, `SELECT COUNT(*) AS n ${sql}`, ...params)
    const rows = await rawQuery<{
      id: string
      number: string
      invoiceNumber: string | null
      kind: string
      status: string
      customerName: string | null
      cashierName: string
      itemCount: number
      total: number
      paidTotal: number
      creditAmount: number
      refundedTotal: number
      taxTotal: number
      costTotal: number
      createdAt: string | Date
    }>(
      this.db,
      `SELECT s.id, s.number, s.invoiceNumber, s.kind, s.status, c.name AS customerName, u.fullName AS cashierName,
              (SELECT COALESCE(SUM(qty), 0) FROM SaleItem i WHERE i.saleId = s.id) AS itemCount,
              s.total, s.paidTotal, s.creditAmount, s.refundedTotal, s.taxTotal, s.costTotal, s.createdAt
       ${sql} ORDER BY s.createdAt DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize
    )
    const canProfit = actor.permissions.has('view_profit')
    return {
      items: rows.map((r) => ({
        id: r.id,
        number: r.number,
        invoiceNumber: r.invoiceNumber,
        kind: r.kind,
        status: r.status,
        customerName: r.customerName,
        cashierName: r.cashierName,
        itemCount: r.itemCount,
        total: r.total,
        paidTotal: r.paidTotal,
        creditAmount: r.creditAmount,
        refundedTotal: r.refundedTotal,
        profit: canProfit && r.status !== 'VOIDED' ? r.total - r.taxTotal - r.costTotal : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt
      })),
      total: count?.n ?? 0,
      page,
      pageSize
    }
  }

  // ───────────── Held (suspended) carts ─────────────

  async hold(input: HoldCartInput, actor: Actor): Promise<HeldCartDto> {
    const data = { label: input.label || 'Cart', customerId: input.customerId ?? null, total: input.total, payload: input.payload, userId: actor.userId }
    const row = input.id ? await this.db.heldCart.update({ where: { id: input.id }, data }) : await this.db.heldCart.create({ data })
    return { ...row, createdAt: row.createdAt.toISOString(), userName: actor.fullName }
  }

  async listHeld(): Promise<HeldCartDto[]> {
    const rows = await this.db.heldCart.findMany({ orderBy: { createdAt: 'desc' } })
    const users = await this.db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, fullName: true } })
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), userName: users.find((u) => u.id === r.userId)?.fullName ?? null }))
  }

  async takeHeld(id: string): Promise<HeldCartDto> {
    const row = await this.db.heldCart.findUnique({ where: { id } })
    if (!row) throw new AppError('NOT_FOUND')
    await this.db.heldCart.delete({ where: { id } })
    return { ...row, createdAt: row.createdAt.toISOString(), userName: null }
  }

  async deleteHeld(id: string): Promise<void> {
    await this.db.heldCart.deleteMany({ where: { id } })
  }

  async logReprint(saleId: string, actor: Actor): Promise<void> {
    await this.audit.log({ userId: actor.userId, action: 'sale.reprinted', entity: 'Sale', entityId: saleId })
  }

  /**
   * Startup integrity: sales are single transactions, so a crash can never
   * leave half a sale. We still verify the stock cache against the movement
   * ledger and repair any drift (e.g. after restoring an old backup).
   */
  async recoverOnStartup(): Promise<{ stockRepaired: number }> {
    const drift = await rawQuery<{ variantId: string; cached: number; ledger: number }>(
      this.db,
      `SELECT v.id AS variantId, v.stockQty AS cached, COALESCE(SUM(m.qty), 0) AS ledger
       FROM ProductVariant v JOIN Product p ON p.id = v.productId
       LEFT JOIN StockMovement m ON m.variantId = v.id
       WHERE p.trackStock = 1 GROUP BY v.id HAVING cached <> ledger`
    )
    if (drift.length === 0) return { stockRepaired: 0 }
    await this.db.$transaction(async (tx) => {
      for (const d of drift) {
        await tx.productVariant.update({ where: { id: d.variantId }, data: { stockQty: d.ledger, version: undefined } })
      }
      await this.audit.log({ action: 'system.stock_reconciled', metadata: { variants: drift.length, details: drift.slice(0, 50) } }, tx)
    })
    this.log.app.warn('Stock cache reconciled with movement ledger', { count: drift.length })
    return { stockRepaired: drift.length }
  }
}

