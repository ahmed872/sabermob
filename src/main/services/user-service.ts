import { AppError } from '@shared/errors'
import type { PermissionKey } from '@shared/permissions'
import type { AuditQueryInput, RoleSaveInput, UserCreateInput, UserUpdateInput } from '@shared/schemas/system'
import type { AuditLogDto, LoginUserTile, RoleDto, UserDto } from '@shared/types/auth'
import type { Paged } from '@shared/types/catalog'
import type { Db } from '../database/client'
import type { Actor } from './auth-service'
import { hashSecret } from './auth-service'
import type { AuditService } from './audit-service'

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly maxUsers: () => number
  ) {}

  /** Users shown on the login screen (no sensitive data). */
  async loginTiles(): Promise<LoginUserTile[]> {
    const users = await this.db.user.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ lastLoginAt: 'desc' }, { fullName: 'asc' }],
      include: { role: { select: { name: true } } }
    })
    return users.map((u) => ({ id: u.id, fullName: u.fullName, username: u.username, roleName: u.role.name, hasPin: !!u.pinHash }))
  }

  async list(): Promise<UserDto[]> {
    const users = await this.db.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      include: { role: { select: { name: true } } }
    })
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      phone: u.phone,
      roleId: u.roleId,
      roleName: u.role.name,
      isActive: u.isActive,
      hasPin: !!u.pinHash,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString()
    }))
  }

  async #assertOwnerRemains(excludingUserId: string, newRoleId?: string, deactivating?: boolean): Promise<void> {
    const ownerRole = await this.db.role.findUnique({ where: { systemKey: 'OWNER' } })
    if (!ownerRole) return
    const target = await this.db.user.findUnique({ where: { id: excludingUserId } })
    if (!target || target.roleId !== ownerRole.id) return
    const losingOwner = deactivating || (newRoleId !== undefined && newRoleId !== ownerRole.id)
    if (!losingOwner) return
    const others = await this.db.user.count({
      where: { roleId: ownerRole.id, isActive: true, deletedAt: null, NOT: { id: excludingUserId } }
    })
    if (others === 0) throw new AppError('INVALID_STATE', 'At least one active owner is required')
  }

  async create(input: UserCreateInput, actor: Actor): Promise<UserDto> {
    const active = await this.db.user.count({ where: { isActive: true, deletedAt: null } })
    if (active >= this.maxUsers()) throw new AppError('LICENSE_REQUIRED', 'User limit reached for this license', { maxUsers: this.maxUsers() })
    const role = await this.db.role.findFirst({ where: { id: input.roleId, deletedAt: null } })
    if (!role) throw new AppError('NOT_FOUND', 'Role not found')
    if (role.systemKey === 'OWNER' && !actor.permissions.has('manage_users')) throw new AppError('FORBIDDEN')
    const user = await this.db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: input.username.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          phone: input.phone ?? null,
          passwordHash: await hashSecret(input.password),
          pinHash: input.pin ? await hashSecret(input.pin) : null,
          roleId: role.id
        }
      })
      await this.audit.log({ userId: actor.userId, action: 'user.created', entity: 'User', entityId: u.id, metadata: { username: u.username, role: role.name } }, tx)
      return u
    })
    return (await this.list()).find((u) => u.id === user.id)!
  }

  async update(input: UserUpdateInput, actor: Actor): Promise<UserDto> {
    const existing = await this.db.user.findUnique({ where: { id: input.id } })
    if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND')
    await this.#assertOwnerRemains(input.id, input.roleId, input.isActive === false)
    if (input.id === actor.userId && input.isActive === false) throw new AppError('INVALID_STATE', 'You cannot deactivate yourself')
    const data: Record<string, unknown> = {}
    if (input.fullName !== undefined) data.fullName = input.fullName.trim()
    if (input.phone !== undefined) data.phone = input.phone
    if (input.roleId !== undefined) data.roleId = input.roleId
    if (input.isActive !== undefined) data.isActive = input.isActive
    if (input.password) data.passwordHash = await hashSecret(input.password)
    if (input.pin !== undefined) data.pinHash = input.pin ? await hashSecret(input.pin) : null
    if (input.password || input.isActive) Object.assign(data, { failedAttempts: 0, lockedUntil: null })
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: input.id }, data })
      await this.audit.log(
        {
          userId: actor.userId,
          action: 'user.updated',
          entity: 'User',
          entityId: input.id,
          metadata: {
            fields: Object.keys(data).filter((k) => !/hash/i.test(k)),
            passwordReset: !!input.password,
            pinChanged: input.pin !== undefined,
            roleChanged: input.roleId !== undefined && input.roleId !== existing.roleId
          }
        },
        tx
      )
    })
    return (await this.list()).find((u) => u.id === input.id)!
  }

  async listRoles(): Promise<RoleDto[]> {
    const roles = await this.db.role.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { permissions: true, _count: { select: { users: { where: { deletedAt: null } } } } }
    })
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      systemKey: r.systemKey,
      description: r.description,
      maxDiscountBp: r.maxDiscountBp,
      permissions: r.permissions.map((p) => p.permissionKey as PermissionKey),
      userCount: r._count.users
    }))
  }

  async saveRole(input: RoleSaveInput, actor: Actor): Promise<RoleDto> {
    const id = await this.db.$transaction(async (tx) => {
      let roleId = input.id
      if (roleId) {
        const role = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: true } })
        if (!role || role.deletedAt) throw new AppError('NOT_FOUND')
        if (role.systemKey === 'OWNER') throw new AppError('INVALID_STATE', 'The owner role cannot be changed')
        await tx.role.update({ where: { id: roleId }, data: { name: input.name, description: input.description ?? null, maxDiscountBp: input.maxDiscountBp } })
        await tx.rolePermission.deleteMany({ where: { roleId } })
        const before = role.permissions.map((p) => p.permissionKey)
        await this.audit.log(
          {
            userId: actor.userId,
            action: 'role.permissions_changed',
            entity: 'Role',
            entityId: roleId,
            metadata: {
              added: input.permissions.filter((p) => !before.includes(p)),
              removed: before.filter((p) => !input.permissions.includes(p as PermissionKey)),
              maxDiscountBp: input.maxDiscountBp
            }
          },
          tx
        )
      } else {
        const created = await tx.role.create({ data: { name: input.name, description: input.description ?? null, maxDiscountBp: input.maxDiscountBp } })
        roleId = created.id
        await this.audit.log({ userId: actor.userId, action: 'role.created', entity: 'Role', entityId: roleId, metadata: { name: input.name, permissions: input.permissions } }, tx)
      }
      await tx.rolePermission.createMany({ data: [...new Set(input.permissions)].map((permissionKey) => ({ roleId: roleId!, permissionKey })) })
      return roleId
    })
    return (await this.listRoles()).find((r) => r.id === id)!
  }

  async deleteRole(id: string, actor: Actor): Promise<void> {
    const role = await this.db.role.findUnique({ where: { id }, include: { _count: { select: { users: { where: { deletedAt: null } } } } } })
    if (!role || role.deletedAt) throw new AppError('NOT_FOUND')
    if (role.systemKey) throw new AppError('INVALID_STATE', 'Built-in roles cannot be deleted')
    if (role._count.users > 0) throw new AppError('CONFLICT', 'Role has users', { count: role._count.users })
    await this.db.role.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ userId: actor.userId, action: 'role.deleted', entity: 'Role', entityId: id, metadata: { name: role.name } })
  }

  async auditLog(input: AuditQueryInput): Promise<Paged<AuditLogDto>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where = {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.action ? { action: { startsWith: input.action } } : {}),
      ...(input.entity ? { entity: input.entity } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {})
    }
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { fullName: true } } }
      }),
      this.db.auditLog.count({ where })
    ])
    return {
      items: rows.map((r) => {
        let metadata: Record<string, unknown> | null = null
        try {
          metadata = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null
        } catch {
          metadata = null
        }
        return {
          id: r.id,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          metadata,
          userName: r.user?.fullName ?? null,
          createdAt: r.createdAt.toISOString()
        }
      }),
      total,
      page,
      pageSize
    }
  }
}
