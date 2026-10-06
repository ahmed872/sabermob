/**
 * The backup password is usually the owner password. When the owner forgets it
 * and recovers access with a vendor key, backups must switch to the new
 * password — and a backup made with it right away — or the data could never
 * be moved to another PC.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => 'test', relaunch: () => undefined, exit: () => undefined }, dialog: {}, shell: {}, session: {}, BrowserWindow: class {} }))

import { ApiRouter } from '@main/ipc/router'
import { registerCoreHandlers } from '@main/ipc/handlers/core'
import { registerDataHandlers } from '@main/ipc/handlers/data'
import { actor, cleanup, createTestApp, devRecoveryKey, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
afterAll(async () => {
  await t.close()
  cleanup(t)
})
type Res = { ok: boolean; data?: any; error?: { code: string } }
const NEW = 'remembered-now-9'

describe('password recovery and backups', () => {
  it('switches backups to the new password and makes a backup with it', async () => {
    t = await createTestApp()
    await setupOwner(t, { starterCatalog: false })
    const router = new ApiRouter(t.app)
    registerCoreHandlers(router, { appVersion: 'test', platform: 'test', openPath: async () => undefined, listPrinters: async () => [] })
    registerDataHandlers(router, () => null, null)
    const call = (m: string, input?: unknown) => router.dispatch(m, input) as Promise<Res>

    // as after onboarding: backups use the owner password
    await t.app.backup.setPassword(OWNER.password, actor(t).userId)
    const oldBackup = await t.app.backup.create('MANUAL', actor(t).userId)
    await t.app.auth.logout()

    // the owner forgot it → recovery key from the vendor
    const code = (await call('auth.recoveryCode')).data.code
    const res = await call('auth.recover', { key: devRecoveryKey(code), username: OWNER.username, password: NEW })
    expect(res.data).toEqual({ ok: true, backupPasswordChanged: true })

    // a backup made with the new password exists and only opens with it
    const fresh = (await t.app.backup.list()).find((r) => r.kind === 'MANUAL' && r.id !== oldBackup.id && r.status === 'SUCCESS')!
    expect(fresh).toBeTruthy()
    const info = await t.app.backup.inspectRecord(fresh.id)
    await expect(t.app.backup.restore(info.token, OWNER.password, null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
    // older backups keep the old password
    const oldInfo = await t.app.backup.inspectRecord(oldBackup.id)
    await expect(t.app.backup.restore(oldInfo.token, NEW, null)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
    // the new password restores the new backup (the app would restart here)
    await t.app.backup.restore(info.token, NEW, null)
    expect(t.app.backup.restartRequired).toBe(true)
  })
})
