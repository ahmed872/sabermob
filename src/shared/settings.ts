import { z } from 'zod'

/**
 * Settings are stored per group (one row per group in the Setting table).
 * Every field has a default so a fresh or partially-written group is always
 * valid; unknown/old keys are stripped on read.
 */
export const settingsSchemas = {
  general: z.object({
    language: z.enum(['ar', 'en']).default('ar'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    onboardingComplete: z.boolean().default(false)
  }),
  company: z.object({
    storeName: z.string().max(120).default(''),
    phone: z.string().max(40).default(''),
    phone2: z.string().max(40).default(''),
    address: z.string().max(300).default(''),
    taxNumber: z.string().max(60).default(''),
    commercialRegister: z.string().max(60).default(''),
    logoPath: z.string().nullable().default(null),
    currency: z.string().min(3).max(3).default('EGP'),
    currencyDecimals: z.number().int().min(0).max(3).default(2)
  }),
  pos: z.object({
    defaultSaleMode: z.enum(['QUICK', 'INVOICE']).default('QUICK'),
    requireShift: z.boolean().default(true),
    allowNegativeStock: z.boolean().default(false),
    defaultPaymentMethod: z.enum(['CASH', 'CARD', 'WALLET', 'TRANSFER']).default('CASH'),
    autoPrintReceipt: z.boolean().default(false),
    enabledPaymentMethods: z.array(z.enum(['CASH', 'CARD', 'WALLET', 'TRANSFER'])).default(['CASH', 'CARD', 'WALLET']),
    allowCreditSales: z.boolean().default(true),
    quickAmounts: z.array(z.number().int()).default([5000, 10000, 20000, 50000]),
    scanSound: z.boolean().default(true)
  }),
  taxes: z.object({
    enabled: z.boolean().default(false),
    defaultTaxBp: z.number().int().min(0).max(10000).default(1400),
    pricesIncludeTax: z.boolean().default(true),
    taxLabel: z.string().max(30).default('VAT')
  }),
  inventory: z.object({
    defaultMinStock: z.number().int().min(0).default(2),
    deadStockDays: z.number().int().min(7).max(720).default(90),
    fastMovingDays: z.number().int().min(1).max(90).default(30),
    internalBarcodePrefix: z.string().regex(/^\d{1,4}$/).default('20')
  }),
  repairs: z.object({
    defaultWarrantyDays: z.number().int().min(0).max(3650).default(30),
    requireSignature: z.boolean().default(false),
    defaultExpectedDays: z.number().int().min(0).max(60).default(2),
    termsText: z.string().max(2000).default('')
  }),
  printing: z.object({
    receiptPaper: z.enum(['58mm', '80mm', 'A4']).default('80mm'),
    receiptPrinter: z.string().nullable().default(null),
    a4Printer: z.string().nullable().default(null),
    labelPrinter: z.string().nullable().default(null),
    labelWidthMm: z.number().int().min(20).max(100).default(40),
    labelHeightMm: z.number().int().min(15).max(80).default(25),
    copies: z.number().int().min(1).max(5).default(1),
    showLogo: z.boolean().default(true)
  }),
  invoices: z.object({
    footerText: z.string().max(500).default(''),
    showCashier: z.boolean().default(true),
    showTaxNumber: z.boolean().default(true)
  }),
  qr: z.object({
    enabled: z.boolean().default(true),
    onInvoices: z.boolean().default(true),
    onReceipts: z.boolean().default(false),
    onRepairs: z.boolean().default(true),
    onLabels: z.boolean().default(false)
  }),
  offers: z.object({
    enabled: z.boolean().default(true),
    maxSuggestions: z.number().int().min(1).max(3).default(2),
    minMarginBp: z.number().int().min(0).max(10000).default(500),
    clearanceMaxDiscountBp: z.number().int().min(0).max(9000).default(2000),
    useAffinity: z.boolean().default(true)
  }),
  loyalty: z.object({
    enabled: z.boolean().default(false),
    /** amount (minor units) that earns one point */
    amountPerPoint: z.number().int().min(1).default(1000),
    /** value of one point (minor units) when redeemed */
    pointValue: z.number().int().min(1).default(10),
    minRedeemPoints: z.number().int().min(0).default(100),
    vipThresholdPoints: z.number().int().min(0).default(2000)
  }),
  backup: z.object({
    autoEnabled: z.boolean().default(true),
    intervalHours: z.number().int().min(1).max(24 * 7).default(24),
    keepCount: z.number().int().min(1).max(365).default(14),
    directory: z.string().nullable().default(null),
    mirrorDirectory: z.string().nullable().default(null),
    backupOnExit: z.boolean().default(true)
  }),
  security: z.object({
    sessionTimeoutMinutes: z.number().int().min(0).max(480).default(15),
    maxFailedAttempts: z.number().int().min(3).max(20).default(5),
    lockoutMinutes: z.number().int().min(1).max(120).default(5),
    requireApprovalForRefund: z.boolean().default(true)
  }),
  sync: z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().nullable().default(null)
  })
} as const

export type SettingsGroup = keyof typeof settingsSchemas
export type SettingsOf<G extends SettingsGroup> = z.infer<(typeof settingsSchemas)[G]>
export type AllSettings = { [G in SettingsGroup]: SettingsOf<G> }
export const SETTINGS_GROUPS = Object.keys(settingsSchemas) as SettingsGroup[]

export function parseSettings<G extends SettingsGroup>(group: G, raw: unknown): SettingsOf<G> {
  const schema = settingsSchemas[group] as unknown as z.ZodType<SettingsOf<G>>
  const res = schema.safeParse(raw ?? {})
  if (res.success) return res.data
  // Fall back field-by-field: keep valid values, default the rest.
  const base = schema.parse({}) as Record<string, unknown>
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!(k in base)) continue
      const attempt = schema.safeParse({ ...base, [k]: v })
      if (attempt.success) base[k] = v
    }
  }
  return base as SettingsOf<G>
}

export function defaultSettings(): AllSettings {
  const out = {} as Record<string, unknown>
  for (const g of SETTINGS_GROUPS) out[g] = parseSettings(g, {})
  return out as AllSettings
}
