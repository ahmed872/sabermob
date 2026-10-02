import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import { AppError } from '@shared/errors'
import { IMPORT_FIELDS, suggestMapping, type ImportEntity, type ImportMapping, type ImportParseResult, type ImportPreview, type ImportResult, type ImportRowIssue } from '@shared/import'
import { parseMoney, toLatinDigits } from '@shared/money'
import { buildSearchText, normalizePhone, normalizeSearch } from '@shared/text'
import type { Mutex } from '../core/mutex'
import type { Db } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import type { CatalogService } from './catalog-service'
import type { CustomerService } from './customer-service'
import type { SettingsService } from './settings-service'

const MAX_ROWS = 20_000
const MAX_COLS = 60
const TTL_MS = 60 * 60_000
const BARCODE = /^[\x21-\x7E]{3,64}$/

interface ParsedFile {
  name: string
  headers: string[]
  rows: string[][]
  at: number
}

type Mode = 'skip' | 'update'
type Row = Record<string, string>
interface Checked {
  row: number
  values: Record<string, string | number | null>
  existingId: string | null
}

/** RFC 4180 CSV with delimiter detection (Excel in Arabic locales often uses ';'). */
export function parseCsv(text: string): string[][] {
  const nl = text.search(/\r?\n/)
  const firstLine = nl < 0 ? text : text.slice(0, nl)
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** UTF-8 (with or without BOM), falling back to Windows-1256 (legacy Arabic Excel). */
function decodeText(data: Buffer): string {
  const utf8 = new TextDecoder('utf-8').decode(data)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  try {
    return new TextDecoder('windows-1256').decode(data)
  } catch {
    return utf8
  }
}

async function parseXlsx(data: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer)
  } catch {
    throw new AppError('IMPORT_INVALID', 'Not a valid Excel file')
  }
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0)
  if (!ws) return []
  const rows: string[][] = []
  ws.eachRow({ includeEmpty: false }, (r) => {
    const out: string[] = []
    for (let c = 1; c <= Math.min(r.cellCount, MAX_COLS); c++) out.push(r.getCell(c).text ?? '')
    rows.push(out)
  })
  return rows
}

const int = (v: string): number | null => {
  const s = toLatinDigits(v).replace(/[\s,]/g, '')
  if (!/^-?\d+(\.0+)?$/.test(s)) return null
  return Math.trunc(Number(s))
}

/**
 * Bulk import of products and customers from CSV/Excel: parse → map
 * columns → preview (validation, duplicates) → commit. Every row is
 * validated before anything is written; failing rows are reported, never
 * silently dropped.
 */
export class ImportService {
  #files = new Map<string, ParsedFile>()

  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly customers: CustomerService,
    private readonly audit: AuditService,
    private readonly gate: Mutex
  ) {}

  async parse(fileName: string, data: Buffer, entity: ImportEntity): Promise<ImportParseResult> {
    const now = Date.now()
    for (const [k, f] of this.#files) if (now - f.at > TTL_MS) this.#files.delete(k)
    const isXlsx = data.subarray(0, 2).toString('latin1') === 'PK'
    let rows = isXlsx ? await parseXlsx(data) : parseCsv(decodeText(data))
    rows = rows.map((r) => r.slice(0, MAX_COLS).map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
    if (rows.length < 2) throw new AppError('IMPORT_INVALID', 'The file has no data rows')
    if (rows.length - 1 > MAX_ROWS)
      throw new AppError('IMPORT_INVALID', `Too many rows (max ${MAX_ROWS})`, {
        max: MAX_ROWS
      })
    const headers = rows[0]!.map((h, i) => h || `#${i + 1}`)
    const token = randomUUID()
    this.#files.set(token, {
      name: fileName,
      headers,
      rows: rows.slice(1),
      at: now
    })
    return {
      token,
      fileName,
      headers,
      rowCount: rows.length - 1,
      sample: rows.slice(1, 6),
      mapping: suggestMapping(entity, headers)
    }
  }

  #file(token: string): ParsedFile {
    const f = this.#files.get(token)
    if (!f) throw new AppError('NOT_FOUND', 'Import file expired; choose it again')
    return f
  }

  #rows(f: ParsedFile, entity: ImportEntity, mapping: ImportMapping): Row[] {
    for (const field of IMPORT_FIELDS[entity]) {
      if (field.required && (mapping[field.key] == null || mapping[field.key]! >= f.headers.length)) throw new AppError('VALIDATION', `Column for ${field.key} is required`, { field: field.key })
    }
    return f.rows.map((r) => {
      const out: Row = {}
      for (const field of IMPORT_FIELDS[entity]) {
        const idx = mapping[field.key]
        out[field.key] = idx == null ? '' : (r[idx] ?? '').trim()
      }
      return out
    })
  }

  async #check(token: string, entity: ImportEntity, mapping: ImportMapping): Promise<{ rows: Checked[]; issues: ImportRowIssue[] }> {
    const rows = this.#rows(this.#file(token), entity, mapping)
    return entity === 'products' ? this.#checkProducts(rows) : this.#checkCustomers(rows)
  }

  async #checkProducts(rows: Row[]): Promise<{ rows: Checked[]; issues: ImportRowIssue[] }> {
    const decimals = this.settings.get('company').currencyDecimals
    const issues: ImportRowIssue[] = []
    const out: Checked[] = []
    const existingByCode = new Map(
      (
        await this.db.barcode.findMany({
          where: { variant: { deletedAt: null } },
          select: { code: true, variantId: true }
        })
      ).map((b) => [b.code, b.variantId])
    )
    const existingByName = new Map<string, string>()
    for (const v of await this.db.productVariant.findMany({
      where: { deletedAt: null, isDefault: true, product: { deletedAt: null } },
      select: { id: true, product: { select: { name: true } } }
    })) {
      existingByName.set(normalizeSearch(v.product.name), v.id)
    }
    const seenCode = new Set<string>()
    const seenName = new Set<string>()
    rows.forEach((r, i) => {
      const row = i + 2
      const bad = (field: string | null, code: ImportRowIssue['code'], value?: string) => issues.push({ row, field, code, value })
      const before = issues.length
      if (!r.name) bad('name', 'REQUIRED')
      const sell = r.sellPrice ? parseMoney(r.sellPrice, decimals) : null
      if (sell === null || sell < 0) bad('sellPrice', r.sellPrice ? 'INVALID_NUMBER' : 'REQUIRED', r.sellPrice)
      const cost = r.costPrice ? parseMoney(r.costPrice, decimals) : 0
      if (cost === null || cost < 0) bad('costPrice', 'INVALID_NUMBER', r.costPrice)
      const minPrice = r.minPrice ? parseMoney(r.minPrice, decimals) : null
      if (r.minPrice && (minPrice === null || minPrice < 0)) bad('minPrice', 'INVALID_NUMBER', r.minPrice)
      const stock = r.stock ? int(r.stock) : 0
      if (stock === null || stock < 0 || stock > 1_000_000) bad('stock', 'INVALID_NUMBER', r.stock)
      const minStock = r.minStock ? int(r.minStock) : null
      if (r.minStock && (minStock === null || minStock < 0)) bad('minStock', 'INVALID_NUMBER', r.minStock)
      const code = toLatinDigits(r.barcode ?? '').replace(/\s+/g, '')
      if (code && !BARCODE.test(code)) bad('barcode', 'INVALID_BARCODE', r.barcode)
      const nameKey = normalizeSearch(r.name)
      if (code && seenCode.has(code)) bad('barcode', 'DUPLICATE_IN_FILE', code)
      else if (!code && nameKey && seenName.has(nameKey)) bad('name', 'DUPLICATE_IN_FILE', r.name)
      if (issues.length > before) return
      if (code) seenCode.add(code)
      seenName.add(nameKey)
      out.push({
        row,
        existingId: (code && existingByCode.get(code)) || existingByName.get(nameKey) || null,
        values: {
          name: r.name!.slice(0, 160),
          sellPrice: sell,
          costPrice: cost,
          minPrice,
          stock,
          minStock,
          barcode: code || null,
          sku: r.sku?.slice(0, 64) || null,
          category: r.category?.slice(0, 80) || null,
          brand: r.brand?.slice(0, 80) || null
        }
      })
    })
    return { rows: out, issues }
  }

  async #checkCustomers(rows: Row[]): Promise<{ rows: Checked[]; issues: ImportRowIssue[] }> {
    const decimals = this.settings.get('company').currencyDecimals
    const issues: ImportRowIssue[] = []
    const out: Checked[] = []
    const existing = new Map<string, string>()
    for (const c of await this.db.customer.findMany({
      where: { deletedAt: null, phone: { not: null } },
      select: { id: true, phone: true }
    })) {
      const p = normalizePhone(c.phone)
      if (p) existing.set(p, c.id)
    }
    const seen = new Set<string>()
    rows.forEach((r, i) => {
      const row = i + 2
      const before = issues.length
      if (!r.name) issues.push({ row, field: 'name', code: 'REQUIRED' })
      const balance = r.balance ? parseMoney(r.balance, decimals) : 0
      if (balance === null || Math.abs(balance) > 1_000_000_000)
        issues.push({
          row,
          field: 'balance',
          code: 'INVALID_NUMBER',
          value: r.balance
        })
      const phone = normalizePhone(r.phone)
      if (phone && seen.has(phone))
        issues.push({
          row,
          field: 'phone',
          code: 'DUPLICATE_IN_FILE',
          value: r.phone
        })
      if (issues.length > before) return
      if (phone) seen.add(phone)
      out.push({
        row,
        existingId: (phone && existing.get(phone)) || null,
        values: {
          name: r.name!.slice(0, 120),
          phone: phone,
          phone2: normalizePhone(r.phone2),
          address: r.address?.slice(0, 200) || null,
          notes: r.notes?.slice(0, 1000) || null,
          balance
        }
      })
    })
    return { rows: out, issues }
  }

  async preview(token: string, entity: ImportEntity, mapping: ImportMapping): Promise<ImportPreview> {
    const { rows, issues } = await this.#check(token, entity, mapping)
    return {
      total: this.#file(token).rows.length,
      valid: rows.length,
      existing: rows.filter((r) => r.existingId).length,
      issues: issues.slice(0, 1000),
      sample: rows.slice(0, 20).map((r) => ({
        ...r.values,
        _row: r.row,
        _existing: r.existingId ? 1 : 0
      }))
    }
  }

  /**
   * Writes the valid rows. Called without the database gate: each row takes
   * it briefly, so the shop keeps selling during a large import.
   */
  async commit(token: string, entity: ImportEntity, mapping: ImportMapping, mode: Mode, actor: Actor): Promise<ImportResult> {
    const { rows, issues } = await this.gate.run(() => this.#check(token, entity, mapping))
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: [...issues] }
    const fileName = this.#file(token).name
    this.#files.delete(token)
    const cache = new Map<string, string>()
    for (const r of rows) {
      await this.gate.run(async () => {
        try {
          if (r.existingId && mode === 'skip') result.skipped++
          else if (r.existingId) {
            await (entity === 'products' ? this.#updateProduct(r) : this.#updateCustomer(r))
            result.updated++
          } else {
            await (entity === 'products' ? this.#createProduct(r, cache, actor) : this.#createCustomer(r, actor))
            result.created++
          }
        } catch (err) {
          result.failed.push({ row: r.row, field: null, code: 'ERROR', value: err instanceof AppError ? err.code : 'INTERNAL' })
        }
      })
    }
    const summary = { entity, file: fileName, created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed.length }
    await this.gate.run(() => this.audit.log({ userId: actor.userId, action: 'data.imported', metadata: summary }))
    result.failed.sort((a, b) => a.row - b.row)
    return result
  }

  async #lookup(kind: 'category' | 'brand', name: string | null, cache: Map<string, string>, actor: Actor): Promise<string | null> {
    if (!name) return null
    const key = normalizeSearch(name)
    const hit = cache.get(`${kind}:${key}`)
    if (hit) return hit
    const list = kind === 'category' ? await this.catalog.listCategories() : await this.catalog.listBrands()
    let id = list.find((x) => normalizeSearch(x.name) === key)?.id
    if (!id) id = kind === 'category' ? (await this.catalog.saveCategory({ name }, actor)).id : (await this.catalog.saveBrand({ name }, actor)).id
    cache.set(`${kind}:${key}`, id)
    return id
  }

  async #createProduct({ values: v }: Checked, cache: Map<string, string>, actor: Actor): Promise<void> {
    const categoryId = await this.#lookup('category', v.category as string | null, cache, actor)
    const brandId = await this.#lookup('brand', v.brand as string | null, cache, actor)
    const variant = {
      sku: v.sku as string | null,
      sellPrice: v.sellPrice as number,
      costPrice: v.costPrice as number,
      minPrice: v.minPrice as number | null,
      minStock: v.minStock as number | null,
      openingStock: v.stock as number,
      barcodes: v.barcode ? [v.barcode as string] : []
    }
    await this.catalog.createProduct({ type: 'ACCESSORY', name: v.name as string, categoryId, brandId, variants: [variant] }, actor)
  }

  /** Updates change prices only; stock always moves through adjustments. */
  async #updateProduct({ values: v, existingId }: Checked): Promise<void> {
    const data = { sellPrice: v.sellPrice as number, ...(v.costPrice ? { costPrice: v.costPrice as number } : {}), ...(v.minPrice != null ? { minPrice: v.minPrice as number } : {}) }
    await this.db.productVariant.update({ where: { id: existingId! }, data })
  }

  async #createCustomer({ values: v }: Checked, actor: Actor): Promise<void> {
    const str = (k: string) => (v[k] as string | null) ?? null
    await this.customers.save({ name: v.name as string, phone: str('phone'), phone2: str('phone2'), address: str('address'), notes: str('notes'), openingBalance: (v.balance as number) || undefined }, actor)
  }

  /** Balances are never overwritten by an import; only contact details. */
  async #updateCustomer({ values: v, existingId }: Checked): Promise<void> {
    const data: Record<string, string> = {}
    for (const k of ['phone2', 'address', 'notes'] as const) if (v[k]) data[k] = v[k] as string
    if (!Object.keys(data).length) return
    const c = await this.db.customer.findUniqueOrThrow({ where: { id: existingId! } })
    const next = { ...c, ...data }
    await this.db.customer.update({ where: { id: existingId! }, data: { ...data, searchText: buildSearchText([next.name, next.phone, next.phone2, next.address]) } })
  }
}
