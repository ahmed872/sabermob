import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCsv } from '@main/services/import-service'
import { suggestMapping } from '@shared/import'
import { actor, cleanup, createTestApp, setupOwner, type TestApp } from '../helpers/app'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
  await setupOwner(t, { starterCatalog: false })
})
afterAll(async () => {
  await t.close()
  cleanup(t)
})

const csv = (s: string) => Buffer.from('﻿' + s, 'utf8')

describe('CSV parsing & column mapping', () => {
  it('handles quotes, embedded delimiters/newlines and ; separators', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']])
    expect(parseCsv('name;price\r\nكابل;50\r\n')).toEqual([['name', 'price'], ['كابل', '50']])
  })

  it('maps Arabic and English headers automatically', () => {
    expect(suggestMapping('products', ['اسم الصنف', 'سعر البيع', 'التكلفة', 'الكمية', 'الباركود', 'القسم'])).toMatchObject({ name: 0, sellPrice: 1, costPrice: 2, stock: 3, barcode: 4, category: 5, brand: null })
    expect(suggestMapping('customers', ['Customer Name', 'Mobile', 'Balance'])).toMatchObject({ name: 0, phone: 1, balance: 2 })
  })
})

describe('product import', () => {
  it('previews, reports bad rows and duplicates, then imports the valid ones', async () => {
    await t.app.catalog.createProduct({ type: 'ACCESSORY', name: 'Old Cable', variants: [{ sellPrice: 1000, costPrice: 500, openingStock: 2, barcodes: ['111222333'] }] }, actor(t))
    const file = csv(
      [
        'اسم الصنف,سعر البيع,التكلفة,الكمية,الباركود,القسم,الماركة',
        'شاحن 20 وات,"1,250.50",900,5,6221111111111,شواحن,Anker',
        'جراب ايفون,١٥٠,80,١٠,,جرابات,',
        ',100,50,1,,,', // no name
        'سماعة,abc,10,1,,,', // bad price
        'كابل مكرر,60,30,2,6221111111111,,', // barcode repeated in file
        'Old Cable updated,15,7,9,111222333,,' // exists → update or skip
      ].join('\n')
    )
    const parsed = await t.app.imports.parse('products.csv', file, 'products')
    expect(parsed.rowCount).toBe(6)
    const preview = await t.app.imports.preview(parsed.token, 'products', parsed.mapping)
    expect(preview).toMatchObject({ total: 6, valid: 3, existing: 1 })
    expect(preview.issues.map((i) => [i.row, i.field, i.code])).toEqual([
      [4, 'name', 'REQUIRED'],
      [5, 'sellPrice', 'INVALID_NUMBER'],
      [6, 'barcode', 'DUPLICATE_IN_FILE']
    ])

    const res = await t.app.imports.commit(parsed.token, 'products', parsed.mapping, 'update', actor(t))
    expect(res).toMatchObject({ created: 2, updated: 1, skipped: 0 })
    expect(res.failed).toHaveLength(3)

    const charger = await t.app.catalog.findByCode('6221111111111', true)
    expect(charger).toMatchObject({ sellPrice: 125050, costPrice: 90000, stockQty: 5 })
    const cats = await t.app.catalog.listCategories()
    expect(cats.map((c) => c.name).sort()).toEqual(['جرابات', 'شواحن'])
    expect((await t.app.catalog.listBrands()).map((b) => b.name)).toEqual(['Anker'])
    const updated = await t.app.catalog.findByCode('111222333', true)
    // prices updated, stock untouched (stock only changes through adjustments)
    expect(updated).toMatchObject({ sellPrice: 1500, costPrice: 700, stockQty: 2 })
    // the token is single-use
    await expect(t.app.imports.preview(parsed.token, 'products', parsed.mapping)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('reads Excel files and skips existing items when asked', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')
    ws.addRow(['Name', 'Price', 'Qty', 'Barcode'])
    ws.addRow(['Screen protector', 35, 40, '7001'])
    ws.addRow(['Old Cable', 99, 1, '111222333'])
    const data = Buffer.from(await wb.xlsx.writeBuffer())
    const parsed = await t.app.imports.parse('items.xlsx', data, 'products')
    expect(parsed.mapping).toMatchObject({ name: 0, sellPrice: 1, stock: 2, barcode: 3 })
    const res = await t.app.imports.commit(parsed.token, 'products', parsed.mapping, 'skip', actor(t))
    expect(res).toMatchObject({ created: 1, updated: 0, skipped: 1, failed: [] })
    expect(await t.app.catalog.findByCode('111222333', true)).toMatchObject({ sellPrice: 1500 })
  })

  it('rejects files without data and missing required columns', async () => {
    await expect(t.app.imports.parse('empty.csv', csv('name,price\n'), 'products')).rejects.toMatchObject({ code: 'IMPORT_INVALID' })
    const parsed = await t.app.imports.parse('x.csv', csv('foo,bar\n1,2\n'), 'products')
    await expect(t.app.imports.preview(parsed.token, 'products', parsed.mapping)).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('customer import', () => {
  it('normalises phones, detects existing customers and keeps balances intact', async () => {
    await t.app.customers.save({ name: 'Mona', phone: '01011112222' }, actor(t))
    const parsed = await t.app.imports.parse(
      'customers.csv',
      csv(['الاسم;الموبايل;العنوان;المديونية', 'أحمد;+20 100 333 4444;المعادي;250', 'Mona Updated;0101 111 2222;Nasr City;999', 'تكرار;01003334444;;'].join('\n')),
      'customers'
    )
    const preview = await t.app.imports.preview(parsed.token, 'customers', parsed.mapping)
    expect(preview).toMatchObject({ valid: 2, existing: 1 })
    expect(preview.issues).toEqual([expect.objectContaining({ row: 4, field: 'phone', code: 'DUPLICATE_IN_FILE' })])
    const res = await t.app.imports.commit(parsed.token, 'customers', parsed.mapping, 'update', actor(t))
    expect(res).toMatchObject({ created: 1, updated: 1 })
    const list = await t.app.customers.list({ q: '01003334444', page: 1, pageSize: 5 })
    expect(list.items[0]).toMatchObject({ name: 'أحمد', balance: 25000 })
    const mona = await t.app.customers.list({ q: 'Nasr', page: 1, pageSize: 5 })
    expect(mona.items[0]).toMatchObject({ name: 'Mona', balance: 0 })
  })
})

describe('import performance', () => {
  it('imports 3,000 products in reasonable time', async () => {
    const lines = ['name,price,cost,qty,barcode,category']
    for (let i = 0; i < 3000; i++) lines.push(`Bulk item ${i},${10 + (i % 90)},5,${i % 20},BULK${100000 + i},Cat ${i % 12}`)
    const parsed = await t.app.imports.parse('bulk.csv', csv(lines.join('\n')), 'products')
    const started = performance.now()
    const res = await t.app.imports.commit(parsed.token, 'products', parsed.mapping, 'skip', actor(t))
    const ms = performance.now() - started
    console.log(`[perf] imported 3000 products in ${Math.round(ms)} ms`)
    expect(res.created).toBe(3000)
    expect(ms).toBeLessThan(60_000)
  }, 90_000)
})
