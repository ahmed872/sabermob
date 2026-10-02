import { z } from 'zod'
import {
  purchaseQuerySchema,
  purchaseReceiveSchema,
  purchaseReturnSchema,
  purchaseSaveSchema,
  supplierPaymentSchema,
  supplierQuerySchema,
  supplierSaveSchema
} from '@shared/schemas/suppliers'
import {
  repairCreateSchema,
  repairPartSchema,
  repairPaymentSchema,
  repairPhotoSchema,
  repairQuerySchema,
  repairStatusSaveSchema,
  repairStatusSchema,
  repairUpdateSchema
} from '@shared/schemas/repairs'
import { byId, empty, id, optText } from '@shared/schemas/common'
import { offerSaveSchema, suggestSchema } from '@shared/schemas/offers'
import { AppError } from '@shared/errors'
import type { ApiRouter } from '../router'

export function registerModuleHandlers(r: ApiRouter): void {
  // ───────────── suppliers ─────────────
  const viewSuppliers = ['manage_suppliers', 'view_supplier_balances', 'manage_purchases', 'pay_suppliers'] as const
  r.handle('suppliers.list', { input: supplierQuerySchema, permission: [...viewSuppliers] }, (input, { app }) => app.suppliers.list(input))
  r.handle('suppliers.get', { input: byId, permission: [...viewSuppliers] }, (input, { app }) => app.suppliers.get(input.id))
  r.handle('suppliers.save', { input: supplierSaveSchema, permission: 'manage_suppliers' }, (input, { app, actor }) => app.suppliers.save(input, actor!))
  r.handle('suppliers.delete', { input: byId, permission: 'manage_suppliers' }, async (input, { app, actor }) => {
    await app.suppliers.delete(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('suppliers.ledger', { input: byId, permission: ['view_supplier_balances', 'pay_suppliers'] }, (input, { app }) => app.suppliers.ledger(input.id))
  r.handle('suppliers.payments', { input: byId, permission: ['view_supplier_balances', 'pay_suppliers'] }, (input, { app }) => app.suppliers.payments(input.id))
  r.handle('suppliers.pay', { input: supplierPaymentSchema, permission: 'pay_suppliers' }, (input, { app, actor }) => app.suppliers.pay(input, actor!))
  r.handle('suppliers.voidPayment', { input: z.object({ id, reason: z.string().trim().min(2).max(200) }), permission: 'pay_suppliers' }, async (input, { app, actor }) => {
    await app.suppliers.voidPayment(input.id, input.reason, actor!)
    return { ok: true as const }
  })
  r.handle('purchases.list', { input: purchaseQuerySchema, permission: ['manage_purchases', 'view_supplier_balances'] }, (input, { app }) => app.suppliers.listPurchases(input))
  r.handle('purchases.get', { input: byId, permission: ['manage_purchases', 'view_supplier_balances'] }, (input, { app }) => app.suppliers.getPurchase(input.id))
  r.handle('purchases.create', { input: purchaseSaveSchema, permission: 'manage_purchases' }, (input, { app, actor }) => {
    if (input.payment?.amount && !actor!.permissions.has('pay_suppliers')) throw new AppError('FORBIDDEN', 'Paying suppliers is not allowed', { permission: 'pay_suppliers' })
    return app.suppliers.createPurchase(input, actor!)
  })
  r.handle('purchases.receive', { input: purchaseReceiveSchema, permission: 'manage_purchases' }, (input, { app, actor }) => app.suppliers.receive(input, actor!))
  r.handle('purchases.cancel', { input: byId, permission: 'manage_purchases' }, (input, { app, actor }) => app.suppliers.cancelPurchase(input.id, actor!))
  r.handle('purchases.return', { input: purchaseReturnSchema, permission: 'manage_purchases' }, (input, { app, actor }) => app.suppliers.returnToSupplier(input, actor!))

  // ───────────── repairs ─────────────
  r.handle('repairs.statuses', { input: empty, permission: null }, (_i, { app }) => app.repairs.statuses())
  r.handle('repairs.saveStatus', { input: repairStatusSaveSchema, permission: 'manage_settings' }, (input, { app, actor }) => app.repairs.saveStatus(input, actor!))
  r.handle('repairs.list', { input: repairQuerySchema, permission: 'view_repairs' }, (input, { app }) => app.repairs.list(input))
  r.handle('repairs.get', { input: byId, permission: 'view_repairs' }, (input, { app, actor }) => app.repairs.get(input.id, actor))
  r.handle('repairs.create', { input: repairCreateSchema, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.create(input, actor!))
  r.handle('repairs.update', { input: repairUpdateSchema, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.update(input, actor!))
  r.handle('repairs.setStatus', { input: repairStatusSchema, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.changeStatus(input, actor!))
  r.handle('repairs.addPart', { input: repairPartSchema, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.addPart(input, actor!))
  r.handle('repairs.removePart', { input: z.object({ id, restock: z.boolean() }), permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.removePart(input.id, input.restock, actor!))
  r.handle('repairs.addPayment', { input: repairPaymentSchema, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.addPayment(input.repairId, input.amount, input.method, actor!))
  r.handle('repairs.addPhoto', { input: repairPhotoSchema, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.addPhoto(input.repairId, input.kind, input.dataUrl, input.note ?? null, actor!))
  r.handle('repairs.removePhoto', { input: byId, permission: 'manage_repairs' }, (input, { app, actor }) => app.repairs.removePhoto(input.id, actor!))
  r.handle('repairs.delete', { input: byId, permission: 'delete_repair' }, async (input, { app, actor }) => {
    await app.repairs.delete(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('repairs.passcode', { input: byId, permission: 'view_device_passcode' }, async (input, { app, actor }) => ({ passcode: await app.repairs.revealPasscode(input.id, actor!) }))
  r.handle('repairs.checkWarranty', { input: z.object({ imei: optText, phone: optText, model: optText }), permission: 'view_repairs' }, (input, { app }) =>
    app.repairs.checkWarranty(input)
  )
  r.handle('repairs.technicians', { input: empty, permission: 'view_repairs' }, async (_i, { app }) => {
    const users = await app.db.user.findMany({
      where: { isActive: true, deletedAt: null, role: { permissions: { some: { permissionKey: 'manage_repairs' } } } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' }
    })
    return users
  })
}

export function registerOfferHandlers(r: ApiRouter): void {
  r.handle('offers.list', { input: empty, permission: ['manage_offers', 'view_offer_analytics'] }, (_i, { app }) => app.offers.list())
  r.handle('offers.save', { input: offerSaveSchema, permission: 'manage_offers' }, (input, { app, actor }) => app.offers.save(input, actor!))
  r.handle('offers.delete', { input: byId, permission: 'manage_offers' }, async (input, { app, actor }) => {
    await app.offers.remove(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('offers.suggest', { input: suggestSchema, permission: 'create_sale' }, (input, { app }) => app.offers.suggest(input))
  r.handle('offers.analytics', { input: z.object({ from: z.string().optional(), to: z.string().optional() }), permission: 'view_offer_analytics' }, (input, { app }) =>
    app.offers.analytics(input.from, input.to)
  )
  r.handle('offers.insights', { input: empty, permission: ['manage_offers', 'view_reports'] }, (_i, { app }) => app.offers.insights())
}
