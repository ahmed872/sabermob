import { z } from 'zod'
import { ALL_PERMISSIONS, type PermissionKey } from '../permissions'
import { SETTINGS_GROUPS, type SettingsGroup } from '../settings'
import { id, optText, shortText } from './common'

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'username')
const password = z.string().min(6).max(128)
const pin = z.string().regex(/^\d{4,8}$/)

export const onboardingSchema = z.object({
  language: z.enum(['ar', 'en']),
  currency: z.string().length(3),
  store: z.object({
    name: z.string().trim().min(1).max(120),
    phone: optText,
    address: optText,
    taxNumber: optText
  }),
  taxEnabled: z.boolean().default(false),
  taxBp: z.number().int().min(0).max(10000).default(1400),
  owner: z.object({
    fullName: z.string().trim().min(2).max(80),
    username,
    password,
    pin: pin.nullish()
  }),
  backupPassword: z.string().min(6).max(128).nullish(),
  printer: z.object({ name: z.string().max(200), paper: z.enum(['58mm', '80mm', 'A4']) }).nullish(),
  starterCatalog: z.boolean().default(true)
})
export type OnboardingInput = z.input<typeof onboardingSchema>

export const loginSchema = z.object({
  userId: id.optional(),
  username: z.string().trim().max(64).optional(),
  secret: z.string().min(1).max(128),
  method: z.enum(['PASSWORD', 'PIN'])
})
export type LoginInput = z.input<typeof loginSchema>

export const overrideSchema = loginSchema.extend({
  permission: z.enum(ALL_PERMISSIONS as [PermissionKey, ...PermissionKey[]]),
  reason: z.string().max(200).optional()
})
export type OverrideInput = z.input<typeof overrideSchema>

export const permissionKey = z.enum(ALL_PERMISSIONS as [PermissionKey, ...PermissionKey[]])

export const userCreateSchema = z.object({
  username,
  fullName: z.string().trim().min(2).max(80),
  phone: optText,
  password,
  pin: pin.nullish(),
  roleId: id
})
export type UserCreateInput = z.input<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  id,
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: optText.optional(),
  roleId: id.optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
  pin: pin.nullable().optional()
})
export type UserUpdateInput = z.input<typeof userUpdateSchema>

export const roleSaveSchema = z.object({
  id: id.optional(),
  name: shortText.pipe(z.string().min(2)),
  description: optText,
  maxDiscountBp: z.number().int().min(0).max(10000),
  permissions: z.array(permissionKey).max(200)
})
export type RoleSaveInput = z.input<typeof roleSaveSchema>

export const settingsUpdateSchema = z.object({
  group: z.enum(SETTINGS_GROUPS as [SettingsGroup, ...SettingsGroup[]]),
  values: z.record(z.string(), z.unknown())
})
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>

export const auditQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  userId: id.optional(),
  action: z.string().max(60).optional(),
  entity: z.string().max(60).optional(),
  entityId: id.optional()
})
export type AuditQueryInput = z.input<typeof auditQuerySchema>

export const activateSchema = z.object({ key: z.string().trim().min(100).max(200) })
export type ActivateInput = z.input<typeof activateSchema>

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password })
export const setPinSchema = z.object({ currentPassword: z.string().min(1).max(128), pin: pin.nullable() })
