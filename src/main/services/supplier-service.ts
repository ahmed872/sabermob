import { AppError } from '@shared/errors'
import { buildSearchText, normalizePhone, searchTokens } from '@shared/text'
import type {
  PurchaseQueryInput,
  PurchaseReceiveInput,
  PurchaseReturnInput,
  PurchaseSaveInput,
  SupplierPaymentInput,
  SupplierQueryInput,
  SupplierSaveInput
} from '@shared/schemas/suppliers'
import type { Paged } from '@shared/types/catalog'
import type { PurchaseDto, PurchaseListItem, SupplierDto, SupplierLedgerDto, SupplierListItem, SupplierPaymentDto } from '@shared/types/suppliers'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import { applyStockChange } from './inventory-service'
import { nextNumber } from './numbering'
import type { ShiftService } from './shift-service'

const iso = (d: string | Date | null | undefined) => (d instanceof Date ? d.toISOString() : (d ?? null))
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

const LIST_SELECT = `
  SELECT s.id, s.name, s.companyName, s.phone,
    COALESCE((SELECT SUM(l.amount) FROM SupplierLedger l WHERE l.supplierId = s.id), 0) AS balance,
    COALESCE((SELECT SUM(p.total) FROM PurchaseOrder p WHERE p.supplierId = s.id AND p.status <> 'CANCELLED'), 0) AS totalPurchases,
    (SELECT MAX(p.orderedAt) FROM PurchaseOrder p WHERE p.supplierId = s.id) AS lastPurchaseAt
  FROM Supplier s`

/**
 * Suppliers, purchasing and supplier payments. The supplier ledger is the
 * single source of truth for "who owes whom":
 *   balance > 0 → we owe the supplier, balance < 0 → the supplier owes us.
 */
export class SupplierService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly shifts: ShiftService
  ) {}

  async balance(supplierId: string, tx?: Tx): Promise<number> {
    const agg = await (tx ?? this.db).supplierLedger.aggregate({ where: { supplierId }, _sum: { amount: true } })
    return agg._sum.amount ?? 0
  }

  async list(input: SupplierQueryInput): Promise<Paged<SupplierListItem>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where = ['s.deletedAt IS NULL']
    const params: unknown[] = []
    for (const t of searchTokens(input.q ?? '')) {
      where.push(`s.searchText LIKE ? ESCAPE '\\'`)
      params.push(`%${likeEscape(t)}%`)
    }
    const inner = `${LIST_SELECT} WHERE ${where.join(' AND ')}`
    const outer = input.withBalance ? 'WHERE balance <> 0' : ''
    const [count] = await rawQuery<{ n: number }>(this.db, `SELECT COUNT(*) AS n FROM (${inner}) ${outer}`, ...params)
    const rows = await rawQuery<SupplierListItem>(this.db, `SELECT * FROM (${inner}) ${outer} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
    return { items: rows.map((r) => ({ ...r, lastPurchaseAt: iso(r.lastPurchaseAt) })), total: count?.n ?? 0, page, pageSize }
  }

  async get(id: string): Promise<SupplierDto> {
    const s = await this.db.supplier.findUnique({ where: { id } })
    if (!s || s.deletedAt) throw new AppError('NOT_FOUND', 'Supplier not found')
    const [row] = await rawQuery<SupplierListItem>(this.db, `${LIST_SELECT} WHERE s.id = ?`, id)
    const paid = await this.db.supplierPayment.aggregate({ where: { supplierId: id, voidedAt: null, direction: 'OUT' }, _sum: { amount: true } })
    return {
      id: s.id,
      name: s.name,
      companyName: s.companyName,
      phone: s.phone,
      phone2: s.phone2,
      address: s.address,
      notes: s.notes,
      createdAt: s.createdAt.toISOString(),
      balance: row?.balance ?? 0,
      totalPurchases: row?.totalPurchases ?? 0,
      lastPurchaseAt: iso(row?.lastPurchaseAt),
      totalPaid: paid._sum.amount ?? 0
    }
  }

  async save(input: SupplierSaveInput, actor: Actor): Promise<SupplierDto> {
    const data = {
      name: input.name.trim(),
      companyName: input.companyName ?? null,
      phone: normalizePhone(input.phone),
      phone2: normalizePhone(input.phone2),
      address: input.address ?? null,
      notes: input.notes ?? null,
      searchText: buildSearchText([input.name, input.companyName, normalizePhone(input.phone), normalizePhone(input.phone2)])
    }
    const id = await this.db.$transaction(async (tx) => {
      const s = input.id ? await tx.supplier.update({ where: { id: input.id }, data }) : await tx.supplier.create({ data })
      if (!input.id && input.openingBalance) {
        await tx.supplierLedger.create({ data: { supplierId: s.id, type: 'OPENING', amount: input.openingBalance, note: 'Opening balance', userId: actor.userId } })
      }
      await this.audit.log({ userId: actor.userId, action: input.id ? 'supplier.updated' : 'supplier.created', entity: 'Supplier', entityId: s.id, metadata: { name: s.name } }, tx)
      return s.id
    })
    return this.get(id)
  }

  async delete(id: string, actor: Actor): Promise<void> {
    const bal = await this.balance(id)
    if (bal !== 0) throw new AppError('INVALID_STATE', 'Supplier has an open balance', { reason: 'supplierBalance', balance: bal })
    await this.db.supplier.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ userId: actor.userId, action: 'supplier.deleted', entity: 'Supplier', entityId: id })
  }

  async ledger(supplierId: string): Promise<SupplierLedgerDto[]> {
    const rows = await this.db.supplierLedger.findMany({ where: { supplierId }, orderBy: { createdAt: 'asc' } })
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } })
    let running = 0
    return rows
      .map((r) => {
        running += r.amount
        return {
          id: r.id,
          type: r.type,
          amount: r.amount,
          balanceAfter: running,
          refType: r.refType,
          refId: r.refId,
          note: r.note,
          userName: users.find((u) => u.id === r.userId)?.fullName ?? null,
          createdAt: r.createdAt.toISOString()
        }
      })
      .reverse()
  }

  // ───────────── Payments ─────────────

  async pay(input: SupplierPaymentInput, actor: Actor): Promise<SupplierPaymentDto> {
    const id = await this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
      if (!supplier || supplier.deletedAt) throw new AppError('NOT_FOUND')
      const shift = await this.shifts.currentShift(tx)
      const direction = input.direction ?? 'OUT'
      if (input.method === 'CASH' && direction === 'OUT' && shift) {
        const summary = await this.shifts.summary(shift.id, tx)
        if (input.amount > summary.expectedCash) throw new AppError('INSUFFICIENT_CASH', 'Not enough cash in the drawer', { available: summary.expectedCash })
      }
      const p = await tx.supplierPayment.create({
        data: {
          supplierId: input.supplierId,
          purchaseOrderId: input.purchaseOrderId ?? null,
          direction,
          amount: input.amount,
          method: input.method,
          reference: input.reference ?? null,
          note: input.note ?? null,
          shiftId: input.method === 'CASH' ? (shift?.id ?? null) : null,
          userId: actor.userId
        }
      })
      await tx.supplierLedger.create({
        data: {
          supplierId: input.supplierId,
          type: 'PAYMENT',
          amount: direction === 'OUT' ? -input.amount : input.amount,
          refType: 'SupplierPayment',
          refId: p.id,
          note: input.note ?? null,
          userId: actor.userId
        }
      })
      await this.audit.log(
        { userId: actor.userId, action: 'supplier.payment', entity: 'Supplier', entityId: input.supplierId, metadata: { amount: input.amount, method: input.method, direction } },
        tx
      )
      return p.id
    })
    return (await this.payments(input.supplierId)).find((p) => p.id === id)!
  }

  async voidPayment(paymentId: string, reason: string, actor: Actor): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const p = await tx.supplierPayment.findUnique({ where: { id: paymentId } })
      if (!p) throw new AppError('NOT_FOUND')
      if (p.voidedAt) throw new AppError('INVALID_STATE', 'Already voided', { reason: 'alreadyVoided' })
      await tx.supplierPayment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidedById: actor.userId, voidReason: reason } })
      await tx.supplierLedger.create({
        data: {
          supplierId: p.supplierId,
          type: 'PAYMENT_VOID',
          amount: p.direction === 'OUT' ? p.amount : -p.amount,
          refType: 'SupplierPayment',
          refId: p.id,
          note: reason,
          userId: actor.userId
        }
      })
      await this.audit.log({ userId: actor.userId, action: 'supplier.payment_voided', entity: 'SupplierPayment', entityId: paymentId, metadata: { amount: p.amount, reason } }, tx)
    })
  }

  async payments(supplierId: string): Promise<SupplierPaymentDto[]> {
    const rows = await this.db.supplierPayment.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' }, include: { purchaseOrder: { select: { number: true } } } })
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, fullName: true } })
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      direction: r.direction,
      method: r.method,
      reference: r.reference,
      note: r.note,
      purchaseNumber: r.purchaseOrder?.number ?? null,
      userName: users.find((u) => u.id === r.userId)?.fullName ?? null,
      createdAt: r.createdAt.toISOString(),
      voidedAt: r.voidedAt?.toISOString() ?? null
    }))
  }

  // ───────────── Purchases ─────────────

  /**
   * Creates a purchase. With receiveNow (the usual small-shop flow) the goods
   * enter stock immediately, the supplier is charged, and an optional payment
   * is recorded — all in one transaction.
   */
  async createPurchase(input: PurchaseSaveInput, actor: Actor): Promise<PurchaseDto> {
    const id = await this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
      if (!supplier || supplier.deletedAt) throw new AppError('NOT_FOUND', 'Supplier not found')
      const number = await nextNumber(tx, 'purchase', 'PO-', 5)
      const po = await tx.purchaseOrder.create({
        data: {
          number,
          supplierId: supplier.id,
          status: 'ORDERED',
          supplierInvoiceNo: input.supplierInvoiceNo ?? null,
          notes: input.notes ?? null,
          userId: actor.userId,
          subtotal: input.items.reduce((a, i) => a + i.qty * i.unitCost, 0),
          items: { create: input.items.map((i) => ({ variantId: i.variantId, qtyOrdered: i.qty, unitCost: i.unitCost })) }
        },
        include: { items: true }
      })
      await this.audit.log({ userId: actor.userId, action: 'purchase.created', entity: 'PurchaseOrder', entityId: po.id, metadata: { number, supplier: supplier.name } }, tx)
      if (input.receiveNow ?? true) {
        await this.#receive(
          tx,
          {
            purchaseOrderId: po.id,
            items: po.items.map((it) => ({ purchaseItemId: it.id, qtyReceived: it.qtyOrdered, qtyDamaged: 0, serials: input.serials?.[it.variantId] }))
          },
          actor
        )
      }
      if (input.payment && input.payment.amount > 0) {
        const shift = await this.shifts.currentShift(tx)
        // Same rule as pay(): cash handed over during a shift comes out of the drawer.
        if (input.payment.method === 'CASH' && shift) {
          const summary = await this.shifts.summary(shift.id, tx)
          if (input.payment.amount > summary.expectedCash) throw new AppError('INSUFFICIENT_CASH', 'Not enough cash in the drawer', { available: summary.expectedCash })
        }
        const p = await tx.supplierPayment.create({
          data: {
            supplierId: supplier.id,
            purchaseOrderId: po.id,
            direction: 'OUT',
            amount: input.payment.amount,
            method: input.payment.method,
            shiftId: input.payment.method === 'CASH' ? (shift?.id ?? null) : null,
            userId: actor.userId
          }
        })
        await tx.supplierLedger.create({ data: { supplierId: supplier.id, type: 'PAYMENT', amount: -input.payment.amount, refType: 'SupplierPayment', refId: p.id, note: number, userId: actor.userId } })
      }
      return po.id
    })
    return this.getPurchase(id)
  }

  async #receive(tx: Tx, input: PurchaseReceiveInput, actor: Actor): Promise<number> {
    const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { items: { include: { variant: { include: { product: true } } } } } })
    if (!po) throw new AppError('NOT_FOUND', 'Purchase not found')
    if (po.status === 'CANCELLED' || po.status === 'RECEIVED') throw new AppError('INVALID_STATE', 'Purchase already closed', { reason: 'purchaseClosed' })
    const receipt = await tx.purchaseReceipt.create({ data: { purchaseOrderId: po.id, note: input.note ?? null, userId: actor.userId } })
    let value = 0
    for (const line of input.items) {
      const item = po.items.find((i) => i.id === line.purchaseItemId)
      if (!item) throw new AppError('NOT_FOUND', 'Purchase item not found')
      const good = line.qtyReceived
      const damaged = line.qtyDamaged ?? 0
      if (good + damaged === 0) continue
      const outstanding = item.qtyOrdered - item.qtyReceived - item.qtyDamaged
      if (good + damaged > outstanding) throw new AppError('VALIDATION', 'Received more than ordered', { reason: 'receivedTooMany', name: item.variant.product.name, outstanding })
      const unitCost = line.unitCost ?? item.unitCost
      if (item.variant.product.trackSerials && good > 0) {
        const serials = (line.serials ?? []).map((s) => s.trim()).filter(Boolean)
        // IMEIs are optional: units received without one sell by quantity (like stock counted by hand).
        if (serials.length > good) throw new AppError('VALIDATION', 'More IMEIs than units received', { reason: 'receiveSerials', name: item.variant.product.name, expected: good })
        for (const serial of serials) await tx.serialItem.create({ data: { variantId: item.variantId, serial, costPrice: unitCost } })
      }
      if (good > 0) {
        await applyStockChange(tx, { variantId: item.variantId, type: 'PURCHASE', qty: good, unitCost, refType: 'PurchaseOrder', refId: po.id, reason: po.number, userId: actor.userId })
      }
      await tx.purchaseItem.update({ where: { id: item.id }, data: { qtyReceived: { increment: good }, qtyDamaged: { increment: damaged }, unitCost } })
      await tx.purchaseReceiptItem.create({ data: { receiptId: receipt.id, purchaseItemId: item.id, qtyReceived: good, qtyDamaged: damaged, unitCost } })
      // We only owe for goods that arrived in good condition.
      value += good * unitCost
    }
    if (value > 0) {
      await tx.supplierLedger.create({ data: { supplierId: po.supplierId, type: 'PURCHASE', amount: value, refType: 'PurchaseOrder', refId: po.id, note: po.number, userId: actor.userId } })
    }
    const items = await tx.purchaseItem.findMany({ where: { purchaseOrderId: po.id } })
    const complete = items.every((i) => i.qtyReceived + i.qtyDamaged >= i.qtyOrdered)
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { total: { increment: value }, status: complete ? 'RECEIVED' : 'PARTIAL', receivedAt: complete ? new Date() : po.receivedAt }
    })
    await this.audit.log({ userId: actor.userId, action: 'purchase.received', entity: 'PurchaseOrder', entityId: po.id, metadata: { number: po.number, value, complete } }, tx)
    return value
  }

  async receive(input: PurchaseReceiveInput, actor: Actor): Promise<PurchaseDto> {
    await this.db.$transaction((tx) => this.#receive(tx, input, actor))
    return this.getPurchase(input.purchaseOrderId)
  }

  async cancelPurchase(id: string, actor: Actor): Promise<PurchaseDto> {
    await this.db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
      if (!po) throw new AppError('NOT_FOUND')
      if (po.items.some((i) => i.qtyReceived > 0)) throw new AppError('INVALID_STATE', 'Goods already received; use a supplier return instead', { reason: 'purchaseReceived' })
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } })
      await this.audit.log({ userId: actor.userId, action: 'purchase.cancelled', entity: 'PurchaseOrder', entityId: id, metadata: { number: po.number } }, tx)
    })
    return this.getPurchase(id)
  }

  /** Goods sent back to the supplier: stock out, supplier balance reduced. */
  async returnToSupplier(input: PurchaseReturnInput, actor: Actor): Promise<{ id: string; number: string; total: number }> {
    return this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
      if (!supplier) throw new AppError('NOT_FOUND')
      const number = await nextNumber(tx, 'purchaseReturn', 'PR-', 5)
      const total = input.items.reduce((a, i) => a + i.qty * i.unitCost, 0)
      const ret = await tx.purchaseReturn.create({
        data: {
          number,
          supplierId: supplier.id,
          purchaseOrderId: input.purchaseOrderId ?? null,
          total,
          note: input.note ?? null,
          userId: actor.userId,
          items: { create: input.items.map((i) => ({ variantId: i.variantId, qty: i.qty, unitCost: i.unitCost })) }
        }
      })
      for (const i of input.items) {
        await applyStockChange(tx, { variantId: i.variantId, type: 'PURCHASE_RETURN', qty: -i.qty, unitCost: i.unitCost, refType: 'PurchaseReturn', refId: ret.id, reason: number, userId: actor.userId })
        for (const serial of i.serials ?? []) {
          const s = await tx.serialItem.updateMany({ where: { serial, variantId: i.variantId, status: { in: ['IN_STOCK', 'DEFECTIVE'] } }, data: { status: 'RETURNED_TO_SUPPLIER' } })
          if (s.count === 0) throw new AppError('VALIDATION', 'IMEI not in stock', { reason: 'imeiNotInStock', serial })
        }
        if (input.purchaseOrderId) {
          const item = await tx.purchaseItem.findFirst({ where: { purchaseOrderId: input.purchaseOrderId, variantId: i.variantId } })
          if (item) await tx.purchaseItem.update({ where: { id: item.id }, data: { qtyReturned: { increment: i.qty } } })
        }
      }
      await tx.supplierLedger.create({ data: { supplierId: supplier.id, type: 'RETURN', amount: -total, refType: 'PurchaseReturn', refId: ret.id, note: number, userId: actor.userId } })
      await this.audit.log({ userId: actor.userId, action: 'purchase.returned', entity: 'PurchaseReturn', entityId: ret.id, metadata: { number, total, supplier: supplier.name } }, tx)
      return { id: ret.id, number, total }
    })
  }

  async getPurchase(id: string): Promise<PurchaseDto> {
    const po = await this.db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        items: { include: { variant: { include: { product: { select: { name: true, trackSerials: true } } } } } },
        receipts: { include: { items: true }, orderBy: { createdAt: 'asc' } },
        payments: { where: { voidedAt: null } }
      }
    })
    if (!po) throw new AppError('NOT_FOUND', 'Purchase not found')
    const users = await this.db.user.findMany({ where: { id: { in: [po.userId, ...po.receipts.map((r) => r.userId)] } }, select: { id: true, fullName: true } })
    const name = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? null
    return {
      id: po.id,
      number: po.number,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      status: po.status,
      supplierInvoiceNo: po.supplierInvoiceNo,
      total: po.total,
      orderedValue: po.items.reduce((a, i) => a + i.qtyOrdered * i.unitCost, 0),
      paid: po.payments.reduce((a, p) => a + (p.direction === 'OUT' ? p.amount : -p.amount), 0),
      notes: po.notes,
      userName: name(po.userId) ?? '',
      orderedAt: po.orderedAt.toISOString(),
      receivedAt: po.receivedAt?.toISOString() ?? null,
      items: po.items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        name: i.variant.name ? `${i.variant.product.name} — ${i.variant.name}` : i.variant.product.name,
        trackSerials: i.variant.product.trackSerials,
        qtyOrdered: i.qtyOrdered,
        qtyReceived: i.qtyReceived,
        qtyDamaged: i.qtyDamaged,
        qtyReturned: i.qtyReturned,
        unitCost: i.unitCost
      })),
      receipts: po.receipts.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), userName: name(r.userId), note: r.note, lines: r.items.length }))
    }
  }

  async listPurchases(input: PurchaseQueryInput): Promise<Paged<PurchaseListItem>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where = {
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.q ? { OR: [{ number: { contains: input.q } }, { supplierInvoiceNo: { contains: input.q } }, { supplier: { name: { contains: input.q } } }] } : {})
    }
    const [rows, total] = await Promise.all([
      this.db.purchaseOrder.findMany({
        where,
        orderBy: { orderedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { supplier: { select: { name: true } }, items: true, payments: { where: { voidedAt: null } } }
      }),
      this.db.purchaseOrder.count({ where })
    ])
    return {
      items: rows.map((po) => ({
        id: po.id,
        number: po.number,
        supplierName: po.supplier.name,
        status: po.status,
        supplierInvoiceNo: po.supplierInvoiceNo,
        total: po.total,
        orderedValue: po.items.reduce((a, i) => a + i.qtyOrdered * i.unitCost, 0),
        paid: po.payments.reduce((a, p) => a + (p.direction === 'OUT' ? p.amount : -p.amount), 0),
        orderedAt: po.orderedAt.toISOString(),
        itemCount: po.items.reduce((a, i) => a + i.qtyOrdered, 0)
      })),
      total,
      page,
      pageSize
    }
  }
}
