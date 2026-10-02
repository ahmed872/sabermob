import { safeStorage } from 'electron'
import { plainKeyProtector, type KeyProtector } from '../backup/backup-service'

/**
 * Protects the local backup key with the OS account (DPAPI on Windows,
 * Keychain on macOS, libsecret on Linux). Falls back to an unprotected copy
 * when no OS keystore exists; backups themselves stay password-encrypted.
 */
export function osKeyProtector(): KeyProtector {
  if (!safeStorage.isEncryptionAvailable()) return plainKeyProtector
  return {
    kind: 'os',
    protect: (data) => safeStorage.encryptString(data.toString('base64')).toString('base64'),
    unprotect: (blob) => Buffer.from(safeStorage.decryptString(Buffer.from(blob, 'base64')), 'base64')
  }
}
