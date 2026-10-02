import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import type { ExportTable } from '@shared/types/reports'
import { toDecimalString } from '@shared/money'

/** Converts a report table to CSV / Excel. Money columns are exported as numbers. */
export function tableValue(type: string | undefined, v: string | number | null, decimals: number): string | number | null {
  if (v === null || v === undefined) return null
  if (type === 'money' && typeof v === 'number') return Number(toDecimalString(v, decimals))
  return v
}

export function toCsv(table: ExportTable, decimals: number): Buffer {
  const data = table.rows.map((r) => Object.fromEntries(table.columns.map((c) => [c.header, tableValue(c.type, r[c.key] ?? null, decimals)])))
  // UTF-8 BOM so Excel opens Arabic text correctly.
  return Buffer.from('﻿' + Papa.unparse(data, { columns: table.columns.map((c) => c.header) }), 'utf8')
}

export async function toXlsx(table: ExportTable, decimals: number, rtl: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Central Pro'
  const ws = wb.addWorksheet(table.title.slice(0, 31) || 'Report', { views: [{ rightToLeft: rtl, state: 'frozen', ySplit: table.subtitle ? 3 : 1 }] })
  if (table.subtitle) {
    ws.addRow([table.title]).font = { bold: true, size: 14 }
    ws.addRow([table.subtitle])
  }
  const header = ws.addRow(table.columns.map((c) => c.header))
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }))
  for (const r of table.rows) ws.addRow(table.columns.map((c) => tableValue(c.type, r[c.key] ?? null, decimals)))
  table.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    col.width = Math.min(48, Math.max(12, c.header.length + 4, ...table.rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length + 2)))
    if (c.type === 'money') col.numFmt = decimals ? `#,##0.${'0'.repeat(decimals)}` : '#,##0'
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}
