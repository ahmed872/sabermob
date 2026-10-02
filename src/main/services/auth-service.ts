import { randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { AppError } from '@shared/errors'
import type { PermissionKey } from '@shared/permissions'
import type { SessionInfo } from '@shared/types/auth'
import type { Db } from '../database/client'
import type { Loggers } from '../core/logger'
import type { AuditService } from './audit-service'
import type { SettingsService } from './settings-service'

export interface Actor {
  userId: string
  username: string
  fullName: string
  roleId: string
  roleName: string
  roleKey: string | null
  permissions: Set<PermissionKey>
  maxDiscountBp: number
  sessionId: string
}

interface OverrideGrant {
  permissions: PermissionKey[]
  maxDiscountBp: number
  approverId: string
  approverName: string
  sessionId: string
  expiresAt: number
}

const BCRYPT_ROUNDS = 10
const OVERRIDE_TTL_MS = 2 * 60 * 1000
let dummyHash: Promise<string> | null = null

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_ROUNDS)
}

export function validatePasswordStrength(password: string): boolean {
  return password.length >= 6 && password.length <= 128
}

export function validatePin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

/**
 * Local authentication and the single active session of this window.
 * The session lives in the main process; the renderer never holds
 * credentials or tokens that grant access by themselves.
 */
export class AuthService {
  #actor: Actor | null = null
  #locked = false
  #lastActivity = 0
  #overrides = new Map<string, OverrideGrant>()
  #listeners: Array<() => void> = []

  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly log: Loggers,
    private readonly now: () => Date
  ) {}

  onChange(fn: () => void): void {
    this.#listeners.push(fn)
  }

  #emit(): void {
    for (const l of this.#listeners) l()
  }

  currentActor(): Actor | null {
    return this.#actor
  }

  isLocked(): boolean {
    return this.#locked
  }

  touch(): void {
    this.#lastActivity = this.now().getTime()
  }

  sessionInfo(): SessionInfo | null {
    const a = this.#actor
    if (!a) return null
    return {
      userId: a.userId,
      username: a.username,
      fullName: a.fullName,
      roleName: a.roleName,
      roleKey: a.roleKey,
      permissions: [...a.permissions],
      maxDiscountBp: a.maxDiscountBp,
      locked: this.#locked,
      sessionId: a.sessionId
    }
  }

  async #loadActor(userId: string, sessionId: string): Promise<Actor> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } }
    })
    if (!user || !user.isActive || user.deletedAt) throw new AppError('UNAUTHENTICATED')
    return {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: user.role.name,
      roleKey: user.role.systemKey,
      permissions: new Set(user.role.permissions.map((p) => p.permissionKey as PermissionKey)),
      maxDiscountBp: user.role.maxDiscountBp,
      sessionId
    }
  }

  /** Re-reads permissions (after role edits) without ending the session. */
  async refreshActor(): Promise<void> {
    if (this.#actor) this.#actor = await this.#loadActor(this.#actor.userId, this.#actor.sessionId)
    this.#emit()
  }

  async #verify(userId: string | null, username: string | null, secret: string, method: 'PASSWORD' | 'PIN') {
    const user = await this.db.user.findFirst({
      where: userId ? { id: userId, deletedAt: null } : { username: (username ?? '').trim().toLowerCase(), deletedAt: null }
    })
    const sec = this.settings.get('security')
    const nowMs = this.now().getTime()
    if (!user || !user.isActive) {
      // equalize timing with a dummy compare to avoid user enumeration by timing
      dummyHash ??= bcrypt.hash('timing-equalizer', BCRYPT_ROUNDS)
      await bcrypt.compare(secret, await dummyHash)
      this.log.security.warn('Login failed: unknown or inactive user', { username, method })
      throw new AppError('INVALID_CREDENTIALS')
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > nowMs) {
      throw new AppError('ACCOUNT_LOCKED', 'Account temporarily locked', {
        minutes: Math.ceil((user.lockedUntil.getTime() - nowMs) / 60000)
      })
    }
    const hash = method === 'PIN' ? user.pinHash : user.passwordHash
    const ok = hash ? await bcrypt.compare(secret, hash) : false
    if (!ok) {
      const attempts = user.failedAttempts + 1
      const lock = attempts >= sec.maxFailedAttempts
      await this.db.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(nowMs + sec.lockoutMinutes * 60000) : user.lockedUntil
        }
      })
      this.log.security.warn('Login failed: bad credentials', { userId: user.id, method, attempts })
      await this.audit.log({ userId: user.id, action: 'auth.failed', entity: 'User', entityId: user.id, metadata: { method } })
      if (lock) throw new AppError('ACCOUNT_LOCKED', 'Account temporarily locked', { minutes: sec.lockoutMinutes })
      throw new AppError('INVALID_CREDENTIALS')
    }
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await this.db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } })
    }
    return user
  }

  async login(input: { username?: string; userId?: string; secret: string; method: 'PASSWORD' | 'PIN' }): Promise<SessionInfo> {
    const user = await this.#verify(input.userId ?? null, input.username ?? null, input.secret, input.method)
    const previous = this.#actor
    if (previous) await this.#endSession(previous.userId === user.id ? 'LOGOUT' : 'SWITCH')
    const session = await this.db.session.create({ data: { userId: user.id, method: input.method } })
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: this.now() } })
    this.#actor = await this.#loadActor(user.id, session.id)
    this.#locked = false
    this.touch()
    await this.audit.log({
      userId: user.id,
      action: previous ? 'auth.switch_user' : 'auth.login',
      entity: 'Session',
      entityId: session.id,
      metadata: { method: input.method, from: previous?.userId ?? null }
    })
    this.log.security.info('Login', { userId: user.id, method: input.method })
    this.#emit()
    return this.sessionInfo()!
  }

  /** Unlock by the same user (PIN or password). Another user = switch. */
  async unlock(input: { userId: string; secret: string; method: 'PASSWORD' | 'PIN' }): Promise<SessionInfo> {
    if (!this.#actor || this.#actor.userId !== input.userId) return this.login(input)
    await this.#verify(input.userId, null, input.secret, input.method)
    this.#locked = false
    this.touch()
    await this.audit.log({ userId: input.userId, action: 'auth.unlock', entity: 'Session', entityId: this.#actor.sessionId })
    this.#emit()
    return this.sessionInfo()!
  }

  lock(reason: 'MANUAL' | 'TIMEOUT' = 'MANUAL'): void {
    if (!this.#actor || this.#locked) return
    this.#locked = true
    this.#overrides.clear()
    this.log.security.info('Session locked', { userId: this.#actor.userId, reason })
    this.#emit()
  }

  /** Called periodically; locks the session after the configured idle time. */
  checkIdle(): boolean {
    const minutes = this.settings.get('security').sessionTimeoutMinutes
    if (!this.#actor || this.#locked || minutes <= 0) return false
    if (this.now().getTime() - this.#lastActivity > minutes * 60000) {
      this.lock('TIMEOUT')
      return true
    }
    return false
  }

  async logout(): Promise<void> {
    if (!this.#actor) return
    const userId = this.#actor.userId
    await this.#endSession('LOGOUT')
    await this.audit.log({ userId, action: 'auth.logout' })
    this.#emit()
  }

  async #endSession(reason: string): Promise<void> {
    const a = this.#actor
    if (!a) return
    await this.db.session.update({ where: { id: a.sessionId }, data: { endedAt: this.now(), endReason: reason } })
    this.#actor = null
    this.#locked = false
    this.#overrides.clear()
  }

  async shutdown(): Promise<void> {
    if (this.#actor) await this.#endSession('APP_EXIT')
  }

  /** Close sessions left open by a crash (called on startup). */
  async closeStaleSessions(): Promise<number> {
    const res = await this.db.session.updateMany({ where: { endedAt: null }, data: { endedAt: this.now(), endReason: 'CRASH_RECOVERY' } })
    return res.count
  }

  /**
   * A manager/owner authorizes one sensitive action for the current
   * cashier without logging them out. Returns a short-lived single-use token.
   */
  async requestOverride(input: {
    username?: string
    userId?: string
    secret: string
    method: 'PASSWORD' | 'PIN'
    permission: PermissionKey
    permissions?: PermissionKey[]
    reason?: string
  }): Promise<{ token: string; approverName: string }> {
    const current = this.#actor
    if (!current) throw new AppError('UNAUTHENTICATED')
    const approver = await this.#verify(input.userId ?? null, input.username ?? null, input.secret, input.method)
    const approverActor = await this.#loadActor(approver.id, current.sessionId)
    const wanted = [...new Set([input.permission, ...(input.permissions ?? [])])]
    const lacking = wanted.find((p) => !approverActor.permissions.has(p))
    if (lacking) throw new AppError('FORBIDDEN', 'Approver lacks permission', { permission: lacking })
    const token = randomBytes(24).toString('base64url')
    this.#overrides.set(token, {
      permissions: wanted,
      maxDiscountBp: approverActor.maxDiscountBp,
      approverId: approver.id,
      approverName: approver.fullName,
      sessionId: current.sessionId,
      expiresAt: this.now().getTime() + OVERRIDE_TTL_MS
    })
    await this.audit.log({
      userId: approver.id,
      action: 'auth.override_granted',
      metadata: { permissions: wanted, forUserId: current.userId, reason: input.reason ?? null }
    })
    this.log.security.info('Override granted', { approverId: approver.id, forUserId: current.userId, permissions: wanted })
    return { token, approverName: approver.fullName }
  }

  /** Validates and consumes an override token covering `permissions`. */
  consumeOverride(token: string | null | undefined, permissions: PermissionKey[], discountBp = 0): { approverId: string } | null {
    if (!token || !this.#actor) return null
    for (const [key, grant] of this.#overrides) {
      const a = Buffer.from(key)
      const b = Buffer.from(token)
      if (a.length === b.length && timingSafeEqual(a, b)) {
        this.#overrides.delete(key)
        if (grant.expiresAt < this.now().getTime()) return null
        if (grant.sessionId !== this.#actor.sessionId) return null
        if (!permissions.every((p) => grant.permissions.includes(p))) return null
        if (discountBp > grant.maxDiscountBp) return null
        return { approverId: grant.approverId }
      }
    }
    return null
  }

  /**
   * Checks the actor holds every permission in `permissions` (and may give
   * `discountBp`), or that a manager approved them with `overrideToken`.
   * Returns the approver id when an approval was used, null otherwise.
   * Throws OVERRIDE_REQUIRED listing everything that needs approval.
   */
  authorizeAll(actor: Actor, permissions: PermissionKey[], overrideToken?: string | null, opts: { discountBp?: number } = {}): string | null {
    const missing = [...new Set(permissions)].filter((p) => !actor.permissions.has(p))
    const discountBp = opts.discountBp ?? 0
    const discountExceeded = discountBp > actor.maxDiscountBp
    if (missing.length === 0 && !discountExceeded) return null
    const needed = discountExceeded && !missing.includes('apply_discount') ? [...missing, 'apply_discount' as PermissionKey] : missing
    const grant = this.consumeOverride(overrideToken, needed, discountExceeded ? discountBp : 0)
    if (grant) return grant.approverId
    throw new AppError('OVERRIDE_REQUIRED', 'Manager approval required', { permission: needed[0], permissions: needed, discountBp: discountExceeded ? discountBp : undefined })
  }

  authorize(actor: Actor, permission: PermissionKey, overrideToken?: string | null): string | null {
    return this.authorizeAll(actor, [permission], overrideToken)
  }

  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    const a = this.#actor
    if (!a) throw new AppError('UNAUTHENTICATED')
    await this.#verify(a.userId, null, currentPassword, 'PASSWORD')
    if (!validatePasswordStrength(newPassword)) throw new AppError('VALIDATION', 'Weak password', { field: 'password' })
    await this.db.user.update({ where: { id: a.userId }, data: { passwordHash: await hashSecret(newPassword) } })
    await this.audit.log({ userId: a.userId, action: 'user.password_changed', entity: 'User', entityId: a.userId })
  }

  async setOwnPin(currentPassword: string, pin: string | null): Promise<void> {
    const a = this.#actor
    if (!a) throw new AppError('UNAUTHENTICATED')
    await this.#verify(a.userId, null, currentPassword, 'PASSWORD')
    if (pin !== null && !validatePin(pin)) throw new AppError('VALIDATION', 'PIN must be 4-8 digits', { field: 'pin' })
    await this.db.user.update({ where: { id: a.userId }, data: { pinHash: pin ? await hashSecret(pin) : null } })
    await this.audit.log({ userId: a.userId, action: 'user.pin_changed', entity: 'User', entityId: a.userId })
  }
}
