import { AppError } from '@shared/errors'
import type { ShiftQueryInput } from '@shared/schemas/sales'
import type { Paged } from '@shared/types/catalog'
import type { ShiftSummary } from '@shared/types/sales'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import { nextNumber } from './numbering'

/**
 * Cash drawer shifts. One drawer per installation: a shift is opened with
 * the starting float, every cash movement is linked to it, and closing
 * compares expected vs counted cash.
 */
export class ShiftService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  async currentShift(tx?: Tx) {
    return (tx ?? this.db).shift.findFirst({ where: { status: 'OPEN' }, orderBy: { openedAt: 'desc' } })
  }

  async open(openingCash: number, actor: Actor): Promise<ShiftSummary> {
    const id = await this.db.$transaction(async (tx) => {
      if (await this.currentShift(tx)) throw new AppError('SHIFT_ALREADY_OPEN')
      const number = await nextNumber(tx, 'shift', 'SH-', 5)
      const shift = await tx.shift.create({ data: { number, openedById: actor.userId, openingCash } })
      await this.audit.log({ userId: actor.userId, action: 'shift.opened', entity: 'Shift', entityId: shift.id, metadata: { openingCash } }, tx)
      return shift.id
    })
    return this.summary(id)
  }

  async cashMovement(input: { type: 'PAY_IN' | 'PAY_OUT'; amount: number; reason: string }, actor: Actor): Promise<ShiftSummary> {
    const shiftId = await this.db.$transaction(async (tx) => {
      const shift = await this.currentShift(tx)
      if (!shift) throw new AppError('SHIFT_REQUIRED')
      if (input.type === 'PAY_OUT') {
        const s = await this.#computeExpected(tx, shift.id, shift.openingCash)
        if (input.amount > s.expectedCash) throw new AppError('INSUFFICIENT_CASH', 'Not enough cash in the drawer', { available: s.expectedCash })
      }
      const m = await tx.cashMovement.create({ data: { shiftId: shift.id, type: input.type, amount: input.amount, reason: input.reason, userId: actor.userId } })
      await this.audit.log({ userId: actor.userId, action: 'shift.cash_movement', entity: 'CashMovement', entityId: m.id, metadata: input }, tx)
      return shift.id
    })
    return this.summary(shiftId)
  }

  async #computeExpected(tx: Tx, shiftId: string, openingCash: number) {
    const [pay] = await rawQuery<{ cash: number }>(tx, `SELECT COALESCE(SUM(amount), 0) AS cash FROM Payment WHERE shiftId = ? AND method = 'CASH'`, shiftId)
    const [mov] = await rawQuery<{ cashIn: number; cashOut: number }>(
      tx,
      `SELECT COALESCE(SUM(CASE WHEN type = 'PAY_IN' THEN amount ELSE 0 END), 0) AS cashIn,
              COALESCE(SUM(CASE WHEN type = 'PAY_OUT' THEN amount ELSE 0 END), 0) AS cashOut
       FROM CashMovement WHERE shiftId = ?`,
      shiftId
    )
    const [sup] = await rawQuery<{ net: number }>(
      tx,
      `SELECT COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE -amount END), 0) AS net
       FROM SupplierPayment WHERE shiftId = ? AND method = 'CASH' AND voidedAt IS NULL`,
      shiftId
    )
    const cashIn = mov?.cashIn ?? 0
    const cashOut = mov?.cashOut ?? 0
    const supplierPayments = sup?.net ?? 0
    return { cashPayments: pay?.cash ?? 0, cashIn, cashOut, supplierPayments, expectedCash: openingCash + (pay?.cash ?? 0) + cashIn - cashOut - supplierPayments }
  }

  async summary(shiftId: string, tx?: Tx): Promise<ShiftSummary> {
    const client = tx ?? this.db
    const shift = await client.shift.findUnique({ where: { id: shiftId }, include: { openedBy: { select: { fullName: true } }, cashMovements: { orderBy: { createdAt: 'asc' } } } })
    if (!shift) throw new AppError('NOT_FOUND', 'Shift not found')
    const exp = await this.#computeExpected(client, shift.id, shift.openingCash)
    const [sales] = await rawQuery<{ n: number; total: number; discounts: number }>(
      client,
      `SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(discountTotal), 0) AS discounts FROM Sale WHERE shiftId = ? AND status <> 'VOIDED'`,
      shift.id
    )
    const [refunds] = await rawQuery<{ total: number }>(client, `SELECT COALESCE(SUM(total), 0) AS total FROM Refund WHERE shiftId = ?`, shift.id)
    const methods = await rawQuery<{ method: string; total: number }>(client, `SELECT method, SUM(amount) AS total FROM Payment WHERE shiftId = ? GROUP BY method`, shift.id)
    const userIds = [shift.closedById, shift.reviewedById, ...shift.cashMovements.map((m) => m.userId)].filter((x): x is string => !!x)
    const users = await client.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, fullName: true } })
    const name = (id: string | null) => (id ? (users.find((u) => u.id === id)?.fullName ?? null) : null)
    return {
      id: shift.id,
      number: shift.number,
      status: shift.status as 'OPEN' | 'CLOSED',
      openedBy: shift.openedBy.fullName,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      closedBy: name(shift.closedById),
      openingCash: shift.openingCash,
      salesCount: sales?.n ?? 0,
      salesTotal: sales?.total ?? 0,
      refundsTotal: refunds?.total ?? 0,
      discountsTotal: sales?.discounts ?? 0,
      byMethod: Object.fromEntries(methods.map((m) => [m.method, m.total])),
      cashIn: exp.cashIn,
      cashOut: exp.cashOut,
      supplierPayments: exp.supplierPayments,
      expectedCash: shift.status === 'CLOSED' && shift.expectedCash !== null ? shift.expectedCash : exp.expectedCash,
      countedCash: shift.countedCash,
      difference: shift.difference,
      note: shift.note,
      reviewedBy: name(shift.reviewedById),
      movements: shift.cashMovements.map((m) => ({ id: m.id, type: m.type, amount: m.amount, reason: m.reason, userName: name(m.userId), createdAt: m.createdAt.toISOString() }))
    }
  }

  async close(countedCash: number, note: string | null, actor: Actor): Promise<ShiftSummary> {
    const id = await this.db.$transaction(async (tx) => {
      const shift = await this.currentShift(tx)
      if (!shift) throw new AppError('SHIFT_REQUIRED')
      if (shift.openedById !== actor.userId && !actor.permissions.has('view_all_shifts')) throw new AppError('FORBIDDEN', 'Only the shift owner or a manager can close it', { permission: 'view_all_shifts' })
      const exp = await this.#computeExpected(tx, shift.id, shift.openingCash)
      const difference = countedCash - exp.expectedCash
      await tx.shift.update({
        where: { id: shift.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: actor.userId, expectedCash: exp.expectedCash, countedCash, difference, note }
      })
      await this.audit.log(
        { userId: actor.userId, action: 'shift.closed', entity: 'Shift', entityId: shift.id, metadata: { expected: exp.expectedCash, counted: countedCash, difference } },
        tx
      )
      return shift.id
    })
    return this.summary(id)
  }

  async review(shiftId: string, actor: Actor): Promise<ShiftSummary> {
    await this.db.shift.update({ where: { id: shiftId }, data: { reviewedById: actor.userId, reviewedAt: new Date() } })
    await this.audit.log({ userId: actor.userId, action: 'shift.reviewed', entity: 'Shift', entityId: shiftId })
    return this.summary(shiftId)
  }

  async list(input: ShiftQueryInput): Promise<Paged<ShiftSummary>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 30
    const where = { ...(input.from || input.to ? { openedAt: { ...(input.from ? { gte: new Date(input.from) } : {}), ...(input.to ? { lt: new Date(input.to) } : {}) } } : {}) }
    const [rows, total] = await Promise.all([
      this.db.shift.findMany({ where, orderBy: { openedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true } }),
      this.db.shift.count({ where })
    ])
    const items: ShiftSummary[] = []
    for (const r of rows) items.push(await this.summary(r.id))
    return { items, total, page, pageSize }
  }
}
