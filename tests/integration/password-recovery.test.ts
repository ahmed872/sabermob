/**
 * Forgotten owner password: code on the login screen → vendor-signed key →
 * new password. One use, this PC only, 7 days, owners only.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { encodeRecoveryCode } from '@shared/license-codec'
import { LicenseService } from '@main/license/license-service'
import { cleanup, createTestApp, devActivationKey, devRecoveryKey, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
afterEach(async () => {
  await t.close()
  cleanup(t)
})
const DAY = 86_400_000
const NEW = 'brand-new-pass-9'

describe('owner password recovery', () => {
  it('a vendor key sets a new password once; old password and reused key stop working', async () => {
    t = await createTestApp()
    await setupOwner(t)
    await t.app.auth.logout()
    const { code, owners } = await t.app.recovery.request()
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{1,4}){5}$/)
    expect(owners).toEqual([{ username: OWNER.username, fullName: OWNER.fullName }])
    expect((await t.app.recovery.request()).code).toBe(code) // same code until it is used

    const key = devRecoveryKey(code)
    await expect(t.app.recovery.recover({ key, username: OWNER.username, password: 'weak' })).rejects.toMatchObject({ code: 'VALIDATION', details: { reason: 'weakPassword' } })
    await t.app.recovery.recover({ key, username: OWNER.username, password: NEW, pin: '2580' })

    await expect(t.app.auth.login({ username: OWNER.username, secret: OWNER.password, method: 'PASSWORD' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await t.app.auth.login({ username: OWNER.username, secret: NEW, method: 'PASSWORD' })
    await t.app.auth.login({ username: OWNER.username, secret: '2580', method: 'PIN' })
    expect(await t.app.db.auditLog.count({ where: { action: 'auth.password_recovered' } })).toBe(1)

    // the same key again: refused, and a new code is issued
    await expect(t.app.recovery.recover({ key, username: OWNER.username, password: 'another-pass-1' })).rejects.toMatchObject({ code: 'LICENSE_INVALID', details: { reason: 'RECOVERY_INVALID' } })
    expect((await t.app.recovery.request()).code).not.toBe(code)
  })

  it('refuses a key for another PC, an expired key, an activation key and non-owner accounts', async () => {
    t = await createTestApp()
    await setupOwner(t)
    const roles = await t.app.users.listRoles()
    await t.app.users.create({ username: 'cashier', fullName: 'Cashier', password: 'cashier-pass-1', pin: null, roleId: roles.find((r) => r.systemKey === 'CASHIER')!.id }, t.app.auth.currentActor()!)
    const { code } = await t.app.recovery.request()

    const otherPc = encodeRecoveryCode(LicenseService.deriveMachineId('another-pc'), new Uint8Array([1, 2, 3, 4]))
    await expect(t.app.recovery.recover({ key: devRecoveryKey(otherPc), username: OWNER.username, password: NEW })).rejects.toMatchObject({ details: { reason: 'RECOVERY_INVALID' } })
    await expect(t.app.recovery.recover({ key: devRecoveryKey(code, new Date(Date.now() - 9 * DAY)), username: OWNER.username, password: NEW })).rejects.toMatchObject({ details: { reason: 'RECOVERY_EXPIRED' } })
    await expect(t.app.recovery.recover({ key: devActivationKey(t.platform.machine), username: OWNER.username, password: NEW })).rejects.toMatchObject({ details: { reason: 'RECOVERY_INVALID' } })
    await expect(t.app.recovery.recover({ key: devRecoveryKey(code), username: 'cashier', password: NEW })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // and a recovery key is not an activation key
    await expect(t.app.license.activate(devRecoveryKey(code), null)).rejects.toMatchObject({ code: 'LICENSE_INVALID' })
  })
})
