import type { PermissionKey } from '../permissions'

export interface SessionInfo {
  userId: string
  username: string
  fullName: string
  roleName: string
  roleKey: string | null
  permissions: PermissionKey[]
  maxDiscountBp: number
  locked: boolean
  sessionId: string
}

export interface LoginUserTile {
  id: string
  fullName: string
  username: string
  roleName: string
  hasPin: boolean
}

export interface UserDto {
  id: string
  username: string
  fullName: string
  phone: string | null
  roleId: string
  roleName: string
  isActive: boolean
  hasPin: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface RoleDto {
  id: string
  name: string
  systemKey: string | null
  description: string | null
  maxDiscountBp: number
  permissions: PermissionKey[]
  userCount: number
}

export interface AuditLogDto {
  id: string
  action: string
  entity: string | null
  entityId: string | null
  metadata: Record<string, unknown> | null
  userName: string | null
  createdAt: string
}
