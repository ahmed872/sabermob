import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rawQuery } from '@main/database/client'
import { actor, cleanup, createTestApp, FakeLicensePlatform, setupOwner, type TestApp } from '../helpers/app'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PASSWORD = 'backup-pass-1'

let t: TestApp
const fileOf = (name: string) => join(t.app.backup.directory, name)
const product = (name: string) => t.app.catalog.createProduct({ type: 'ACCESSORY', name, variants: [{ sellPrice: 1000, costPrice: 500, openingStock: 3, barcodes: [] }] }, actor(t))

beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t)
})
afterAll(async () => {
  await t.close().catch(() => undefined)
  cleanup(t)
})

describe('encrypted backups', () => {
  it('refuses to back up before a backup password exists', async () => {
    const s = await t.app.backup.status()
    expect(s.configured).toBe(false)
    await expect(t.app.backup.create('MANUAL', null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
  })

  it('creates an encrypted archive that hides business data and verifies it', async () => {
    await t.app.backup.setPassword(PASSWORD, actor(t).userId)
    await product('Very Secret Charger 9000')
    const rec = await t.app.backup.create('MANUAL', actor(t).userId)
    expect(rec.status).toBe('SUCCESS')
    const bytes = readFileSync(fileOf(rec.fileName))
    expect(bytes.subarray(0, 4).toString()).toBe('CPBK')
    expect(bytes.includes(Buffer.from('Very Secret Charger'))).toBe(false)
    expect(bytes.includes(Buffer.from('SQLite format'))).toBe(false)
    const v = await t.app.backup.verify(rec.id)
    expect(v.ok).toBe(true)
    expect(v.counts.products).toBeGreaterThan(0)
    expect((await t.app.backup.list())[0]!.verifiedAt).not.toBeNull()
  })

  it('rejects wrong passwords and tampered files', async () => {
    const rec = (await t.app.backup.list()).find((r) => r.kind === 'MANUAL')!
    const info = await t.app.backup.inspectRecord(rec.id)
    expect(info.shopName).toBe('Test Mobile Shop')
    expect(info.newer).toBe(false)
    await expect(t.app.backup.restore(info.token, 'wrong-password', null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })

    const bad = join(t.dir, 'tampered.cpbak')
    const bytes = readFileSync(fileOf(rec.fileName))
    const at = Math.floor(bytes.length * 0.7)
    bytes[at] = bytes[at]! ^ 0xff
    writeFileSync(bad, bytes)
    const badInfo = t.app.backup.inspectFile(bad)
    await expect(t.app.backup.restore(badInfo.token, PASSWORD, null)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })

    const junk = join(t.dir, 'junk.cpbak')
    writeFileSync(junk, 'not a backup at all, just text that is long enough to pass size checks..........')
    expect(() => t.app.backup.inspectFile(junk)).toThrow(expect.objectContaining({ code: 'BACKUP_INVALID' }))
    // The failed restore attempts left the live data untouched.
    expect((await t.app.catalog.listVariants({ q: 'Very Secret', page: 1, pageSize: 10 }, true)).total).toBe(1)
  })

  it('refuses backups made by a newer version', async () => {
    await rawQuery(t.app.db, `INSERT INTO _app_migrations (name, checksum, appliedAt) VALUES ('9999_future', 'x', 'now')`)
    const rec = await t.app.backup.create('MANUAL', null)
    await rawQuery(t.app.db, `DELETE FROM _app_migrations WHERE name = '9999_future'`)
    const info = await t.app.backup.inspectRecord(rec.id)
    expect(info.newer).toBe(true)
    await expect(t.app.backup.restore(info.token, PASSWORD, null)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })

  it('runs automatic backups on schedule, keeps the newest N and mirrors them', async () => {
    const mirror = mkdtempSync(join(tmpdir(), 'central-mirror-'))
    await t.app.settings.update('backup', { keepCount: 2, intervalHours: 24, mirrorDirectory: mirror })
    t.clock.now = new Date(t.clock.now.getTime() + 25 * 3_600_000)
    expect(await t.app.backup.runAutoIfDue()).not.toBeNull()
    expect(await t.app.backup.runAutoIfDue()).toBeNull() // not due yet
    for (let i = 0; i < 2; i++) {
      t.clock.now = new Date(t.clock.now.getTime() + 25 * 3_600_000)
      expect(await t.app.backup.runAutoIfDue()).not.toBeNull()
    }
    const autos = (await t.app.backup.list()).filter((r) => r.kind === 'AUTO')
    expect(autos).toHaveLength(2)
    expect(autos.every((a) => a.exists)).toBe(true)
    expect(readdirSync(t.app.backup.directory).filter((f) => f.includes('-auto-'))).toHaveLength(2)
    expect(readdirSync(mirror).length).toBe(3)
    await t.app.settings.update('backup', { mirrorDirectory: null })
  })

  it('restores data and photos, keeping a pre-restore copy', async () => {
    const photo = t.app.media.saveDataUrl('products', PNG)
    const rec = await t.app.backup.create('MANUAL', actor(t).userId)
    await product('Added After Backup')
    const info = await t.app.backup.inspectRecord(rec.id)
    await t.app.backup.restore(info.token, PASSWORD, actor(t).userId)

    t = await createTestApp({ dir: t.dir, clock: t.clock, platform: t.platform })
    await t.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
    expect((await t.app.catalog.listVariants({ q: 'Added After', page: 1, pageSize: 10 }, true)).total).toBe(0)
    expect((await t.app.catalog.listVariants({ q: 'Very Secret', page: 1, pageSize: 10 }, true)).total).toBe(1)
    expect(existsSync(join(t.app.paths.media, photo))).toBe(true)
    const list = await t.app.backup.list()
    const pre = list.find((r) => r.kind === 'PRE_RESTORE')
    expect(pre?.exists).toBe(true)
    // The pre-restore copy still holds the newer product.
    const preInfo = await t.app.backup.inspectRecord(pre!.id)
    expect(preInfo.counts.products).toBe(info.counts.products! + 1)
    const audit = await rawQuery<{ action: string }>(t.app.db, `SELECT action FROM AuditLog WHERE action = 'backup.restored'`)
    expect(audit).toHaveLength(1)
    expect((await t.app.backup.status()).unlocked).toBe(true)
  })

  it('moves the whole shop to a new PC with a bundle and the password', async () => {
    const bundle = join(t.dir, 'shop.centralbundle')
    await t.app.backup.create('BUNDLE', null, bundle)

    const other = await createTestApp({ platform: new FakeLicensePlatform('another-pc') })
    try {
      expect(await other.app.bootstrap.needsOnboarding()).toBe(true)
      const info = other.app.backup.inspectFile(bundle)
      expect(info.kind).toBe('BUNDLE')
      await other.app.backup.restore(info.token, PASSWORD, null)
      const moved = await createTestApp({ dir: other.dir, platform: other.platform })
      try {
        expect(await moved.app.bootstrap.needsOnboarding()).toBe(false)
        expect(moved.app.settings.get('company').storeName).toBe('Test Mobile Shop')
        await moved.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
        expect((await moved.app.catalog.listVariants({ q: 'Very Secret', page: 1, pageSize: 10 }, true)).total).toBe(1)
        // The key was recovered from the password: automatic backups work here too.
        expect((await moved.app.backup.status()).unlocked).toBe(true)
        expect((await moved.app.backup.create('MANUAL', null)).status).toBe('SUCCESS')
      } finally {
        await moved.close()
      }
    } finally {
      cleanup(other)
    }
  })

  it('changing the password keeps older backups readable with the old one', async () => {
    const old = await t.app.backup.create('MANUAL', null)
    await t.app.backup.setPassword('new-password-2', actor(t).userId)
    // made in the same second (frozen test clock): must not overwrite the older file
    const fresh = await t.app.backup.create('MANUAL', null)
    expect(fresh.fileName).not.toBe(old.fileName)

    const a = await t.app.backup.inspectRecord(old.id)
    const b = await t.app.backup.inspectRecord(fresh.id)
    // Wrong password for each file is rejected before anything is touched.
    await expect(t.app.backup.restore(a.token, 'new-password-2', null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
    await expect(t.app.backup.restore(b.token, PASSWORD, null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
  })

  it('needs the password again when the local key copy is lost', async () => {
    const dir = t.dir
    await t.close()
    writeFileSync(join(dir, 'backup-key.json'), '{"keyId":"x","data":"AAAA"}')
    t = await createTestApp({ dir, clock: t.clock, platform: t.platform })
    expect((await t.app.backup.status()).unlocked).toBe(false)
    expect(await t.app.backup.runAutoIfDue()).toBeNull()
    await expect(t.app.backup.unlock(PASSWORD, null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
    await t.app.backup.unlock('new-password-2', null)
    expect((await t.app.backup.status()).unlocked).toBe(true)
  })

  it('rolls back a restore interrupted mid-swap (power cut) on the next start', async () => {
    await t.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
    await product('Survives Power Cut')
    const dir = t.dir
    const paths = t.app.paths
    await t.close()
    // simulate: old database moved aside, new one not yet in place, journal written
    const old = join(paths.temp, 'replaced-simulated')
    mkdirSync(old, { recursive: true })
    renameSync(paths.database, join(old, 'central.db'))
    writeFileSync(join(dir, 'restore-journal.json'), JSON.stringify({ old }))
    t = await createTestApp({ dir, clock: t.clock, platform: t.platform })
    expect(await t.app.bootstrap.needsOnboarding()).toBe(false)
    await t.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
    expect((await t.app.catalog.listVariants({ q: 'Survives Power Cut', page: 1, pageSize: 5 }, true)).total).toBe(1)
    expect(existsSync(join(dir, 'restore-journal.json'))).toBe(false)
  })

  it('rejects a truncated (incomplete) backup file', async () => {
    const rec = await t.app.backup.create('MANUAL', null)
    const bytes = readFileSync(fileOf(rec.fileName))
    const cut = join(t.dir, 'truncated.cpbak')
    writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length / 2)))
    const info = t.app.backup.inspectFile(cut)
    await expect(t.app.backup.restore(info.token, 'new-password-2', null)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })
})

