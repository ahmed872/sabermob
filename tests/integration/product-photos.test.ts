/**
 * Optional product photos: added on create, kept when the editor does not touch
 * them, replaced or removed (the old file is deleted), shown on POS tiles, and
 * cleaned up by "start fresh" except for the services that are kept.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString('base64')}`

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t)
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

const file = (rel: string | null) => join(t.app.paths.media, rel!)

describe('product photos', () => {
  it('is optional, can be added, kept, replaced and removed', async () => {
    const a = actor(t)
    const plain = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Plain case', variants: [{ sellPrice: 5000 }] }, a)
    expect(plain.imagePath).toBeNull()
    expect(plain.imageUrl).toBeNull()

    const p = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Photo case', image: PNG, variants: [{ sellPrice: 5000, barcodes: [] }] }, a)
    expect(p.imagePath).toMatch(/^products\/.+\.png$/)
    expect(p.imageUrl).toBe(`app://media/${p.imagePath}`)
    expect(existsSync(file(p.imagePath))).toBe(true)

    // shown on the POS tiles and in the inventory list
    const tile = (await t.app.catalog.posSearch({ q: 'Photo case' }, true))[0]!
    expect(tile.imageUrl).toBe(p.imageUrl)

    const base = { id: p.id, type: 'ACCESSORY' as const, name: 'Photo case', variants: [{ id: p.variants[0]!.id, sellPrice: 6000, barcodes: p.variants[0]!.barcodes }] }
    // editing other fields keeps the photo
    const kept = await t.app.catalog.updateProduct(base, a)
    expect(kept.imagePath).toBe(p.imagePath)

    // replacing it deletes the old file
    const replaced = await t.app.catalog.updateProduct({ ...base, image: JPEG }, a)
    expect(replaced.imagePath).toMatch(/\.jpg$/)
    expect(existsSync(file(p.imagePath))).toBe(false)
    expect(existsSync(file(replaced.imagePath))).toBe(true)

    // removing it
    const removed = await t.app.catalog.updateProduct({ ...base, image: null }, a)
    expect(removed.imagePath).toBeNull()
    expect(existsSync(file(replaced.imagePath))).toBe(false)
  })

  it('refuses something that is not an image, and leaves no file behind when saving fails', async () => {
    const a = actor(t)
    const fake = `data:image/png;base64,${Buffer.from('not really a picture').toString('base64')}`
    await expect(t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Bad', image: fake, variants: [{ sellPrice: 100 }] }, a)).rejects.toMatchObject({ code: 'VALIDATION' })

    const before = (await import('node:fs')).readdirSync(join(t.app.paths.media, 'products')).length
    // a valid photo but an invalid product (no variants left) → the saved file is removed again
    await expect(t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'No variant', image: PNG, variants: [{ sellPrice: 100, remove: true }] }, a)).rejects.toMatchObject({ code: 'VALIDATION' })
    expect((await import('node:fs')).readdirSync(join(t.app.paths.media, 'products')).length).toBe(before)
  })

  it('"start fresh" deletes the photos of removed products and keeps those of kept services', async () => {
    const a = actor(t)
    const item = await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Trial item', image: PNG, variants: [{ sellPrice: 100 }] }, a)
    const service = await t.app.catalog.createProduct({ type: 'SERVICE', name: 'Screen fitting', image: PNG, variants: [{ sellPrice: 0 }] }, a)
    await t.app.reset.reset({ clearCatalog: false }, a)
    expect(existsSync(file(item.imagePath))).toBe(false)
    expect(existsSync(file(service.imagePath))).toBe(true)
    expect((await t.app.catalog.getProduct(service.id, true)).imageUrl).toBe(service.imageUrl)
  })
})
