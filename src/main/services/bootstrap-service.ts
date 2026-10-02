import { randomUUID } from 'node:crypto'
import { AppError } from '@shared/errors'
import { ALL_PERMISSIONS, DEFAULT_ROLE_DISCOUNT_BP, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from '@shared/permissions'
import { CURRENCY_DECIMALS } from '@shared/money'
import type { OnboardingInput } from '@shared/schemas/system'
import type { Db } from '../database/client'
import type { AuditService } from './audit-service'
import { hashSecret, validatePasswordStrength } from './auth-service'
import type { SettingsService } from './settings-service'
import type { CatalogService } from './catalog-service'

const REPAIR_STATUSES = [
  { key: 'RECEIVED', name: 'Received', nameAr: 'تم الاستلام', color: '#3b82f6' },
  { key: 'DIAGNOSING', name: 'Diagnosing', nameAr: 'جاري الفحص', color: '#8b5cf6' },
  { key: 'WAITING_CUSTOMER', name: 'Waiting for customer', nameAr: 'في انتظار موافقة العميل', color: '#f59e0b' },
  { key: 'WAITING_PARTS', name: 'Waiting for parts', nameAr: 'في انتظار قطع الغيار', color: '#f97316' },
  { key: 'REPAIRING', name: 'Repairing', nameAr: 'جاري الإصلاح', color: '#0ea5e9' },
  { key: 'TESTING', name: 'Testing', nameAr: 'اختبار', color: '#14b8a6' },
  { key: 'READY', name: 'Ready for pickup', nameAr: 'جاهز للتسليم', color: '#22c55e' },
  { key: 'DELIVERED', name: 'Delivered', nameAr: 'تم التسليم', color: '#64748b', isFinal: true },
  { key: 'CANCELLED', name: 'Cancelled', nameAr: 'ملغي', color: '#ef4444', isFinal: true }
] as const

const ROLE_NAMES: Record<string, { en: string; ar: string }> = {
  OWNER: { en: 'Owner', ar: 'المالك' },
  MANAGER: { en: 'Manager', ar: 'مدير' },
  CASHIER: { en: 'Cashier', ar: 'كاشير' },
  TECHNICIAN: { en: 'Technician', ar: 'فني صيانة' },
  ACCOUNTANT: { en: 'Accountant', ar: 'محاسب' },
  INVENTORY_MANAGER: { en: 'Inventory manager', ar: 'مسؤول المخزن' }
}

const STARTER = {
  categories: [
    { en: 'Cases', ar: 'جرابات', kind: 'ACCESSORY', color: '#6366f1', icon: 'smartphone' },
    { en: 'Screen protectors', ar: 'اسكرينات', kind: 'ACCESSORY', color: '#0ea5e9', icon: 'shield' },
    { en: 'Chargers', ar: 'شواحن', kind: 'ACCESSORY', color: '#f59e0b', icon: 'plug' },
    { en: 'Cables', ar: 'كابلات', kind: 'ACCESSORY', color: '#14b8a6', icon: 'cable' },
    { en: 'Earphones & headphones', ar: 'سماعات', kind: 'ACCESSORY', color: '#ec4899', icon: 'headphones' },
    { en: 'Power banks', ar: 'باور بانك', kind: 'ACCESSORY', color: '#84cc16', icon: 'battery' },
    { en: 'Memory cards', ar: 'كروت ميموري', kind: 'ACCESSORY', color: '#a855f7', icon: 'memory' },
    { en: 'Smart watches', ar: 'ساعات ذكية', kind: 'ACCESSORY', color: '#f43f5e', icon: 'watch' },
    { en: 'Mobile phones', ar: 'موبايلات', kind: 'DEVICE', color: '#2563eb', icon: 'phone' },
    { en: 'Used phones', ar: 'موبايلات مستعملة', kind: 'DEVICE', color: '#64748b', icon: 'phone' },
    { en: 'Spare parts', ar: 'قطع غيار', kind: 'PART', color: '#78716c', icon: 'cpu' },
    { en: 'Repair services', ar: 'خدمات الصيانة', kind: 'SERVICE', color: '#10b981', icon: 'wrench' }
  ],
  brands: ['Samsung', 'Apple', 'Xiaomi', 'Oppo', 'Realme', 'Vivo', 'Huawei', 'Honor', 'Infinix', 'Tecno', 'Nokia', 'Anker', 'Joyroom'],
  services: [
    { en: 'Screen replacement', ar: 'تغيير شاشة', warrantyDays: 30 },
    { en: 'Battery replacement', ar: 'تغيير بطارية', warrantyDays: 90 },
    { en: 'Charging port repair', ar: 'إصلاح سوكت الشحن', warrantyDays: 30 },
    { en: 'Software / flashing', ar: 'سوفت وير', warrantyDays: 7 },
    { en: 'Data transfer', ar: 'نقل بيانات', warrantyDays: 0 },
    { en: 'Cleaning', ar: 'تنظيف', warrantyDays: 0 },
    { en: 'Unlocking', ar: 'فك شفرة', warrantyDays: 0 }
  ]
} as const

/**
 * Idempotent startup seeding (permissions, built-in roles, repair statuses,
 * device registration) and the first-launch onboarding transaction.
 */
export class BootstrapService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly deviceId: string,
    private readonly catalog: () => CatalogService
  ) {}

  async ensureSeed(deviceName: string, platform: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.device.upsert({
        where: { id: this.deviceId },
        create: { id: this.deviceId, name: deviceName, platform, isCurrent: true },
        update: { lastSeenAt: new Date(), isCurrent: true, name: deviceName }
      })
      await tx.device.updateMany({ where: { id: { not: this.deviceId } }, data: { isCurrent: false } })
      for (const key of ALL_PERMISSIONS) {
        await tx.permission.upsert({ where: { key }, create: { key, group: PERMISSIONS[key] }, update: { group: PERMISSIONS[key] } })
      }
      // Remove permissions no longer defined in code.
      await tx.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSIONS } } })
      for (const systemKey of SYSTEM_ROLES) {
        const existing = await tx.role.findUnique({ where: { systemKey } })
        if (!existing) {
          const lang = this.settings.get('general').language
          await tx.role.create({
            data: {
              name: ROLE_NAMES[systemKey]![lang],
              systemKey,
              maxDiscountBp: DEFAULT_ROLE_DISCOUNT_BP[systemKey],
              permissions: { create: DEFAULT_ROLE_PERMISSIONS[systemKey].map((permissionKey) => ({ permissionKey })) }
            }
          })
        } else if (systemKey === 'OWNER') {
          // The owner always has every permission, including ones added by upgrades.
          for (const permissionKey of ALL_PERMISSIONS) {
            await tx.rolePermission.upsert({
              where: { roleId_permissionKey: { roleId: existing.id, permissionKey } },
              create: { roleId: existing.id, permissionKey },
              update: {}
            })
          }
        }
      }
      for (const [i, s] of REPAIR_STATUSES.entries()) {
        await tx.repairStatus.upsert({
          where: { key: s.key },
          create: { ...s, sortOrder: i * 10, isSystem: true, isFinal: 'isFinal' in s ? s.isFinal : false },
          update: { isSystem: true }
        })
      }
    })
  }

  async needsOnboarding(): Promise<boolean> {
    if (!this.settings.get('general').onboardingComplete) return true
    return (await this.db.user.count({ where: { deletedAt: null } })) === 0
  }

  /** First-launch setup: store info, preferences and the owner account. */
  async completeOnboarding(input: OnboardingInput): Promise<void> {
    if (!(await this.needsOnboarding())) throw new AppError('INVALID_STATE', 'Already set up')
    if (!validatePasswordStrength(input.owner.password)) throw new AppError('VALIDATION', 'Weak password', { field: 'password' })
    const ownerRole = await this.db.role.findUniqueOrThrow({ where: { systemKey: 'OWNER' } })
    const passwordHash = await hashSecret(input.owner.password)
    const pinHash = input.owner.pin ? await hashSecret(input.owner.pin) : null
    const lang = input.language

    await this.db.$transaction(async (tx) => {
      await this.settings.update('general', { language: lang, onboardingComplete: true }, undefined, tx)
      await this.settings.update(
        'company',
        {
          storeName: input.store.name,
          phone: input.store.phone ?? '',
          address: input.store.address ?? '',
          taxNumber: input.store.taxNumber ?? '',
          currency: input.currency,
          currencyDecimals: CURRENCY_DECIMALS[input.currency] ?? 2
        },
        undefined,
        tx
      )
      await this.settings.update('taxes', { enabled: input.taxEnabled, defaultTaxBp: input.taxBp }, undefined, tx)
      if (input.printer) {
        await this.settings.update('printing', { receiptPrinter: input.printer.name, receiptPaper: input.printer.paper }, undefined, tx)
      }
      // Rename built-in roles to the chosen language.
      for (const [key, names] of Object.entries(ROLE_NAMES)) {
        await tx.role.updateMany({ where: { systemKey: key }, data: { name: names[lang] } })
      }
      const owner = await tx.user.create({
        data: {
          username: input.owner.username.trim().toLowerCase(),
          fullName: input.owner.fullName.trim(),
          passwordHash,
          pinHash,
          roleId: ownerRole.id,
          language: lang
        }
      })
      await this.audit.log({ userId: owner.id, action: 'system.onboarding_completed', metadata: { currency: input.currency, language: lang } }, tx)
    })

    if (input.starterCatalog) await this.seedStarterCatalog(lang)
  }

  async seedStarterCatalog(lang: 'ar' | 'en'): Promise<void> {
    const catalog = this.catalog()
    await this.db.$transaction(async (tx) => {
      for (const [i, c] of STARTER.categories.entries()) {
        const exists = await tx.category.findFirst({ where: { name: c[lang], deletedAt: null } })
        if (!exists) await tx.category.create({ data: { name: c[lang], kind: c.kind, color: c.color, icon: c.icon, sortOrder: i } })
      }
      for (const [i, name] of STARTER.brands.entries()) {
        const exists = await tx.brand.findFirst({ where: { name, deletedAt: null } })
        if (!exists) await tx.brand.create({ data: { name, sortOrder: i } })
      }
    })
    const serviceCategory = await this.db.category.findFirst({ where: { kind: 'SERVICE', deletedAt: null } })
    for (const s of STARTER.services) {
      const exists = await this.db.product.findFirst({ where: { name: s[lang], type: 'SERVICE', deletedAt: null } })
      if (exists) continue
      await catalog.createProduct(
        {
          type: 'SERVICE',
          name: s[lang],
          altName: s[lang === 'ar' ? 'en' : 'ar'],
          categoryId: serviceCategory?.id ?? null,
          trackStock: false,
          warrantyDays: s.warrantyDays,
          variants: [{ sellPrice: 0, costPrice: 0, barcodes: [], openingStock: 0 }]
        },
        null
      )
    }
  }

  static newDeviceId(): string {
    return randomUUID()
  }
}
