import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { LicensePlatform } from '../license/license-service'

const REG_KEY = 'HKCU\\Software\\CentralPro'

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 })
}

/**
 * OS-level machine identity and a trial marker stored outside the app data
 * folder (Windows registry / hidden file), so deleting the data folder or
 * reinstalling does not restart the trial.
 */
export class OsLicensePlatform implements LicensePlatform {
  #cached: string | null = null

  constructor(private readonly fallbackDir: string) {}

  machineIdentifier(): string {
    if (this.#cached) return this.#cached
    let id: string | null = null
    try {
      if (process.platform === 'win32') {
        const out = run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'])
        id = /MachineGuid\s+REG_SZ\s+([\w-]+)/i.exec(out)?.[1] ?? null
      } else if (process.platform === 'darwin') {
        const out = run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])
        id = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)?.[1] ?? null
      } else {
        for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
          if (existsSync(f)) {
            id = readFileSync(f, 'utf8').trim() || null
            if (id) break
          }
        }
      }
    } catch {
      id = null
    }
    if (!id) {
      // Last resort: a persistent random id (still machine-local).
      const file = join(this.fallbackDir, 'machine.id')
      if (existsSync(file)) id = readFileSync(file, 'utf8').trim()
      else {
        id = randomUUID()
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, id)
      }
    }
    this.#cached = id
    return id
  }

  #markerFile(): string {
    return join(homedir(), process.platform === 'darwin' ? 'Library/Application Support/.central-pro-m' : '.config/.central-pro-m')
  }

  readMarker(): string | null {
    if (process.platform === 'win32') {
      try {
        const out = run('reg', ['query', REG_KEY, '/v', 'M'])
        return /\sM\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null
      } catch {
        return null
      }
    }
    const f = this.#markerFile()
    return existsSync(f) ? readFileSync(f, 'utf8').trim() : null
  }

  writeMarker(value: string): void {
    if (process.platform === 'win32') {
      run('reg', ['add', REG_KEY, '/v', 'M', '/t', 'REG_SZ', '/d', value, '/f'])
      return
    }
    const f = this.#markerFile()
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, value)
  }
}
