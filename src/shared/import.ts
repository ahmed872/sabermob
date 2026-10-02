import { normalizeSearch } from './text'

export type ImportEntity = 'products' | 'customers'

export interface ImportField {
  key: string
  required?: boolean
  /** header names recognised automatically (compared after normalisation) */
  synonyms: string[]
}

export const IMPORT_FIELDS: Record<ImportEntity, ImportField[]> = {
  products: [
    { key: 'name', required: true, synonyms: ['name', 'product', 'product name', 'item', 'item name', 'الاسم', 'اسم الصنف', 'الصنف', 'اسم المنتج', 'المنتج', 'البيان'] },
    { key: 'sellPrice', required: true, synonyms: ['price', 'sell price', 'selling price', 'sale price', 'retail', 'السعر', 'سعر البيع', 'البيع', 'سعر'] },
    { key: 'costPrice', synonyms: ['cost', 'cost price', 'purchase price', 'buy price', 'التكلفة', 'سعر الشراء', 'الشراء', 'سعر التكلفة'] },
    { key: 'stock', synonyms: ['stock', 'qty', 'quantity', 'on hand', 'الكمية', 'المخزون', 'الرصيد', 'العدد'] },
    { key: 'barcode', synonyms: ['barcode', 'ean', 'upc', 'code', 'الباركود', 'باركود', 'الكود', 'كود'] },
    { key: 'sku', synonyms: ['sku', 'item code', 'رقم الصنف', 'كود داخلي'] },
    { key: 'category', synonyms: ['category', 'group', 'department', 'القسم', 'التصنيف', 'الفئة', 'المجموعة'] },
    { key: 'brand', synonyms: ['brand', 'make', 'manufacturer', 'الماركة', 'البراند', 'الشركة', 'العلامة التجارية'] },
    { key: 'minStock', synonyms: ['min stock', 'minimum', 'reorder level', 'alert', 'حد الطلب', 'حد التنبيه', 'الحد الأدنى'] },
    { key: 'minPrice', synonyms: ['min price', 'minimum price', 'lowest price', 'أقل سعر', 'الحد الأدنى للسعر'] }
  ],
  customers: [
    { key: 'name', required: true, synonyms: ['name', 'customer', 'customer name', 'client', 'الاسم', 'اسم العميل', 'العميل'] },
    { key: 'phone', synonyms: ['phone', 'mobile', 'tel', 'telephone', 'number', 'الموبايل', 'التليفون', 'الهاتف', 'رقم الموبايل', 'رقم التليفون', 'موبايل', 'تليفون'] },
    { key: 'phone2', synonyms: ['phone 2', 'second phone', 'other phone', 'موبايل 2', 'تليفون آخر', 'رقم آخر'] },
    { key: 'address', synonyms: ['address', 'العنوان', 'عنوان'] },
    { key: 'notes', synonyms: ['notes', 'note', 'comments', 'ملاحظات', 'ملاحظة'] },
    { key: 'balance', synonyms: ['balance', 'debt', 'owed', 'opening balance', 'الرصيد', 'المديونية', 'عليه', 'الحساب'] }
  ]
}

/** column index per field key (missing = not imported) */
export type ImportMapping = Record<string, number | null>

const norm = (s: string) => normalizeSearch(s).replace(/[_\-:]+/g, ' ').trim()

/** Matches spreadsheet headers to fields by name (Arabic or English). */
export function suggestMapping(entity: ImportEntity, headers: string[]): ImportMapping {
  const normalized = headers.map(norm)
  const used = new Set<number>()
  const out: ImportMapping = {}
  for (const f of IMPORT_FIELDS[entity]) {
    const syn = f.synonyms.map(norm)
    let idx = normalized.findIndex((h, i) => !used.has(i) && syn.includes(h))
    if (idx < 0) idx = normalized.findIndex((h, i) => !used.has(i) && h.length > 1 && syn.some((s) => s.length > 2 && (h.includes(s) || s.includes(h))))
    out[f.key] = idx >= 0 ? idx : null
    if (idx >= 0) used.add(idx)
  }
  return out
}

export interface ImportParseResult {
  token: string
  fileName: string
  headers: string[]
  rowCount: number
  sample: string[][]
  mapping: ImportMapping
}

export interface ImportRowIssue {
  /** 1-based spreadsheet row (header is row 1) */
  row: number
  field: string | null
  code: 'REQUIRED' | 'INVALID_NUMBER' | 'INVALID_BARCODE' | 'DUPLICATE_IN_FILE' | 'EXISTS' | 'ERROR'
  value?: string
}

export interface ImportPreview {
  total: number
  valid: number
  /** rows that match an existing record (skipped or updated per option) */
  existing: number
  issues: ImportRowIssue[]
  sample: Array<Record<string, string | number | null>>
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  failed: ImportRowIssue[]
}
