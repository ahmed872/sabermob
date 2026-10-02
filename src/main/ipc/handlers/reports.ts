import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { dialog, type BrowserWindow } from 'electron'
import { AppError } from '@shared/errors'
import { empty } from '@shared/schemas/common'
import type { ApiRouter } from '../router'
import type { Printer } from '../../printing/printer'
import { printStore } from '../../printing/documents'
import { toCsv, toXlsx } from '../../services/export-service'

const range = z.object({ from: z.string().min(8).max(40), to: z.string().min(8).max(40) })
const group = z.enum(['day', 'week', 'month', 'year'])
const table = z.object({
  title: z.string().max(200),
  subtitle: z.string().max(300).optional(),
  columns: z.array(z.object({ key: z.string().max(60), header: z.string().max(100), type: z.enum(['money', 'number', 'text', 'date']).optional() })).min(1).max(40),
  rows: z.array(z.record(z.string(), z.union([z.string().max(1000), z.number(), z.null()]))).max(50_000)
})

export function registerReportHandlers(r: ApiRouter, printer: Printer, getWindow: () => BrowserWindow | null): void {
  r.handle('reports.dashboard', { input: empty, permission: null }, (_i, { app, actor }) => app.reports.dashboard(actor!))
  r.handle('reports.sales', { input: range.extend({ group }), permission: 'view_reports' }, (i, { app, actor }) => app.reports.sales(i, i.group, actor!))
  r.handle('reports.profit', { input: range.extend({ group }), permission: 'view_profit' }, (i, { app }) => app.reports.profit(i, i.group))
  r.handle('reports.inventory', { input: empty, permission: ['view_reports', 'view_inventory'] }, (_i, { app, actor }) => app.reports.inventory(actor!))
  r.handle('reports.repairs', { input: range, permission: ['view_reports', 'view_repairs'] }, (i, { app, actor }) => app.reports.repairs(i, actor!))
  r.handle('reports.suppliers', { input: range, permission: 'view_supplier_balances' }, (i, { app }) => app.reports.suppliers(i))
  r.handle('reports.employees', { input: range, permission: 'view_reports' }, (i, { app }) => app.reports.employees(i))
  r.handle('search.global', { input: z.object({ q: z.string().max(100) }), permission: null }, (i, { app, actor }) => app.reports.search(i.q, actor!))

  r.handle('reports.export', { input: z.object({ table, format: z.enum(['csv', 'xlsx', 'pdf']) }), permission: 'export_reports', skipGate: true }, async (input, { app, actor }) => {
    const decimals = app.settings.get('company').currencyDecimals
    const rtl = app.settings.get('general').language === 'ar'
    let data: Buffer
    if (input.format === 'csv') data = toCsv(input.table, decimals)
    else if (input.format === 'xlsx') data = await toXlsx(input.table, decimals, rtl)
    else data = await printer.pdf({ type: 'table', paper: 'A4', store: printStore(app), table: input.table, generatedAt: new Date().toISOString() })
    const safeName = input.table.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'report'
    let path: string | null = null
    if (process.env.CENTRAL_E2E_PDF_DIR) path = `${process.env.CENTRAL_E2E_PDF_DIR}/${safeName}.${input.format}`
    else {
      const win = getWindow()
      const res = win ? await dialog.showSaveDialog(win, { defaultPath: `${safeName}.${input.format}` }) : { canceled: true, filePath: undefined }
      if (res.canceled || !res.filePath) return { path: null }
      path = res.filePath
    }
    try {
      writeFileSync(path, data)
    } catch {
      throw new AppError('FILE_ERROR')
    }
    await app.audit.log({ userId: actor!.userId, action: 'report.exported', metadata: { title: input.table.title, format: input.format, rows: input.table.rows.length } })
    return { path }
  })
}
