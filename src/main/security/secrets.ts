import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { SettingsService } from '../services/settings-service'

/**
 * Workspace master secret (random, stored in the workspace so it moves with
 * exports). Purpose-specific keys are derived with HKDF so a key used for QR
 * signatures can never decrypt passcodes and vice versa.
 */
export class SecretsService {
  #master: Buffer | null = null

  constructor(private readonly settings: SettingsService) {}

  async init(): Promise<void> {
    const stored = await this.settings.getRaw('secret.workspace')
    if (stored) {
      this.#master = Buffer.from(stored, 'base64')
      return
    }
    this.#master = randomBytes(32)
    await this.settings.setRaw('secret.workspace', this.#master.toString('base64'))
  }

  key(purpose: 'qr-signing' | 'field-encryption'): Buffer {
    if (!this.#master) throw new Error('Secrets not initialized')
    return Buffer.from(hkdfSync('sha256', this.#master, Buffer.from('central-pro'), Buffer.from(purpose), 32))
  }

  /** AES-256-GCM: returns base64(iv|tag|ciphertext). */
  encrypt(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key('field-encryption'), iv)
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
  }

  decrypt(blob: string): string {
    const raw = Buffer.from(blob, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', this.key('field-encryption'), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  }
}
