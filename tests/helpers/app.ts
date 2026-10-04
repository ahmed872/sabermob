import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { AppContext } from '@main/app/context'
import { LicenseService, type LicensePlatform } from '@main/license/license-service'
import { encodePayload, formatActivationKey, signingMessage, type PaidTier } from '@shared/license-codec'
import type { OnboardingInput } from '@shared/schemas/system'

export const MIGRATIONS = resolve(__dirname, '../../prisma/migrations')

export class FakeLicensePlatform implements LicensePlatform {
  marker: string | null = null
  constructor(public machine = 'test-machine-guid') {}
  machineIdentifier() {
    return this.machine
  }
  readMarker() {
    return this.marker
  }
  writeMarker(v: string) {
    this.marker = v
  }
}

export interface TestApp {
  app: AppContext
  dir: string
  clock: { now: Date }
  platform: FakeLicensePlatform
  close: () => Promise<void>
  reopen: () => Promise<TestApp>
}

export async function createTestApp(opts: { dir?: string; clock?: { now: Date }; platform?: FakeLicensePlatform } = {}): Promise<TestApp> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'central-test-'))
  const clock = opts.clock ?? { now: new Date() }
  const platform = opts.platform ?? new FakeLicensePlatform()
  const app = await AppContext.create({
    rootDir: dir,
    migrationsDir: MIGRATIONS,
    deviceName: 'test',
    platformName: 'test',
    licensePlatform: platform,
    logToFiles: false,
    now: () => clock.now,
    // Tests sign keys with the development key (the app ships the production public key).
    publicKeyPem: readFileSync(resolve(__dirname, '../../scripts/license/dev-public-key.pem'), 'utf8')
  })
  const t: TestApp = {
    app,
    dir,
    clock,
    platform,
    close: async () => {
      await app.dispose()
    },
    reopen: async () => {
      await app.dispose()
      return createTestApp({ dir, clock, platform })
    }
  }
  return t
}

export function cleanup(t: TestApp): void {
  rmSync(t.dir, { recursive: true, force: true })
}

export const OWNER = { username: 'owner', password: 'owner-pass-1', pin: '1234', fullName: 'Shop Owner' }

export function onboardingInput(over: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    language: 'en',
    currency: 'EGP',
    store: { name: 'Test Mobile Shop', phone: '01000000000' },
    taxEnabled: false,
    taxBp: 1400,
    owner: { ...OWNER },
    starterCatalog: true,
    ...over
  }
}

/** Creates the owner and logs in. */
export async function setupOwner(t: TestApp, over: Partial<OnboardingInput> = {}): Promise<void> {
  await t.app.bootstrap.completeOnboarding(onboardingInput(over))
  await t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })
}

export function actor(t: TestApp) {
  const a = t.app.auth.currentActor()
  if (!a) throw new Error('not logged in')
  return a
}

/** Issues an activation key with the development private key. */
export function devActivationKey(machineIdentifier: string, tier: PaidTier = 'PROFESSIONAL', validDays = 0, issuedAt = new Date(), serial = 7): string {
  const pem = readFileSync(resolve(__dirname, '../../scripts/license/dev-private-key.pem'), 'utf8')
  const payload = encodePayload({ tier, machineId: LicenseService.deriveMachineId(machineIdentifier), issuedAt, validDays, serial })
  const sig = sign(null, Buffer.from(signingMessage(payload)), createPrivateKey(pem))
  return formatActivationKey(payload, new Uint8Array(sig))
}
