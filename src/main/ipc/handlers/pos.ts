import { z } from 'zod'
import { completeSaleSchema, holdCartSchema, refundSchema, saleQuerySchema, shiftQuerySchema, voidSaleSchema, openShiftSchema, closeShiftSchema, cashMovementSchema } from '@shared/schemas/sales'
import { collectDebtSchema, customerAdjustSchema, customerQuerySchema, customerSaveSchema, loyaltyAdjustSchema } from '@shared/schemas/customers'
import { byId, empty } from '@shared/schemas/common'
import { AppError } from '@shared/errors'
import type { ApiRouter } from '../router'

export function registerPosHandlers(r: ApiRouter): void {
  // ───────────── sales ─────────────
  r.handle('pos.complete', { input: completeSaleSchema, permission: 'create_sale' }, (input, { app, actor }) => app.sales.complete(input, actor!))
  // Refund/void permissions are checked inside (manager approval flow).
  r.handle('pos.refund', { input: refundSchema, permission: 'create_sale' }, (input, { app, actor }) => app.sales.refund(input, actor!))
  r.handle('pos.void', { input: voidSaleSchema, permission: 'create_sale' }, (input, { app, actor }) => app.sales.void(input, actor!))
  r.handle('pos.sale', { input: byId, permission: ['view_sales', 'create_sale'] }, async (input, { app, actor }) => {
    const sale = await app.sales.get(input.id, actor)
    if (!actor!.permissions.has('view_sales') && sale.cashierName !== actor!.fullName) throw new AppError('FORBIDDEN', 'Not your sale', { permission: 'view_sales' })
    return sale
  })
  r.handle('pos.findSale', { input: z.object({ number: z.string().trim().min(1).max(40) }), permission: ['view_sales', 'create_sale'] }, (input, { app, actor }) =>
    app.sales.findByNumber(input.number.toUpperCase(), actor!)
  )
  r.handle('pos.sales', { input: saleQuerySchema, permission: ['view_sales', 'create_sale'] }, (input, { app, actor }) => app.sales.list(input, actor!))
  r.handle('pos.hold', { input: holdCartSchema, permission: 'create_sale' }, (input, { app, actor }) => app.sales.hold(input, actor!))
  r.handle('pos.held', { input: empty, permission: 'create_sale' }, (_i, { app }) => app.sales.listHeld())
  r.handle('pos.takeHeld', { input: byId, permission: 'create_sale' }, (input, { app }) => app.sales.takeHeld(input.id))
  r.handle('pos.deleteHeld', { input: byId, permission: 'create_sale' }, async (input, { app }) => {
    await app.sales.deleteHeld(input.id)
    return { ok: true as const }
  })

  // ───────────── shifts ─────────────
  r.handle('shifts.current', { input: empty, permission: null }, async (_i, { app }) => {
    const s = await app.shifts.currentShift()
    return s ? app.shifts.summary(s.id) : null
  })
  r.handle('shifts.open', { input: openShiftSchema, permission: 'manage_shifts' }, (input, { app, actor }) => app.shifts.open(input.openingCash, actor!))
  r.handle('shifts.close', { input: closeShiftSchema, permission: 'manage_shifts' }, (input, { app, actor }) => app.shifts.close(input.countedCash, input.note ?? null, actor!))
  r.handle('shifts.cash', { input: cashMovementSchema, permission: 'manage_cash_drawer' }, (input, { app, actor }) => app.shifts.cashMovement(input, actor!))
  r.handle('shifts.list', { input: shiftQuerySchema, permission: 'view_all_shifts' }, (input, { app }) => app.shifts.list(input))
  r.handle('shifts.get', { input: byId, permission: ['view_all_shifts', 'manage_shifts'] }, (input, { app }) => app.shifts.summary(input.id))
  r.handle('shifts.review', { input: byId, permission: 'view_all_shifts' }, (input, { app, actor }) => app.shifts.review(input.id, actor!))

  // ───────────── customers ─────────────
  r.handle('customers.list', { input: customerQuerySchema, permission: 'view_customer_data' }, (input, { app }) => app.customers.list(input))
  r.handle('customers.find', { input: z.object({ q: z.string().max(60) }), permission: ['view_customer_data', 'create_sale'] }, (input, { app }) => app.customers.quickFind(input.q))
  r.handle('customers.get', { input: byId, permission: ['view_customer_data', 'create_sale'] }, (input, { app }) => app.customers.get(input.id))
  r.handle('customers.save', { input: customerSaveSchema, permission: 'manage_customers' }, (input, { app, actor }) => app.customers.save(input, actor!))
  r.handle('customers.delete', { input: byId, permission: 'manage_customers' }, async (input, { app, actor }) => {
    await app.customers.delete(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('customers.ledger', { input: byId, permission: 'view_customer_data' }, (input, { app }) => app.customers.ledger(input.id))
  r.handle('customers.collect', { input: collectDebtSchema, permission: 'collect_customer_debt' }, (input, { app, actor }) => app.customers.collectDebt(input, actor!))
  r.handle('customers.adjust', { input: customerAdjustSchema, permission: 'manage_settings' }, (input, { app, actor }) =>
    app.customers.adjustBalance(input.customerId, input.amount, input.note, actor!)
  )
  r.handle('customers.adjustPoints', { input: loyaltyAdjustSchema, permission: 'manage_customers' }, (input, { app, actor }) =>
    app.customers.adjustPoints(input.customerId, input.points, input.note, actor!)
  )
}
