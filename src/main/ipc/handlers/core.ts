import { statSync } from 'node:fs'
import { z } from 'zod'
import { AppError } from '@shared/errors'
import { settingsSchemas, type SettingsGroup } from '@shared/settings'
import {
  activateSchema,
  auditQuerySchema,
  changePasswordSchema,
  loginSchema,
  onboardingSchema,
  overrideSchema,
  roleSaveSchema,
  setPinSchema,
  settingsUpdateSchema,
  userCreateSchema,
  userUpdateSchema
} from '@shared/schemas/system'
import {
  brandSaveSchema,
  categorySaveSchema,
  deviceModelSaveSchema,
  movementQuerySchema,
  posSearchSchema,
  productQuerySchema,
  productSaveSchema,
  stockAdjustSchema
} from '@shared/schemas/catalog'
import { byId, empty, id } from '@shared/schemas/common'
import type { ApiRouter } from '../router'
import type { Actor } from '../../services/auth-service'

export interface CoreHandlerDeps {
  appVersion: string
  platform: string
  openPath: (path: string) => Promise<void>
  listPrinters: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
}

const canCost = (a: Actor | null) => !!a?.permissions.has('view_cost')

export function registerCoreHandlers(r: ApiRouter, deps: CoreHandlerDeps): void {
  // ───────────── system ─────────────
  r.handle('system.info', { input: empty, public: true, allowUnlicensed: true }, async (_i, { app }) => {
    let dbSizeBytes = 0
    try {
      dbSizeBytes = statSync(app.paths.database).size
    } catch {
      dbSizeBytes = 0
    }
    const general = app.settings.get('general')
    return {
      appVersion: deps.appVersion,
      platform: deps.platform,
      deviceId: app.deviceId,
      needsOnboarding: await app.bootstrap.needsOnboarding(),
      dataDir: app.paths.root,
      dbSizeBytes,
      migrationApplied: app.migration.applied,
      language: general.language,
      theme: general.theme,
      storeName: app.settings.get('company').storeName
    }
  })

  r.handle('system.onboard', { input: onboardingSchema, public: true, allowUnlicensed: true }, async (input, { app }) => {
    try {
      await app.bootstrap.completeOnboarding(input)
    } catch (err) {
      await app.settings.load() // drop cached values from a rolled-back transaction
      throw err
    }
    // Backups are encrypted from day one (owner password unless a separate one was chosen).
    await app.backup.setPassword(input.backupPassword ?? input.owner.password, null)
    return { ok: true as const }
  })

  r.handle('system.openDataFolder', { input: empty, permission: 'manage_backups', allowUnlicensed: true, skipGate: true }, async (_i, { app }) => {
    await deps.openPath(app.paths.root)
    return { ok: true as const }
  })

  r.handle('system.printers', { input: empty, public: true, allowUnlicensed: true, skipGate: true }, () => deps.listPrinters())

  // ───────────── license ─────────────
  r.handle('license.state', { input: empty, public: true, allowUnlicensed: true }, (_i, { app }) => app.license.state())
  r.handle('license.activate', { input: activateSchema, public: true, allowUnlicensed: true }, async (input, { app }) => {
    // Activation is allowed on the lock/expiry screen, but once users exist
    // it must be done by someone with manage_license (or before onboarding).
    const actor = app.auth.currentActor()
    if (!(await app.bootstrap.needsOnboarding()) && actor && !actor.permissions.has('manage_license')) throw new AppError('FORBIDDEN')
    return app.license.activate(input.key, actor?.userId ?? null)
  })

  // ───────────── auth ─────────────
  r.handle('auth.loginTiles', { input: empty, public: true, allowUnlicensed: true }, (_i, { app }) => app.users.loginTiles())
  r.handle('auth.login', { input: loginSchema, public: true, allowUnlicensed: true }, (input, { app }) => app.auth.login(input))
  r.handle('auth.unlock', { input: loginSchema.extend({ userId: id }), public: true, allowUnlicensed: true }, (input, { app }) => app.auth.unlock(input))
  r.handle('auth.session', { input: empty, public: true, allowUnlicensed: true }, (_i, { app }) => app.auth.sessionInfo())
  r.handle('auth.lock', { input: empty, allowLocked: true, allowUnlicensed: true }, (_i, { app }) => {
    app.auth.lock('MANUAL')
    return { ok: true as const }
  })
  r.handle('auth.logout', { input: empty, allowLocked: true, allowUnlicensed: true }, async (_i, { app }) => {
    await app.auth.logout()
    return { ok: true as const }
  })
  r.handle('auth.heartbeat', { input: empty, allowLocked: true, allowUnlicensed: true, skipGate: true }, (_i, { app }) => ({
    locked: app.auth.isLocked()
  }))
  r.handle('auth.override', { input: overrideSchema }, (input, { app }) => app.auth.requestOverride(input))
  r.handle('auth.changePassword', { input: changePasswordSchema, allowUnlicensed: true }, async (input, { app }) => {
    await app.auth.changeOwnPassword(input.currentPassword, input.newPassword)
    return { ok: true as const }
  })
  r.handle('auth.setPin', { input: setPinSchema, allowUnlicensed: true }, async (input, { app }) => {
    await app.auth.setOwnPin(input.currentPassword, input.pin)
    return { ok: true as const }
  })

  // ───────────── users & roles ─────────────
  r.handle('users.list', { input: empty, permission: 'manage_users' }, (_i, { app }) => app.users.list())
  r.handle('users.create', { input: userCreateSchema, permission: 'manage_users' }, (input, { app, actor }) => app.users.create(input, actor!))
  r.handle('users.update', { input: userUpdateSchema, permission: 'manage_users' }, async (input, { app, actor }) => {
    const res = await app.users.update(input, actor!)
    if (input.id === actor!.userId) await app.auth.refreshActor()
    return res
  })
  r.handle('roles.list', { input: empty, permission: ['manage_users', 'manage_settings'] }, (_i, { app }) => app.users.listRoles())
  r.handle('roles.save', { input: roleSaveSchema, permission: 'manage_users' }, async (input, { app, actor }) => {
    const res = await app.users.saveRole(input, actor!)
    await app.auth.refreshActor()
    return res
  })
  r.handle('roles.delete', { input: byId, permission: 'manage_users' }, async (input, { app, actor }) => {
    await app.users.deleteRole(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('audit.list', { input: auditQuerySchema, permission: 'view_audit_log' }, (input, { app }) => app.users.auditLog(input))

  // ───────────── settings ─────────────
  r.handle('settings.get', { input: empty, public: true, allowUnlicensed: true }, (_i, { app }) => app.settings.all())
  r.handle('settings.update', { input: settingsUpdateSchema, permission: 'manage_settings' }, async (input, { app, actor }) => {
    const group = input.group as SettingsGroup
    // Validate strictly so bad values are rejected rather than defaulted.
    const schema = settingsSchemas[group] as unknown as z.ZodObject
    const parsed = schema.partial().safeParse(input.values)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'Invalid settings', { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) })
    }
    if (group === 'general' && 'onboardingComplete' in parsed.data) delete (parsed.data as Record<string, unknown>).onboardingComplete
    if (group === 'backup') {
      if (!actor!.permissions.has('manage_backups')) throw new AppError('FORBIDDEN', 'Permission denied', { permission: 'manage_backups' })
      // Folders are only chosen through the OS picker (backup.chooseFolder), never sent as raw paths.
      delete (parsed.data as Record<string, unknown>).directory
      delete (parsed.data as Record<string, unknown>).mirrorDirectory
    }
    const before = app.settings.get(group)
    const next = await app.settings.update(group, parsed.data as never, actor!.userId)
    await app.audit.log({
      userId: actor!.userId,
      action: 'settings.changed',
      entity: 'Setting',
      entityId: group,
      metadata: { group, changed: Object.keys(parsed.data).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((next as Record<string, unknown>)[k])) }
    })
    return next
  })

  // ───────────── catalog ─────────────
  r.handle('catalog.brands', { input: empty, permission: null }, (_i, { app }) => app.catalog.listBrands())
  r.handle('catalog.saveBrand', { input: brandSaveSchema, permission: 'manage_inventory' }, (input, { app, actor }) => app.catalog.saveBrand(input, actor!))
  r.handle('catalog.deleteBrand', { input: byId, permission: 'manage_inventory' }, async (input, { app, actor }) => {
    await app.catalog.deleteBrand(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('catalog.models', { input: z.object({ brandId: id.optional() }), permission: null }, (input, { app }) => app.catalog.listModels(input.brandId))
  r.handle('catalog.saveModel', { input: deviceModelSaveSchema, permission: 'manage_inventory' }, (input, { app, actor }) => app.catalog.saveModel(input, actor!))
  r.handle('catalog.deleteModel', { input: byId, permission: 'manage_inventory' }, async (input, { app, actor }) => {
    await app.catalog.deleteModel(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('catalog.categories', { input: empty, permission: null }, (_i, { app }) => app.catalog.listCategories())
  r.handle('catalog.saveCategory', { input: categorySaveSchema, permission: 'manage_inventory' }, (input, { app, actor }) =>
    app.catalog.saveCategory(input, actor!)
  )
  r.handle('catalog.deleteCategory', { input: byId, permission: 'manage_inventory' }, async (input, { app, actor }) => {
    await app.catalog.deleteCategory(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('catalog.list', { input: productQuerySchema, permission: ['view_inventory', 'create_sale'] }, (input, { app, actor }) =>
    app.catalog.listVariants(input, canCost(actor))
  )
  r.handle('catalog.posSearch', { input: posSearchSchema, permission: ['create_sale', 'view_inventory', 'manage_repairs'] }, (input, { app, actor }) =>
    app.catalog.posSearch(input, canCost(actor))
  )
  r.handle('catalog.findByCode', { input: z.object({ code: z.string().trim().min(1).max(64) }), permission: null }, (input, { app, actor }) =>
    app.catalog.findByCode(input.code, canCost(actor))
  )
  r.handle('catalog.variant', { input: byId, permission: null }, (input, { app, actor }) => app.catalog.getVariantItem(input.id, canCost(actor)))
  r.handle('catalog.product', { input: byId, permission: 'view_inventory' }, (input, { app, actor }) => app.catalog.getProduct(input.id, canCost(actor)))
  r.handle('catalog.saveProduct', { input: productSaveSchema, permission: 'manage_inventory' }, (input, { app, actor }) => {
    // Without view_cost a user cannot see costs, so they must not overwrite them.
    if (!canCost(actor) && input.id) throw new AppError('FORBIDDEN', 'Editing products requires cost access', { permission: 'view_cost' })
    return input.id ? app.catalog.updateProduct({ ...input, id: input.id }, actor!) : app.catalog.createProduct(input, actor)
  })
  r.handle('catalog.deleteProduct', { input: byId, permission: 'manage_inventory' }, async (input, { app, actor }) => {
    await app.catalog.deleteProduct(input.id, actor!)
    return { ok: true as const }
  })
  r.handle('catalog.toggleFavorite', { input: z.object({ id, isFavorite: z.boolean() }), permission: ['manage_inventory', 'create_sale'] }, async (input, { app }) => {
    await app.catalog.toggleFavorite(input.id, input.isFavorite)
    return { ok: true as const }
  })
  r.handle('catalog.generateBarcode', { input: empty, permission: 'manage_inventory' }, async (_i, { app }) => ({ code: await app.catalog.generateBarcode() }))
  r.handle('catalog.serials', { input: z.object({ variantId: id }), permission: ['create_sale', 'view_inventory'] }, (input, { app, actor }) =>
    app.catalog.serialsInStock(input.variantId, canCost(actor))
  )

  // ───────────── inventory ─────────────
  r.handle('inventory.adjust', { input: stockAdjustSchema, permission: 'modify_stock' }, (input, { app, actor }) => app.inventory.adjust(input, actor!))
  r.handle('inventory.movements', { input: movementQuerySchema, permission: 'view_inventory' }, (input, { app, actor }) =>
    app.inventory.movements(input, canCost(actor))
  )
  r.handle('inventory.alerts', { input: empty, permission: null }, (_i, { app }) => app.inventory.alerts())
  r.handle('inventory.valuation', { input: empty, permission: 'view_cost' }, (_i, { app }) => app.inventory.valuation())
}
