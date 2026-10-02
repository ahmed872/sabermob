import { AppError } from '@shared/errors'
import { settlePayments } from '@shared/domain/pricing'
import { buildSearchText, normalizePhone } from '@shared/text'
import type { RepairCreateInput, RepairPartInput, RepairQueryInput, RepairStatusInput, RepairStatusSaveInput, RepairUpdateInput } from '@shared/schemas/repairs'
import type { Paged } from '@shared/types/catalog'
import type { RepairDto, RepairListItem, RepairStatusDto, WarrantyMatch } from '@shared/types/repairs'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { SecretsService } from '../security/secrets'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import { applyStockChange } from './inventory-service'
import { MediaService } from './media-service'
import { nextNumber } from './numbering'
import type { SettingsService } from './settings-service'
import type { ShiftService } from './shift-service'

const DAY = 86_400_000

/**
 * Repair tickets: intake → diagnosis → parts → delivery, with deposits,
 * parts consumed from inventory, customer signatures, photos and warranty.
 */
export class RepairService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly shifts: ShiftService,
    private readonly secrets: SecretsService,
    private readonly media: MediaService,
    private readonly now: () => Date
  ) {}

  // ───────────── Statuses ─────────────

  async statuses(): Promise<RepairStatusDto[]> {
    const rows = await this.db.repairStatus.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { repairs: { where: { deletedAt: null } } } } } })
    return rows.map((s) => ({ id: s.id, key: s.key, name: s.name, nameAr: s.nameAr, color: s.color, sortOrder: s.sortOrder, isFinal: s.isFinal, isSystem: s.isSystem, isActive: s.isActive, count: s._count.repairs }))
  }

  async saveStatus(input: RepairStatusSaveInput, actor: Actor): Promise<RepairStatusDto> {
    const data = { name: input.name, nameAr: input.nameAr, color: input.color, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true }
    const s = input.id
      ? await this.db.repairStatus.update({ where: { id: input.id }, data })
      : await this.db.repairStatus.create({ data: { ...data, key: `CUSTOM_${Date.now().toString(36).toUpperCase()}` } })
    await this.audit.log({ userId: actor.userId, action: 'repair.status_saved', entity: 'RepairStatus', entityId: s.id, metadata: { name: s.name } })
    return { ...s }
  }

  async #status(tx: Tx, key: string) {
    return tx.repairStatus.findUniqueOrThrow({ where: { key } })
  }

  // ───────────── Create / update ─────────────

  /** Previous delivered repair of the same device that is still under warranty. */
  async checkWarranty(input: { imei?: string | null; phone?: string | null; model?: string | null }): Promise<WarrantyMatch[]> {
    const ors: Array<Record<string, unknown>> = []
    if (input.imei) ors.push({ imei: input.imei.trim() })
    const phone = normalizePhone(input.phone)
    if (phone && input.model) ors.push({ customerPhone: phone, deviceModel: input.model.trim() })
    if (ors.length === 0) return []
    const rows = await this.db.repair.findMany({
      where: { OR: ors, deletedAt: null, warrantyUntil: { gte: this.now() }, status: { key: 'DELIVERED' } },
      orderBy: { deliveredAt: 'desc' },
      take: 5
    })
    return rows.map((r) => ({ repairId: r.id, number: r.number, deviceModel: r.deviceModel, deliveredAt: r.deliveredAt?.toISOString() ?? null, warrantyUntil: r.warrantyUntil!.toISOString(), complaint: r.complaint }))
  }

  async create(input: RepairCreateInput, actor: Actor): Promise<RepairDto> {
    const cfg = this.settings.get('repairs')
    if (cfg.requireSignature && !input.signature) throw new AppError('VALIDATION', 'Customer signature required', { field: 'signature' })
    const phone = normalizePhone(input.customerPhone) ?? input.customerPhone.trim()
    // Save files before the transaction; removed again if it fails.
    const savedFiles: string[] = []
    const signature = input.signature ? this.media.saveDataUrl('signatures', input.signature) : null
    if (signature) savedFiles.push(signature)
    const photos = (input.photos ?? []).map((p) => ({ kind: p.kind, filePath: this.media.saveDataUrl('repairs', p.dataUrl) }))
    savedFiles.push(...photos.map((p) => p.filePath))
    try {
      const id = await this.db.$transaction(async (tx) => {
        // Link or create the customer by phone (customers stay optional elsewhere).
        let customerId = input.customerId ?? null
        if (!customerId) {
          const existing = await tx.customer.findFirst({ where: { OR: [{ phone }, { phone2: phone }], deletedAt: null } })
          customerId =
            existing?.id ??
            (
              await tx.customer.create({
                data: { name: input.customerName.trim(), phone, searchText: buildSearchText([input.customerName, phone]) }
              })
            ).id
        }
        let warrantyDays = input.warrantyDays ?? cfg.defaultWarrantyDays
        if (input.serviceVariantId && input.warrantyDays == null) {
          const service = await tx.productVariant.findUnique({ where: { id: input.serviceVariantId }, include: { product: true } })
          if (service?.product.warrantyDays != null) warrantyDays = service.product.warrantyDays
        }
        let isWarrantyClaim = false
        if (input.parentRepairId) {
          const parent = await tx.repair.findUnique({ where: { id: input.parentRepairId } })
          isWarrantyClaim = !!parent?.warrantyUntil && parent.warrantyUntil >= this.now()
        }
        const status = await this.#status(tx, 'RECEIVED')
        const number = await nextNumber(tx, 'repair', 'RP-', 4)
        const shift = await this.shifts.currentShift(tx)
        const repair = await tx.repair.create({
          data: {
            number,
            customerId,
            customerName: input.customerName.trim(),
            customerPhone: phone,
            deviceBrand: input.deviceBrand ?? null,
            deviceModel: input.deviceModel.trim(),
            imei: input.imei ?? null,
            serialNumber: input.serialNumber ?? null,
            deviceColor: input.deviceColor ?? null,
            deviceCondition: input.deviceCondition ?? null,
            devicePasscodeEnc: input.passcode ? this.secrets.encrypt(input.passcode) : null,
            complaint: input.complaint,
            accessories: JSON.stringify(input.accessories ?? []),
            statusId: status.id,
            technicianId: input.technicianId ?? null,
            serviceVariantId: input.serviceVariantId ?? null,
            estimatedPrice: input.estimatedPrice ?? 0,
            expectedAt: input.expectedAt ? new Date(input.expectedAt) : cfg.defaultExpectedDays ? new Date(this.now().getTime() + cfg.defaultExpectedDays * DAY) : null,
            warrantyDays,
            parentRepairId: input.parentRepairId ?? null,
            isWarrantyClaim,
            receiveSignature: signature,
            userId: actor.userId,
            receivedAt: this.now(),
            statusHistory: { create: { toStatusId: status.id, userId: actor.userId, note: null } },
            photos: { create: photos.map((p) => ({ ...p, userId: actor.userId })) }
          }
        })
        if (input.deposit && input.deposit.amount > 0) {
          await tx.payment.create({ data: { kind: 'REPAIR', method: input.deposit.method, amount: input.deposit.amount, repairId: repair.id, customerId, shiftId: shift?.id ?? null, userId: actor.userId } })
          await tx.repair.update({ where: { id: repair.id }, data: { paidTotal: input.deposit.amount } })
        }
        await this.audit.log({ userId: actor.userId, action: 'repair.created', entity: 'Repair', entityId: repair.id, metadata: { number, device: input.deviceModel, warrantyClaim: isWarrantyClaim } }, tx)
        return repair.id
      })
      return this.get(id, actor)
    } catch (err) {
      for (const f of savedFiles) this.media.remove(f)
      throw err
    }
  }

  async update(input: RepairUpdateInput, actor: Actor): Promise<RepairDto> {
    const existing = await this.db.repair.findUnique({ where: { id: input.id }, include: { status: true } })
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND')
    if (existing.status.key === 'DELIVERED' && (input.finalPrice !== undefined || input.laborPrice !== undefined)) {
      throw new AppError('INVALID_STATE', 'Delivered repairs cannot be repriced')
    }
    const data: Record<string, unknown> = {}
    for (const k of ['deviceBrand', 'deviceModel', 'imei', 'serialNumber', 'deviceColor', 'deviceCondition', 'complaint', 'diagnosis', 'notes', 'technicianId', 'estimatedPrice', 'laborPrice', 'finalPrice', 'warrantyDays'] as const) {
      if (input[k] !== undefined) data[k] = input[k]
    }
    if (input.expectedAt !== undefined) data.expectedAt = input.expectedAt ? new Date(input.expectedAt) : null
    if (input.passcode !== undefined) data.devicePasscodeEnc = input.passcode ? this.secrets.encrypt(input.passcode) : null
    await this.db.$transaction(async (tx) => {
      await tx.repair.update({ where: { id: input.id }, data })
      const priceChange = input.finalPrice !== undefined && input.finalPrice !== existing.finalPrice
      await this.audit.log(
        {
          userId: actor.userId,
          action: priceChange ? 'repair.priced' : 'repair.updated',
          entity: 'Repair',
          entityId: input.id,
          metadata: { fields: Object.keys(data).filter((k) => k !== 'devicePasscodeEnc'), finalPrice: input.finalPrice }
        },
        tx
      )
    })
    return this.get(input.id, actor)
  }

  async revealPasscode(id: string, actor: Actor): Promise<string | null> {
    const r = await this.db.repair.findUnique({ where: { id } })
    if (!r) throw new AppError('NOT_FOUND')
    await this.audit.log({ userId: actor.userId, action: 'repair.passcode_viewed', entity: 'Repair', entityId: id })
    return r.devicePasscodeEnc ? this.secrets.decrypt(r.devicePasscodeEnc) : null
  }

  // ───────────── Parts & payments ─────────────

  async addPart(input: RepairPartInput, actor: Actor): Promise<RepairDto> {
    await this.db.$transaction(async (tx) => {
      const repair = await tx.repair.findUnique({ where: { id: input.repairId }, include: { status: true } })
      if (!repair || repair.deletedAt) throw new AppError('NOT_FOUND')
      if (repair.status.isFinal) throw new AppError('INVALID_STATE', 'Repair is closed')
      let name = input.name?.trim() ?? ''
      let unitCost = input.unitCost ?? 0
      let unitPrice = input.unitPrice ?? 0
      if (input.variantId) {
        const v = await tx.productVariant.findUnique({ where: { id: input.variantId }, include: { product: true } })
        if (!v) throw new AppError('NOT_FOUND', 'Part not found')
        name = v.name ? `${v.product.name} — ${v.name}` : v.product.name
        unitCost = v.costPrice
        unitPrice = input.unitPrice ?? v.sellPrice
        await applyStockChange(tx, {
          variantId: v.id,
          type: 'REPAIR_USE',
          qty: -input.qty,
          unitCost,
          refType: 'Repair',
          refId: repair.id,
          reason: repair.number,
          userId: actor.userId,
          allowNegative: this.settings.get('pos').allowNegativeStock
        })
      } else if (!name) {
        throw new AppError('VALIDATION', 'Part name required')
      }
      const part = await tx.repairPart.create({ data: { repairId: repair.id, variantId: input.variantId ?? null, name, qty: input.qty, unitCost, unitPrice, userId: actor.userId } })
      await this.audit.log({ userId: actor.userId, action: 'repair.part_added', entity: 'Repair', entityId: repair.id, metadata: { part: name, qty: input.qty, partId: part.id } }, tx)
    })
    return this.get(input.repairId, actor)
  }

  async removePart(partId: string, restock: boolean, actor: Actor): Promise<RepairDto> {
    const repairId = await this.db.$transaction(async (tx) => {
      const part = await tx.repairPart.findUnique({ where: { id: partId }, include: { repair: { include: { status: true } } } })
      if (!part || part.returnedAt) throw new AppError('NOT_FOUND')
      if (part.repair.status.key === 'DELIVERED') throw new AppError('INVALID_STATE', 'Repair already delivered')
      await this.#returnPart(tx, part, restock, actor)
      return part.repairId
    })
    return this.get(repairId, actor)
  }

  async #returnPart(tx: Tx, part: { id: string; repairId: string; variantId: string | null; qty: number; unitCost: number; name: string }, restock: boolean, actor: Actor) {
    await tx.repairPart.update({ where: { id: part.id }, data: { returnedAt: this.now() } })
    if (restock && part.variantId) {
      await applyStockChange(tx, { variantId: part.variantId, type: 'REPAIR_RETURN', qty: part.qty, unitCost: part.unitCost, refType: 'Repair', refId: part.repairId, reason: part.name, userId: actor.userId })
    }
    await this.audit.log({ userId: actor.userId, action: 'repair.part_removed', entity: 'Repair', entityId: part.repairId, metadata: { part: part.name, restock } }, tx)
  }

  async addPayment(repairId: string, amount: number, method: string, actor: Actor): Promise<RepairDto> {
    await this.db.$transaction(async (tx) => {
      const r = await tx.repair.findUnique({ where: { id: repairId } })
      if (!r || r.deletedAt) throw new AppError('NOT_FOUND')
      const shift = await this.shifts.currentShift(tx)
      await tx.payment.create({ data: { kind: 'REPAIR', method, amount, repairId, customerId: r.customerId, shiftId: shift?.id ?? null, userId: actor.userId } })
      await tx.repair.update({ where: { id: repairId }, data: { paidTotal: { increment: amount } } })
      await this.audit.log({ userId: actor.userId, action: 'repair.payment', entity: 'Repair', entityId: repairId, metadata: { amount, method } }, tx)
    })
    return this.get(repairId, actor)
  }

  #priceOf(r: { finalPrice: number | null; laborPrice: number }, parts: Array<{ qty: number; unitPrice: number; returnedAt: Date | null }>): number {
    if (r.finalPrice !== null) return r.finalPrice
    return r.laborPrice + parts.filter((p) => !p.returnedAt).reduce((a, p) => a + p.qty * p.unitPrice, 0)
  }

  // ───────────── Status workflow ─────────────

  async changeStatus(input: RepairStatusInput, actor: Actor): Promise<RepairDto> {
    const savedSig = input.signature ? this.media.saveDataUrl('signatures', input.signature) : null
    try {
      await this.db.$transaction(async (tx) => {
        const r = await tx.repair.findUnique({ where: { id: input.id }, include: { status: true, parts: true } })
        if (!r || r.deletedAt) throw new AppError('NOT_FOUND')
        const to = await tx.repairStatus.findUnique({ where: { id: input.statusId } })
        if (!to || !to.isActive) throw new AppError('NOT_FOUND', 'Status not found')
        if (r.status.isFinal) throw new AppError('INVALID_STATE', 'Repair is already closed')
        const data: Record<string, unknown> = { statusId: to.id }
        const shift = await this.shifts.currentShift(tx)

        if (to.key === 'DELIVERED') {
          if (this.settings.get('repairs').requireSignature && !savedSig) throw new AppError('VALIDATION', 'Customer signature required', { field: 'signature' })
          const price = this.#priceOf(r, r.parts)
          const due = Math.max(0, price - r.paidTotal)
          const settled = settlePayments(due, input.payments ?? [])
          if (settled.remaining > 0) {
            if (!r.customerId) throw new AppError('CREDIT_REQUIRES_CUSTOMER')
            await tx.customerLedger.create({ data: { customerId: r.customerId, type: 'REPAIR_CREDIT', amount: settled.remaining, refType: 'Repair', refId: r.id, note: r.number, userId: actor.userId } })
            data.creditAmount = settled.remaining
          }
          let changeLeft = settled.change
          for (const p of input.payments ?? []) {
            let amount = p.amount
            if (p.method === 'CASH' && changeLeft > 0) {
              const take = Math.min(changeLeft, amount)
              amount -= take
              changeLeft -= take
            }
            if (amount <= 0) continue
            await tx.payment.create({ data: { kind: 'REPAIR', method: p.method, amount, repairId: r.id, customerId: r.customerId, shiftId: shift?.id ?? null, userId: actor.userId } })
          }
          const delivered = this.now()
          Object.assign(data, {
            finalPrice: price,
            paidTotal: r.paidTotal + settled.paid,
            deliveredAt: delivered,
            warrantyUntil: r.warrantyDays > 0 ? new Date(delivered.getTime() + r.warrantyDays * DAY) : null,
            deliverySignature: savedSig
          })
        }

        if (to.key === 'CANCELLED') {
          for (const part of r.parts.filter((p) => !p.returnedAt)) await this.#returnPart(tx, part, true, actor)
          if (input.refundDeposit && r.paidTotal > 0) {
            await tx.payment.create({ data: { kind: 'REFUND', method: 'CASH', amount: -r.paidTotal, repairId: r.id, customerId: r.customerId, shiftId: shift?.id ?? null, userId: actor.userId } })
            data.paidTotal = 0
          }
        }

        await tx.repair.update({ where: { id: r.id }, data })
        await tx.repairStatusHistory.create({ data: { repairId: r.id, fromStatusId: r.statusId, toStatusId: to.id, note: input.note ?? null, userId: actor.userId } })
        await this.audit.log({ userId: actor.userId, action: 'repair.status_changed', entity: 'Repair', entityId: r.id, metadata: { from: r.status.key, to: to.key, number: r.number } }, tx)
      })
    } catch (err) {
      this.media.remove(savedSig)
      throw err
    }
    return this.get(input.id, actor)
  }

  async addPhoto(repairId: string, kind: string, dataUrl: string, note: string | null, actor: Actor): Promise<RepairDto> {
    const filePath = this.media.saveDataUrl('repairs', dataUrl)
    try {
      await this.db.repairPhoto.create({ data: { repairId, kind, filePath, note, userId: actor.userId } })
    } catch (err) {
      this.media.remove(filePath)
      throw err
    }
    return this.get(repairId, actor)
  }

  async removePhoto(photoId: string, actor: Actor): Promise<RepairDto> {
    const p = await this.db.repairPhoto.findUnique({ where: { id: photoId } })
    if (!p) throw new AppError('NOT_FOUND')
    await this.db.repairPhoto.delete({ where: { id: photoId } })
    this.media.remove(p.filePath)
    await this.audit.log({ userId: actor.userId, action: 'repair.photo_removed', entity: 'Repair', entityId: p.repairId })
    return this.get(p.repairId, actor)
  }

  /** Soft delete; tickets with money or parts must be cancelled instead. */
  async delete(id: string, actor: Actor): Promise<void> {
    const r = await this.db.repair.findUnique({ where: { id }, include: { parts: { where: { returnedAt: null } } } })
    if (!r || r.deletedAt) throw new AppError('NOT_FOUND')
    if (r.paidTotal !== 0 || r.parts.length > 0) throw new AppError('INVALID_STATE', 'Cancel the repair instead (it has payments or parts)')
    await this.db.repair.update({ where: { id }, data: { deletedAt: this.now(), deletedById: actor.userId } })
    await this.audit.log({ userId: actor.userId, action: 'repair.deleted', entity: 'Repair', entityId: id, metadata: { number: r.number } })
  }

  // ───────────── Queries ─────────────

  async list(input: RepairQueryInput): Promise<Paged<RepairListItem>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 100
    const where: string[] = ['r.deletedAt IS NULL']
    const params: unknown[] = []
    if (input.q) {
      const q = input.q.trim()
      const phone = normalizePhone(q)
      where.push(`(r.number LIKE ? OR r.customerName LIKE ? OR r.customerPhone LIKE ? OR r.imei LIKE ? OR r.deviceModel LIKE ?)`)
      params.push(`%${q.toUpperCase()}%`, `%${q}%`, `%${phone ?? q}%`, `%${q}%`, `%${q}%`)
    }
    if (input.statusId) {
      where.push('r.statusId = ?')
      params.push(input.statusId)
    }
    if (input.technicianId) {
      where.push('r.technicianId = ?')
      params.push(input.technicianId)
    }
    if (input.open) where.push('st.isFinal = 0')
    const nowIso = this.now().toISOString()
    if (input.overdue) {
      where.push('st.isFinal = 0 AND r.expectedAt IS NOT NULL AND r.expectedAt < ?')
      params.push(nowIso)
    }
    const base = `FROM Repair r JOIN RepairStatus st ON st.id = r.statusId LEFT JOIN User u ON u.id = r.technicianId WHERE ${where.join(' AND ')}`
    const [count] = await rawQuery<{ n: number }>(this.db, `SELECT COUNT(*) AS n ${base}`, ...params)
    const rows = await rawQuery<Omit<RepairListItem, 'overdue' | 'isWarrantyClaim' | 'receivedAt' | 'expectedAt' | 'deliveredAt'> & { overdue: number; isWarrantyClaim: number; receivedAt: string | Date; expectedAt: string | Date | null; deliveredAt: string | Date | null }>(
      this.db,
      `SELECT r.id, r.number, r.customerName, r.customerPhone, r.deviceBrand, r.deviceModel, r.imei, r.complaint, r.statusId, st.key AS statusKey,
              u.fullName AS technicianName, r.estimatedPrice, r.finalPrice, r.paidTotal, r.receivedAt, r.expectedAt, r.deliveredAt,
              (CASE WHEN st.isFinal = 0 AND r.expectedAt IS NOT NULL AND r.expectedAt < ? THEN 1 ELSE 0 END) AS overdue, r.isWarrantyClaim
       ${base} ORDER BY r.receivedAt DESC LIMIT ? OFFSET ?`,
      nowIso,
      ...params,
      pageSize,
      (page - 1) * pageSize
    )
    const iso = (d: string | Date | null) => (d instanceof Date ? d.toISOString() : d)
    return {
      items: rows.map((r) => ({ ...r, overdue: !!r.overdue, isWarrantyClaim: !!r.isWarrantyClaim, receivedAt: iso(r.receivedAt)!, expectedAt: iso(r.expectedAt), deliveredAt: iso(r.deliveredAt) })),
      total: count?.n ?? 0,
      page,
      pageSize
    }
  }

  async get(id: string, actor: Actor | null): Promise<RepairDto> {
    const r = await this.db.repair.findUnique({
      where: { id },
      include: {
        status: true,
        technician: { select: { fullName: true } },
        parts: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        photos: { orderBy: { createdAt: 'asc' } }
      }
    })
    if (!r || r.deletedAt) throw new AppError('NOT_FOUND', 'Repair not found')
    const userIds = [r.userId, ...r.payments.map((p) => p.userId), ...r.statusHistory.map((h) => h.userId)]
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, fullName: true } })
    const name = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? null
    const parent = r.parentRepairId ? await this.db.repair.findUnique({ where: { id: r.parentRepairId }, select: { number: true } }) : null
    const activeParts = r.parts.filter((p) => !p.returnedAt)
    const partsTotal = activeParts.reduce((a, p) => a + p.qty * p.unitPrice, 0)
    const partsCost = activeParts.reduce((a, p) => a + p.qty * p.unitCost, 0)
    const price = this.#priceOf(r, r.parts)
    const canProfit = !!actor?.permissions.has('view_profit')
    const canCost = !!actor?.permissions.has('view_cost')
    const now = this.now()
    return {
      id: r.id,
      number: r.number,
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      deviceBrand: r.deviceBrand,
      deviceModel: r.deviceModel,
      imei: r.imei,
      serialNumber: r.serialNumber,
      deviceColor: r.deviceColor,
      deviceCondition: r.deviceCondition,
      hasPasscode: !!r.devicePasscodeEnc,
      complaint: r.complaint,
      diagnosis: r.diagnosis,
      notes: r.notes,
      accessories: JSON.parse(r.accessories) as string[],
      statusId: r.statusId,
      statusKey: r.status.key,
      technicianId: r.technicianId,
      technicianName: r.technician?.fullName ?? null,
      serviceVariantId: r.serviceVariantId,
      estimatedPrice: r.estimatedPrice,
      laborPrice: r.laborPrice,
      finalPrice: r.status.key === 'DELIVERED' ? r.finalPrice : price,
      partsTotal,
      partsCost: canCost || canProfit ? partsCost : null,
      profit: canProfit ? price - partsCost : null,
      paidTotal: r.paidTotal,
      balanceDue: r.status.key === 'DELIVERED' ? 0 : Math.max(0, price - r.paidTotal),
      creditAmount: r.creditAmount,
      receivedAt: r.receivedAt.toISOString(),
      expectedAt: r.expectedAt?.toISOString() ?? null,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      overdue: !r.status.isFinal && !!r.expectedAt && r.expectedAt < now,
      warrantyDays: r.warrantyDays,
      warrantyUntil: r.warrantyUntil?.toISOString() ?? null,
      underWarranty: !!r.warrantyUntil && r.warrantyUntil >= now,
      isWarrantyClaim: r.isWarrantyClaim,
      parentRepairId: r.parentRepairId,
      parentRepairNumber: parent?.number ?? null,
      receiveSignature: MediaService.url(r.receiveSignature),
      deliverySignature: MediaService.url(r.deliverySignature),
      createdBy: name(r.userId) ?? '',
      parts: r.parts.map((p) => ({ id: p.id, variantId: p.variantId, name: p.name, qty: p.qty, unitCost: canCost ? p.unitCost : null, unitPrice: p.unitPrice, returnedAt: p.returnedAt?.toISOString() ?? null })),
      payments: r.payments.map((p) => ({ id: p.id, method: p.method, amount: p.amount, createdAt: p.createdAt.toISOString(), userName: name(p.userId) })),
      history: r.statusHistory.map((h) => ({ id: h.id, fromStatusId: h.fromStatusId, toStatusId: h.toStatusId, note: h.note, userName: name(h.userId), createdAt: h.createdAt.toISOString() })),
      photos: r.photos.map((p) => ({ id: p.id, kind: p.kind, url: MediaService.url(p.filePath)!, createdAt: p.createdAt.toISOString() }))
    }
  }

  async findByNumber(number: string, actor: Actor): Promise<RepairDto | null> {
    const r = await this.db.repair.findFirst({ where: { number: number.toUpperCase(), deletedAt: null } })
    return r ? this.get(r.id, actor) : null
  }
}
