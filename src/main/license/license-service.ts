import { createHash, createHmac, createPublicKey, verify } from 'node:crypto'
import { AppError } from '@shared/errors'
import {
  bytesEqual,
  decodePayload,
  encodeRequestCode,
  licenseExpiry,
  signingMessage,
  splitActivationKey,
  type PaidTier
} from '@shared/license-codec'
import type { LicenseState } from '@shared/types/license'
import type { Db } from '../database/client'
import type { Loggers } from '../core/logger'
import type { AuditService } from '../services/audit-service'

export const TRIAL_DAYS = 15
/** Days a timed license keeps working after expiry (offline grace). */
export const GRACE_DAYS = 3
/** Clock may drift backwards this much before we treat it as rollback. */
const CLOCK_TOLERANCE_MS = 2 * 60 * 60 * 1000
const DAY_MS = 86_400_000

export const TIER_LIMITS: Record<'TRIAL' | PaidTier, { maxUsers: number }> = {
  TRIAL: { maxUsers: 10 },
  BASIC: { maxUsers: 3 },
  PROFESSIONAL: { maxUsers: 15 },
  ENTERPRISE: { maxUsers: 1000 }
}

/** Platform hooks so the service is testable outside Electron. */
export interface LicensePlatform {
  /** stable hardware/OS identifier of this PC */
  machineIdentifier(): string
  /** secondary trial marker outside the workspace (registry/file) */
  readMarker(): string | null
  writeMarker(value: string): void
}

interface StoredLicense {
  tier: PaidTier
  expiresAt: Date | null
  serial: number
  issuedAt: Date
}

/**
 * 15-day trial followed by offline activation with Ed25519-signed keys
 * bound to this machine. Business data is never locked: when the license
 * is not valid, the IPC router blocks business operations but keeps
 * activation, backup and export available.
 */
export class LicenseService {
  #machineId!: Uint8Array
  #trialStart!: Date
  #lastSeen!: Date
  #clockTampered = false
  #license: StoredLicense | null = null
  #publicKey: ReturnType<typeof createPublicKey>
  #listeners: Array<() => void> = []

  constructor(
    private readonly db: Db,
    private readonly platform: LicensePlatform,
    private readonly audit: AuditService,
    private readonly log: Loggers,
    private readonly now: () => Date,
    publicKeyPem: string
  ) {
    this.#publicKey = createPublicKey(publicKeyPem)
  }

  onChange(fn: () => void): void {
    this.#listeners.push(fn)
  }

  /** 8-byte machine id derived from the OS identifier (never the raw value). */
  static deriveMachineId(identifier: string): Uint8Array {
    return new Uint8Array(createHash('sha256').update(`central-pro:machine:${identifier}`).digest().subarray(0, 8))
  }

  #sealKey(): Buffer {
    return createHash('sha256').update(Buffer.from(this.#machineId)).update('central-pro:seal:v1').digest()
  }

  #seal(value: string): string {
    const mac = createHmac('sha256', this.#sealKey()).update(value).digest('base64url').slice(0, 22)
    return `${value}.${mac}`
  }

  #unseal(sealed: string | null | undefined): string | null {
    if (!sealed) return null
    const idx = sealed.lastIndexOf('.')
    if (idx <= 0) return null
    const value = sealed.slice(0, idx)
    return this.#seal(value) === sealed ? value : null
  }

  async #readSetting(key: string): Promise<string | null> {
    return (await this.db.setting.findUnique({ where: { key } }))?.value ?? null
  }

  async #writeSetting(key: string, value: string): Promise<void> {
    await this.db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }

  async init(): Promise<void> {
    this.#machineId = LicenseService.deriveMachineId(this.platform.machineIdentifier())
    const now = this.now()

    // Trial start: earliest valid value from the DB and the external marker.
    const candidates: Date[] = []
    const fromDb = this.#unseal(await this.#readSetting('license.trialStartedAt'))
    let fromMarker: string | null = null
    try {
      fromMarker = this.#unseal(this.platform.readMarker())
    } catch (err) {
      this.log.app.warn('Trial marker unreadable', { err: String(err) })
    }
    for (const v of [fromDb, fromMarker]) {
      const d = v ? new Date(v) : null
      if (d && !Number.isNaN(d.getTime())) candidates.push(d)
    }
    this.#trialStart = candidates.length ? new Date(Math.min(...candidates.map((d) => d.getTime()))) : now
    const sealedStart = this.#seal(this.#trialStart.toISOString())
    if (!fromDb || fromDb !== this.#trialStart.toISOString()) await this.#writeSetting('license.trialStartedAt', sealedStart)
    try {
      if (fromMarker !== this.#trialStart.toISOString()) this.platform.writeMarker(sealedStart)
    } catch (err) {
      this.log.app.warn('Trial marker not writable', { err: String(err) })
    }

    // Clock rollback detection.
    const lastSeenRaw = this.#unseal(await this.#readSetting('license.lastSeenAt'))
    const lastSeen = lastSeenRaw ? new Date(lastSeenRaw) : null
    this.#lastSeen = lastSeen && !Number.isNaN(lastSeen.getTime()) ? lastSeen : now
    if (now.getTime() + CLOCK_TOLERANCE_MS < this.#lastSeen.getTime()) {
      this.#clockTampered = true
      this.log.security.warn('System clock is behind last recorded time', { now: now.toISOString(), lastSeen: this.#lastSeen.toISOString() })
    }
    await this.heartbeat()
    await this.#loadLicense()
  }

  async #loadLicense(): Promise<void> {
    const row = await this.db.license.findFirst({ where: { isActive: true }, orderBy: { installedAt: 'desc' } })
    this.#license = null
    if (!row?.licenseKey) return
    const parsed = this.#verifyKey(row.licenseKey)
    if (!parsed.ok) {
      this.log.security.warn('Stored license is not valid for this machine', { reason: parsed.reason })
      return
    }
    this.#license = parsed.license
  }

  #verifyKey(key: string): { ok: true; license: StoredLicense } | { ok: false; reason: 'FORMAT' | 'SIGNATURE' | 'MACHINE' } {
    const parts = splitActivationKey(key)
    if (!parts) return { ok: false, reason: 'FORMAT' }
    const payload = decodePayload(parts.payload)
    if (!payload) return { ok: false, reason: 'FORMAT' }
    let valid = false
    try {
      valid = verify(null, Buffer.from(signingMessage(parts.payload)), this.#publicKey, Buffer.from(parts.signature))
    } catch {
      valid = false
    }
    if (!valid) return { ok: false, reason: 'SIGNATURE' }
    if (!bytesEqual(payload.machineId, this.#machineId)) return { ok: false, reason: 'MACHINE' }
    return {
      ok: true,
      license: { tier: payload.tier, expiresAt: licenseExpiry(payload), serial: payload.serial, issuedAt: payload.issuedAt }
    }
  }

  /** Effective "now": never earlier than the last time the app ran. */
  #effectiveNow(): number {
    return Math.max(this.now().getTime(), this.#lastSeen.getTime())
  }

  async heartbeat(): Promise<void> {
    const now = this.now()
    if (now.getTime() > this.#lastSeen.getTime()) {
      this.#lastSeen = now
      this.#clockTampered = false
    }
    await this.#writeSetting('license.lastSeenAt', this.#seal(this.#lastSeen.toISOString()))
  }

  requestCode(): string {
    return encodeRequestCode(this.#machineId)
  }

  state(): LicenseState {
    const nowMs = this.#effectiveNow()
    const trialEnds = this.#trialStart.getTime() + TRIAL_DAYS * DAY_MS
    const base = {
      requestCode: this.requestCode(),
      clockWarning: this.#clockTampered,
      trialStartedAt: this.#trialStart.toISOString(),
      trialEndsAt: new Date(trialEnds).toISOString()
    }
    if (this.#license) {
      const exp = this.#license.expiresAt?.getTime() ?? null
      const daysLeft = exp === null ? null : Math.ceil((exp - nowMs) / DAY_MS)
      const inGrace = exp !== null && nowMs > exp && nowMs <= exp + GRACE_DAYS * DAY_MS
      const expired = exp !== null && nowMs > exp + GRACE_DAYS * DAY_MS
      return {
        ...base,
        status: expired ? 'EXPIRED' : 'ACTIVE',
        tier: this.#license.tier,
        operational: !expired,
        daysLeft,
        expiresAt: this.#license.expiresAt?.toISOString() ?? null,
        inGrace,
        serial: this.#license.serial,
        maxUsers: TIER_LIMITS[this.#license.tier].maxUsers
      }
    }
    const daysLeft = Math.max(0, Math.ceil((trialEnds - nowMs) / DAY_MS))
    const expired = nowMs >= trialEnds
    return {
      ...base,
      status: expired ? 'TRIAL_EXPIRED' : 'TRIAL',
      tier: 'TRIAL',
      operational: !expired,
      daysLeft,
      expiresAt: new Date(trialEnds).toISOString(),
      inGrace: false,
      serial: null,
      maxUsers: TIER_LIMITS.TRIAL.maxUsers
    }
  }

  isOperational(): boolean {
    return this.state().operational
  }

  maxUsers(): number {
    return this.state().maxUsers
  }

  async activate(key: string, userId: string | null): Promise<LicenseState> {
    const res = this.#verifyKey(key)
    if (!res.ok) {
      this.log.security.warn('Activation rejected', { reason: res.reason })
      throw new AppError('LICENSE_INVALID', 'Invalid activation key', { reason: res.reason })
    }
    const exp = res.license.expiresAt
    if (exp && exp.getTime() + GRACE_DAYS * DAY_MS < this.#effectiveNow()) {
      throw new AppError('LICENSE_INVALID', 'Activation key already expired', { reason: 'EXPIRED' })
    }
    const normalized = key.toUpperCase().replace(/[^0-9A-Z]/g, '')
    await this.db.$transaction(async (tx) => {
      await tx.license.updateMany({ where: { isActive: true }, data: { isActive: false } })
      await tx.license.create({
        data: {
          tier: res.license.tier,
          licenseKey: normalized,
          expiresAt: exp,
          lastValidatedAt: this.now(),
          isActive: true
        }
      })
      await this.audit.log(
        { userId, action: 'license.activated', entity: 'License', metadata: { tier: res.license.tier, serial: res.license.serial, expiresAt: exp?.toISOString() ?? null } },
        tx
      )
    })
    this.#license = res.license
    this.log.security.info('License activated', { tier: res.license.tier, serial: res.license.serial })
    for (const l of this.#listeners) l()
    return this.state()
  }
}
