import { afterEach, describe, expect, it } from 'vitest'
import { AppError } from '@shared/errors'
import { actor, cleanup, createTestApp, devActivationKey, OWNER, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
afterEach(async () => {
  await t.close()
  cleanup(t)
})

const DAY = 86_400_000

describe('onboarding & authentication', () => {
  it('seeds roles/permissions and requires onboarding on first launch', async () => {
    t = await createTestApp()
    expect(await t.app.bootstrap.needsOnboarding()).toBe(true)
    expect(await t.app.db.role.count()).toBe(6)
    expect(await t.app.db.repairStatus.count()).toBe(9)
    await setupOwner(t)
    expect(await t.app.bootstrap.needsOnboarding()).toBe(false)
    expect(actor(t).permissions.has('manage_users')).toBe(true)
    expect(await t.app.db.category.count()).toBeGreaterThan(5)
    expect(await t.app.db.product.count({ where: { type: 'SERVICE' } })).toBeGreaterThan(3)
    await expect(t.app.bootstrap.completeOnboarding({} as never)).rejects.toBeInstanceOf(Error)
  })

  it('logs in with password and PIN, rejects bad credentials, locks out', async () => {
    t = await createTestApp()
    await setupOwner(t)
    await t.app.auth.logout()
    const tiles = await t.app.users.loginTiles()
    expect(tiles[0]!.hasPin).toBe(true)
    await t.app.auth.login({ userId: tiles[0]!.id, secret: OWNER.pin, method: 'PIN' })
    expect(t.app.auth.currentActor()?.username).toBe('owner')
    await t.app.auth.logout()
    for (let i = 0; i < 4; i++) {
      await expect(t.app.auth.login({ username: 'owner', secret: 'wrong', method: 'PASSWORD' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    }
    await expect(t.app.auth.login({ username: 'owner', secret: 'wrong', method: 'PASSWORD' })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' })
    // even the right password is refused while locked out
    await expect(t.app.auth.login({ username: 'owner', secret: OWNER.password, method: 'PASSWORD' })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' })
    t.clock.now = new Date(t.clock.now.getTime() + 6 * 60_000)
    await t.app.auth.login({ username: 'owner', secret: OWNER.password, method: 'PASSWORD' })
    const failed = await t.app.db.auditLog.count({ where: { action: 'auth.failed' } })
    expect(failed).toBe(5)
  })

  it('locks on idle timeout and supports quick user switching', async () => {
    t = await createTestApp()
    await setupOwner(t)
    const cashierRole = await t.app.db.role.findUniqueOrThrow({ where: { systemKey: 'CASHIER' } })
    const cashier = await t.app.users.create({ username: 'mona', fullName: 'Mona', password: 'cashier1', pin: '5555', roleId: cashierRole.id }, actor(t))
    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60_000)
    expect(t.app.auth.checkIdle()).toBe(true)
    expect(t.app.auth.isLocked()).toBe(true)
    // a different user unlocking = switch user
    await t.app.auth.unlock({ userId: cashier.id, secret: '5555', method: 'PIN' })
    expect(t.app.auth.isLocked()).toBe(false)
    expect(actor(t).username).toBe('mona')
    expect(actor(t).permissions.has('view_profit')).toBe(false)
    const sessions = await t.app.db.session.findMany({ orderBy: { startedAt: 'asc' } })
    expect(sessions[0]!.endReason).toBe('SWITCH')
  })

  it('grants single-use manager overrides', async () => {
    t = await createTestApp()
    await setupOwner(t)
    const cashierRole = await t.app.db.role.findUniqueOrThrow({ where: { systemKey: 'CASHIER' } })
    await t.app.users.create({ username: 'mona', fullName: 'Mona', password: 'cashier1', roleId: cashierRole.id }, actor(t))
    await t.app.auth.login({ username: 'mona', secret: 'cashier1', method: 'PASSWORD' })
    const a = actor(t)
    expect(() => t.app.auth.authorize(a, 'refund_sale')).toThrow(AppError)
    const { token } = await t.app.auth.requestOverride({ username: 'owner', secret: OWNER.pin, method: 'PIN', permission: 'refund_sale' })
    expect(t.app.auth.authorize(a, 'refund_sale', token)).toBeTruthy()
    // token is single use
    expect(() => t.app.auth.authorize(a, 'refund_sale', token)).toThrow(AppError)
    // cashier cannot approve for themselves
    await expect(t.app.auth.requestOverride({ username: 'mona', secret: 'cashier1', method: 'PASSWORD', permission: 'refund_sale' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('keeps at least one owner', async () => {
    t = await createTestApp()
    await setupOwner(t)
    const me = actor(t)
    const cashierRole = await t.app.db.role.findUniqueOrThrow({ where: { systemKey: 'CASHIER' } })
    await expect(t.app.users.update({ id: me.userId, roleId: cashierRole.id }, me)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})

describe('license', () => {
  it('runs a 15-day trial, then requires activation', async () => {
    t = await createTestApp()
    await setupOwner(t)
    let s = t.app.license.state()
    expect(s.status).toBe('TRIAL')
    expect(s.daysLeft).toBe(15)
    expect(s.operational).toBe(true)
    t.clock.now = new Date(t.clock.now.getTime() + 14 * DAY)
    await t.app.license.heartbeat()
    expect(t.app.license.state().daysLeft).toBe(1)
    t.clock.now = new Date(t.clock.now.getTime() + 1 * DAY + 1000)
    s = t.app.license.state()
    expect(s.status).toBe('TRIAL_EXPIRED')
    expect(s.operational).toBe(false)
    expect(s.requestCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)

    const key = devActivationKey(t.platform.machine, 'PROFESSIONAL', 0)
    s = await t.app.license.activate(key, actor(t).userId)
    expect(s.status).toBe('ACTIVE')
    expect(s.operational).toBe(true)
    expect(s.daysLeft).toBeNull()
    // survives restart
    t = await t.reopen()
    expect(t.app.license.state().status).toBe('ACTIVE')
  })

  it('rejects keys for another machine, tampered keys and garbage', async () => {
    t = await createTestApp()
    await setupOwner(t)
    const other = devActivationKey('another-pc')
    await expect(t.app.license.activate(other, null)).rejects.toMatchObject({ code: 'LICENSE_INVALID', details: { reason: 'MACHINE' } })
    const good = devActivationKey(t.platform.machine)
    const chars = good.split('')
    const idx = 40
    chars[idx] = chars[idx] === 'A' ? 'B' : 'A'
    await expect(t.app.license.activate(chars.join(''), null)).rejects.toMatchObject({ code: 'LICENSE_INVALID', details: { reason: 'SIGNATURE' } })
    await expect(t.app.license.activate('X'.repeat(128), null)).rejects.toMatchObject({ code: 'LICENSE_INVALID' })
  })

  it('expires timed licenses after the grace period', async () => {
    t = await createTestApp()
    await setupOwner(t)
    await t.app.license.activate(devActivationKey(t.platform.machine, 'BASIC', 30, t.clock.now), null)
    expect(t.app.license.state().daysLeft).toBe(30)
    expect(t.app.license.maxUsers()).toBe(3)
    t.clock.now = new Date(t.clock.now.getTime() + 31 * DAY)
    expect(t.app.license.state()).toMatchObject({ status: 'ACTIVE', inGrace: true, operational: true })
    t.clock.now = new Date(t.clock.now.getTime() + 3 * DAY)
    expect(t.app.license.state()).toMatchObject({ status: 'EXPIRED', operational: false })
  })

  it('does not reset the trial when the clock is turned back or the DB marker is removed', async () => {
    t = await createTestApp()
    await setupOwner(t)
    const start = t.clock.now.getTime()
    t.clock.now = new Date(start + 20 * DAY)
    t = await t.reopen()
    expect(t.app.license.state().status).toBe('TRIAL_EXPIRED')
    // user turns the clock back to day 1
    t.clock.now = new Date(start + DAY)
    t = await t.reopen()
    const s = t.app.license.state()
    expect(s.status).toBe('TRIAL_EXPIRED')
    expect(s.clockWarning).toBe(true)
    // delete the DB trial marker: the external marker still holds the start date
    await t.app.db.setting.delete({ where: { key: 'license.trialStartedAt' } })
    t = await t.reopen()
    expect(t.app.license.state().status).toBe('TRIAL_EXPIRED')
  })

  it('documents a clock set far in the future: lifetime licenses unaffected, trials and timed licenses end early', async () => {
    t = await createTestApp()
    await setupOwner(t)
    await t.app.license.activate(devActivationKey(t.platform.machine, 'PROFESSIONAL', 0), null)
    const start = t.clock.now.getTime()
    // someone sets the year wrong (+2 years), uses the app, then fixes the clock
    t.clock.now = new Date(start + 730 * DAY)
    await t.app.license.heartbeat()
    t.clock.now = new Date(start + DAY)
    t = await t.reopen()
    expect(t.app.license.state()).toMatchObject({ status: 'ACTIVE', operational: true })

    // same mistake during a timed (30-day) license: the app keeps the latest time it saw
    const t2 = await createTestApp()
    await setupOwner(t2)
    await t2.app.license.activate(devActivationKey(t2.platform.machine, 'BASIC', 30, t2.clock.now), null)
    const s0 = t2.clock.now.getTime()
    t2.clock.now = new Date(s0 + 365 * DAY)
    await t2.app.license.heartbeat()
    t2.clock.now = new Date(s0 + DAY)
    const reopened = await t2.reopen()
    expect(reopened.app.license.state()).toMatchObject({ status: 'EXPIRED', operational: false, clockWarning: true })
    // business data is untouched and a new key from the vendor fixes it
    await reopened.app.license.activate(devActivationKey(reopened.platform.machine, 'BASIC', 0), null)
    expect(reopened.app.license.state().operational).toBe(true)
    await reopened.close()
    cleanup(reopened)
  })
})

