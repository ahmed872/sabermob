import { randomBytes } from 'node:crypto'
import { AppError } from '@shared/errors'
import { bytesEqual, encodeRecoveryCode } from '@shared/license-codec'
import type { Db } from '../database/client'
import type { LicenseService } from '../license/license-service'
import { hashSecret, validatePasswordStrength, validatePin } from './auth-service'
import type { AuditService } from './audit-service'

const NONCE_KEY = 'auth.recoveryNonce'
/** A recovery key must be used within this many days of being issued. */
export const RECOVERY_KEY_DAYS = 7
const DAY_MS = 86_400_000

/**
 * Forgotten owner password, offline: the login screen shows a recovery code
 * (this PC + a one-time random number); the vendor signs it with the licensing
 * key; the key lets one owner account choose a new password. The random number
 * changes after every use, so a key works once, on this PC only.
 */
export class RecoveryService {
  constructor(
    private readonly db: Db,
    private readonly license: LicenseService,
    private readonly audit: AuditService,
    private readonly now: () => Date
  ) {}

  async #nonce(create: boolean): Promise<Uint8Array | null> {
    const row = await this.db.setting.findUnique({ where: { key: NONCE_KEY } })
    if (row?.value && /^[0-9a-f]{8}$/.test(row.value)) return new Uint8Array(Buffer.from(row.value, 'hex'))
    if (!create) return null
    const nonce = new Uint8Array(randomBytes(4))
    await this.db.setting.upsert({ where: { key: NONCE_KEY }, create: { key: NONCE_KEY, value: Buffer.from(nonce).toString('hex') }, update: { value: Buffer.from(nonce).toString('hex') } })
    return nonce
  }

  /** The code to send to the vendor, and the owner accounts it can reset. */
  async request(): Promise<{ code: string; owners: Array<{ username: string; fullName: string }> }> {
    const nonce = (await this.#nonce(true))!
    const owners = await this.db.user.findMany({
      where: { deletedAt: null, isActive: true, role: { systemKey: 'OWNER' } },
      orderBy: { createdAt: 'asc' },
      select: { username: true, fullName: true }
    })
    return { code: encodeRecoveryCode(this.license.machineId(), nonce), owners }
  }

  async recover(input: { key: string; username: string; password: string; pin?: string | null }): Promise<void> {
    const payload = this.license.verifyRecoveryKey(input.key)
    const nonce = await this.#nonce(false)
    if (!payload || !nonce || !bytesEqual(payload.nonce, nonce)) throw new AppError('LICENSE_INVALID', 'Recovery key not valid', { reason: 'RECOVERY_INVALID' })
    if (this.now().getTime() > payload.issuedAt.getTime() + (RECOVERY_KEY_DAYS + 1) * DAY_MS) {
      throw new AppError('LICENSE_INVALID', 'Recovery key expired', { reason: 'RECOVERY_EXPIRED' })
    }
    const user = await this.db.user.findFirst({ where: { username: input.username, deletedAt: null, role: { systemKey: 'OWNER' } } })
    if (!user) throw new AppError('NOT_FOUND', 'Owner account not found')
    if (!validatePasswordStrength(input.password)) throw new AppError('VALIDATION', 'Weak password', { reason: 'weakPassword', field: 'password' })
    if (input.pin && !validatePin(input.pin)) throw new AppError('VALIDATION', 'PIN must be 4-8 digits', { reason: 'pinDigits', field: 'pin' })
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashSecret(input.password), ...(input.pin ? { pinHash: await hashSecret(input.pin) } : {}), failedAttempts: 0, lockedUntil: null, isActive: true }
      })
      // one use only: the next request gets a new random number
      await tx.setting.delete({ where: { key: NONCE_KEY } })
      await this.audit.log({ userId: user.id, action: 'auth.password_recovered', entity: 'User', entityId: user.id }, tx)
    })
  }
}
