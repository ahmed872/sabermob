import { AppError } from '@shared/errors'
import { buildSearchText, normalizePhone, searchTokens } from '@shared/text'
import type { CollectDebtInput, CustomerQueryInput, CustomerSaveInput } from '@shared/schemas/customers'
import type { CustomerDto, CustomerListItem, LedgerEntryDto } from '@shared/types/customers'
import type { Paged } from '@shared/types/catalog'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import type { ShiftService } from './shift-service'

interface CustomerRow {
  id: string
  name: string
  phone: string | null
  type: string
  loyaltyPoints: number
  balance: number
  lastPurchaseAt: string | Date | null
  totalSpent: number
}

const LIST_SELECT = `
  SELECT c.id, c.name, c.phone, c.type, c.loyaltyPoints,
    COALESCE((SELECT SUM(l.amount) FROM CustomerLedger l WHERE l.customerId = c.id), 0) AS balance,
    (SELECT MAX(s.createdAt) FROM Sale s WHERE s.customerId = c.id) AS lastPurchaseAt,
    COALESCE((SELECT SUM(s.total - s.refundedTotal) FROM Sale s WHERE s.customerId = c.id AND s.status <> 'VOIDED'), 0) AS totalSpent
  FROM Customer c`

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const iso = (d: string | Date | null) => (d instanceof Date ? d.toISOString() : d)

export class CustomerService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly shifts: () => ShiftService
  ) {}

  async balance(customerId: string, tx?: Tx): Promise<number> {
    const agg = await (tx ?? this.db).customerLedger.aggregate({ where: { customerId }, _sum: { amount: true } })
    return agg._sum.amount ?? 0
  }

  async #tags(ids: string[]): Promise<Map<string, string[]>> {
    const rows = ids.length ? await this.db.customerTag.findMany({ where: { customerId: { in: ids } } }) : []
    const map = new Map<string, string[]>()
    for (const r of rows) map.set(r.customerId, [...(map.get(r.customerId) ?? []), r.tag])
    return map
  }

  async list(input: CustomerQueryInput): Promise<Paged<CustomerListItem>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where = ['c.deletedAt IS NULL']
    const params: unknown[] = []
    for (const t of searchTokens(input.q ?? '')) {
      const phone = normalizePhone(t)
      where.push(`(c.searchText LIKE ? ESCAPE '\\'${phone && phone.length >= 3 ? ` OR c.searchText LIKE ? ESCAPE '\\'` : ''})`)
      params.push(`%${likeEscape(t)}%`)
      if (phone && phone.length >= 3) params.push(`%${likeEscape(phone)}%`)
    }
    if (input.type) {
      where.push('c.type = ?')
      params.push(input.type)
    }
    const inner = `${LIST_SELECT} WHERE ${where.join(' AND ')}`
    const outerWhere = input.withBalance ? 'WHERE balance <> 0' : ''
    const order = input.sort === 'name' ? 'name COLLATE NOCASE' : input.sort === 'balance' ? 'balance DESC' : 'COALESCE(lastPurchaseAt, \'\') DESC, name'
    const [count] = await rawQuery<{ n: number }>(this.db, `SELECT COUNT(*) AS n FROM (${inner}) ${outerWhere}`, ...params)
    const rows = await rawQuery<CustomerRow>(this.db, `SELECT * FROM (${inner}) ${outerWhere} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
    const tags = await this.#tags(rows.map((r) => r.id))
    return {
      items: rows.map((r) => ({ ...r, lastPurchaseAt: iso(r.lastPurchaseAt), tags: tags.get(r.id) ?? [] })),
      total: count?.n ?? 0,
      page,
      pageSize
    }
  }

  /** Fast lookup for the POS customer picker (phone or name). */
  async quickFind(q: string): Promise<CustomerListItem[]> {
    return (await this.list({ q, page: 1, pageSize: 8, sort: 'recent' })).items
  }

  async get(id: string): Promise<CustomerDto> {
    const c = await this.db.customer.findUnique({ where: { id }, include: { tags: true, _count: { select: { sales: true, repairs: true } } } })
    if (!c || c.deletedAt) throw new AppError('NOT_FOUND', 'Customer not found')
    const [row] = await rawQuery<CustomerRow>(this.db, `${LIST_SELECT} WHERE c.id = ?`, id)
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      phone2: c.phone2,
      address: c.address,
      notes: c.notes,
      type: c.type,
      creditLimit: c.creditLimit,
      loyaltyPoints: c.loyaltyPoints,
      tags: c.tags.map((t) => t.tag),
      balance: row?.balance ?? 0,
      lastPurchaseAt: iso(row?.lastPurchaseAt ?? null),
      totalSpent: row?.totalSpent ?? 0,
      createdAt: c.createdAt.toISOString(),
      salesCount: c._count.sales,
      repairsCount: c._count.repairs
    }
  }

  async save(input: CustomerSaveInput, actor: Actor): Promise<CustomerDto> {
    const phone = normalizePhone(input.phone)
    const phone2 = normalizePhone(input.phone2)
    if (phone) {
      const dupe = await this.db.customer.findFirst({ where: { phone, deletedAt: null, NOT: input.id ? { id: input.id } : undefined } })
      if (dupe) throw new AppError('DUPLICATE', 'Phone already registered', { field: 'phone', customerId: dupe.id, name: dupe.name })
    }
    const data = {
      name: input.name.trim(),
      phone,
      phone2,
      address: input.address ?? null,
      notes: input.notes ?? null,
      type: input.type ?? 'REGULAR',
      creditLimit: input.creditLimit ?? null,
      searchText: buildSearchText([input.name, phone, phone2, input.address])
    }
    const id = await this.db.$transaction(async (tx) => {
      const c = input.id ? await tx.customer.update({ where: { id: input.id }, data }) : await tx.customer.create({ data })
      await tx.customerTag.deleteMany({ where: { customerId: c.id } })
      const tags = [...new Set(input.tags ?? [])]
      if (tags.length) await tx.customerTag.createMany({ data: tags.map((tag) => ({ customerId: c.id, tag })) })
      if (!input.id && input.openingBalance) {
        await tx.customerLedger.create({
          data: { customerId: c.id, type: 'OPENING', amount: input.openingBalance, note: 'Opening balance', userId: actor.userId }
        })
      }
      await this.audit.log({ userId: actor.userId, action: input.id ? 'customer.updated' : 'customer.created', entity: 'Customer', entityId: c.id, metadata: { name: c.name } }, tx)
      return c.id
    })
    return this.get(id)
  }

  async delete(id: string, actor: Actor): Promise<void> {
    const balance = await this.balance(id)
    if (balance !== 0) throw new AppError('INVALID_STATE', 'Customer has an outstanding balance', { balance })
    await this.db.customer.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ userId: actor.userId, action: 'customer.deleted', entity: 'Customer', entityId: id })
  }

  async ledger(customerId: string): Promise<LedgerEntryDto[]> {
    const rows = await this.db.customerLedger.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } })
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } })
    const names = new Map(users.map((u) => [u.id, u.fullName]))
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
          userName: r.userId ? (names.get(r.userId) ?? null) : null,
          createdAt: r.createdAt.toISOString()
        }
      })
      .reverse()
  }

  /** Customer pays (part of) their debt. Money goes into the open shift. */
  async collectDebt(input: CollectDebtInput, actor: Actor): Promise<{ balance: number }> {
    return this.db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } })
      if (!customer || customer.deletedAt) throw new AppError('NOT_FOUND')
      const balance = await this.balance(input.customerId, tx)
      if (input.amount > balance) throw new AppError('VALIDATION', 'Amount exceeds the debt', { balance })
      const shift = await this.shifts().currentShift(tx)
      const payment = await tx.payment.create({
        data: { kind: 'DEBT_COLLECTION', method: input.method, amount: input.amount, customerId: input.customerId, shiftId: shift?.id ?? null, userId: actor.userId }
      })
      await tx.customerLedger.create({
        data: { customerId: input.customerId, type: 'PAYMENT', amount: -input.amount, refType: 'Payment', refId: payment.id, note: input.note ?? null, userId: actor.userId }
      })
      await this.audit.log(
        { userId: actor.userId, action: 'customer.debt_collected', entity: 'Customer', entityId: input.customerId, metadata: { amount: input.amount, method: input.method } },
        tx
      )
      return { balance: balance - input.amount }
    })
  }

  async adjustBalance(customerId: string, amount: number, note: string, actor: Actor): Promise<{ balance: number }> {
    return this.db.$transaction(async (tx) => {
      await tx.customerLedger.create({ data: { customerId, type: 'ADJUSTMENT', amount, note, userId: actor.userId } })
      await this.audit.log({ userId: actor.userId, action: 'customer.balance_adjusted', entity: 'Customer', entityId: customerId, metadata: { amount, note } }, tx)
      return { balance: await this.balance(customerId, tx) }
    })
  }

  async adjustPoints(customerId: string, points: number, note: string, actor: Actor): Promise<{ points: number }> {
    return this.db.$transaction(async (tx) => {
      const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId } })
      if (c.loyaltyPoints + points < 0) throw new AppError('VALIDATION', 'Not enough points')
      await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } })
      await tx.loyaltyTransaction.create({ data: { customerId, points, reason: 'ADJUST', refId: null } })
      await this.audit.log({ userId: actor.userId, action: 'customer.points_adjusted', entity: 'Customer', entityId: customerId, metadata: { points, note } }, tx)
      return { points: c.loyaltyPoints + points }
    })
  }
}
