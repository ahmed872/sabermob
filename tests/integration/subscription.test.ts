/**
 * The 3-month subscription: keys stack, so a renewal entered early adds its
 * 90 days on top of what is left; a key works once; grace then expiry.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { SUBSCRIPTION } from '@shared/subscription'
import { actor, cleanup, createTestApp, devActivationKey, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
afterEach(async () => {
  await t.close()
  cleanup(t)
})

const DAY = 86_400_000
const START = Date.UTC(2026, 9, 4, 10) // 10:00 UTC
const day = (n: number) => new Date(START + n * DAY)
const quarterKey = (issuedOn: number) => devActivationKey(t.platform.machine, SUBSCRIPTION.tier, SUBSCRIPTION.days, day(issuedOn))
const endsOn = () => t.app.license.state().expiresAt!.slice(0, 10)
const isoDay = (n: number) => new Date(Date.UTC(2026, 9, 4) + n * DAY).toISOString().slice(0, 10)

describe('quarterly subscription', () => {
  it('stacks renewals, refuses a key twice, then grace and expiry', async () => {
    t = await createTestApp({ clock: { now: day(0) } })
    await setupOwner(t)
    const a = actor(t)

    // First quarter, entered on day 0
    let s = await t.app.license.activate(quarterKey(0), a.userId)
    expect(s).toMatchObject({ status: 'ACTIVE', plan: 'SUBSCRIPTION', daysLeft: 90, operational: true })
    expect(endsOn()).toBe(isoDay(90))
    expect(t.app.license.maxUsers()).toBeGreaterThanOrEqual(1000)

    // Renewed 5 days early (day 85): the new 90 days start where the old ones end
    t.clock.now = day(85)
    s = await t.app.license.activate(quarterKey(85), a.userId)
    expect(endsOn()).toBe(isoDay(180))
    expect(s.daysLeft).toBe(95)

    // The same key cannot be entered again
    await expect(t.app.license.activate(quarterKey(85), a.userId)).rejects.toMatchObject({ code: 'LICENSE_INVALID', details: { reason: 'USED' } })

    // Survives a restart (all keys are kept and chained)
    t = await t.reopen()
    expect(endsOn()).toBe(isoDay(180))

    // Not renewed: 3 grace days, then the app stops (data kept, activation screen)
    t.clock.now = day(181)
    expect(t.app.license.state()).toMatchObject({ status: 'ACTIVE', inGrace: true, operational: true })
    t.clock.now = day(184)
    expect(t.app.license.state()).toMatchObject({ status: 'EXPIRED', plan: 'SUBSCRIPTION', operational: false })

    // Renewed late (day 200): the quarter starts on the key's issue day
    t.clock.now = day(200)
    s = await t.app.license.activate(quarterKey(200), null)
    expect(s).toMatchObject({ status: 'ACTIVE', operational: true, daysLeft: 90 })
    expect(endsOn()).toBe(isoDay(290))
  })

  it('two keys bought together give six months', async () => {
    t = await createTestApp({ clock: { now: day(0) } })
    await setupOwner(t)
    await t.app.license.activate(quarterKey(0), null)
    // same day, next workflow run → different serial
    await t.app.license.activate(devActivationKey(t.platform.machine, SUBSCRIPTION.tier, SUBSCRIPTION.days, day(0), 8), null)
    expect(t.app.license.state().daysLeft).toBe(180)
  })

  it('refuses a key whose quarter is already over', async () => {
    t = await createTestApp({ clock: { now: day(200) } })
    await setupOwner(t)
    await expect(t.app.license.activate(quarterKey(100), null)).rejects.toMatchObject({ code: 'LICENSE_INVALID', details: { reason: 'EXPIRED' } })
    expect(t.app.license.state().plan).toBe('TRIAL')
  })

  it('a lifetime key is shown as lifetime even after subscriptions', async () => {
    t = await createTestApp({ clock: { now: day(0) } })
    await setupOwner(t)
    await t.app.license.activate(quarterKey(0), null)
    await t.app.license.activate(devActivationKey(t.platform.machine, 'PROFESSIONAL', 0, day(1)), null)
    expect(t.app.license.state()).toMatchObject({ plan: 'LIFETIME', daysLeft: null, expiresAt: null })
  })

  it('a 6- or 12-month key (one key, several quarters) activates and stacks like the rest', async () => {
    t = await createTestApp({ clock: { now: day(0) } })
    await setupOwner(t)
    const a = actor(t)
    // 12 months = 4 quarters in one key (vendor tool: --periods 4)
    let s = await t.app.license.activate(devActivationKey(t.platform.machine, SUBSCRIPTION.tier, SUBSCRIPTION.days * 4, day(0), 21), a.userId)
    expect(s).toMatchObject({ status: 'ACTIVE', plan: 'SUBSCRIPTION', daysLeft: 360 })
    // 6 more months entered 10 days before the year ends
    t.clock.now = day(350)
    s = await t.app.license.activate(devActivationKey(t.platform.machine, SUBSCRIPTION.tier, SUBSCRIPTION.days * 2, day(350), 22), a.userId)
    expect(endsOn()).toBe(isoDay(540))
    expect(s.daysLeft).toBe(190)
  })
})
