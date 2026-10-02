import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, FileDown, FileSpreadsheet, Upload } from 'lucide-react'
import { IMPORT_FIELDS, type ImportEntity, type ImportMapping, type ImportParseResult, type ImportPreview, type ImportResult } from '@shared/import'
import { call } from '../../lib/api'
import { invalidate, toastError } from '../../lib/query'
import { fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Select } from '../../components/ui/input'
import { Segmented, Stat } from '../../components/ui/misc'
import { Spinner } from '../../components/ui/spinner'

type Step = 'file' | 'columns' | 'check' | 'done'
const STEPS: Step[] = ['file', 'columns', 'check', 'done']
const MAX_BYTES = 15 * 1024 * 1024

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Import products or customers from Excel/CSV: file → columns → check → import. */
export function ImportDialog({ entity, onClose }: { entity: ImportEntity; onClose: () => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('file')
  const [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState<ImportParseResult | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mode, setMode] = useState<'skip' | 'update'>('skip')
  const [result, setResult] = useState<ImportResult | null>(null)
  const fields = IMPORT_FIELDS[entity]
  const label = (key: string) => t(`importer.fields.${key}`)

  const pick = async (file: File) => {
    if (file.size > MAX_BYTES) return toast.error(t('errors.IMPORT_INVALID'))
    setBusy(true)
    try {
      const res = await call('import.parse', { entity, fileName: file.name, data: await toBase64(file) })
      setParsed(res)
      setMapping(res.mapping)
      setStep('columns')
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (!parsed) return
    setBusy(true)
    try {
      setPreview(await call('import.preview', { token: parsed.token, entity, mapping }))
      setStep('check')
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!parsed) return
    setBusy(true)
    try {
      setResult(await call('import.commit', { token: parsed.token, entity, mapping, mode }))
      setStep('done')
      invalidate(entity === 'products' ? 'catalog.' : 'customers.')
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  const exportTemplate = async () => {
    try {
      const res = await call('reports.export', { table: { title: t(`importer.${entity}`), columns: fields.map((f) => ({ key: f.key, header: label(f.key) })), rows: [] }, format: 'xlsx' })
      if (res.path) toast.success(t('reports.exported', { path: res.path }))
    } catch (err) {
      toastError(err)
    }
  }

  const exportProblems = async (issues: ImportResult['failed']) => {
    try {
      const res = await call('reports.export', {
        table: {
          title: t('importer.problemsTitle'),
          subtitle: parsed?.fileName,
          columns: [
            { key: 'row', header: t('importer.row'), type: 'number' },
            { key: 'field', header: t('importer.field') },
            { key: 'problem', header: t('importer.problem') },
            { key: 'value', header: t('importer.value') }
          ],
          rows: issues.map((i) => ({ row: i.row, field: i.field ? label(i.field) : '', problem: t(`importer.codes.${i.code}`), value: i.code === 'ERROR' ? t(`errors.${i.value}`, { defaultValue: i.value ?? '' }) : (i.value ?? '') }))
        },
        format: 'xlsx'
      })
      if (res.path) toast.success(t('reports.exported', { path: res.path }))
    } catch (err) {
      toastError(err)
    }
  }

  const requiredMissing = fields.some((f) => f.required && mapping[f.key] == null)
  const idx = STEPS.indexOf(step)

  return (
    <Dialog
      open
      size="xl"
      dismissable={!busy}
      onOpenChange={(o) => !o && !busy && onClose()}
      title={
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-primary" /> {t(`importer.${entity}`)}
        </span>
      }
      footer={
        step === 'columns' ? (
          <>
            <Button variant="ghost" onClick={() => setStep('file')} disabled={busy}>
              {t('common.back')}
            </Button>
            <Button onClick={() => void check()} disabled={requiredMissing} loading={busy}>
              {t('importer.next')}
            </Button>
          </>
        ) : step === 'check' && preview ? (
          busy ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Spinner className="size-4" /> {t('importer.running')}
            </p>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep('columns')}>
                {t('common.back')}
              </Button>
              <Button onClick={() => void run()} disabled={preview.valid === 0}>
                <Upload /> {t('importer.run', { count: mode === 'skip' ? preview.valid - preview.existing : preview.valid })}
              </Button>
            </>
          )
        ) : step === 'done' ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : undefined
      }
    >
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-bold', i < idx ? 'bg-success text-white' : i === idx ? 'bg-primary text-primary-fg' : 'bg-sunken text-subtle')}>{i + 1}</span>
            <span className={cn('text-sm font-semibold', i === idx ? 'text-fg' : 'text-subtle')}>{t(`importer.steps.${s}`)}</span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
          </div>
        ))}
      </div>

      {step === 'file' ? (
        <div className="space-y-4">
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void pick(f)
            }}
          />
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong p-10 text-center transition hover:border-primary hover:bg-primary-soft/30"
          >
            {busy ? <Spinner className="size-8" /> : <Upload className="size-8 text-primary" />}
            <span className="text-base font-bold">{t('importer.chooseFile')}</span>
            <span className="text-sm text-muted">{t('importer.dropHint')}</span>
          </button>
          <Button variant="link" onClick={() => void exportTemplate()}>
            <FileDown /> {t('importer.template')}
          </Button>
        </div>
      ) : null}

      {step === 'columns' && parsed ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            <span className="font-bold text-fg">{parsed.fileName}</span> · {t('importer.rows', { count: parsed.rowCount })}
          </p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-3 rounded-xl px-1 py-1">
                <span className="text-sm font-semibold">
                  {label(f.key)}
                  {f.required ? <span className="ms-1 text-danger">*</span> : null}
                </span>
                <Select
                  className={cn('w-56', f.required && mapping[f.key] == null && 'border-danger')}
                  value={mapping[f.key] == null ? '' : String(mapping[f.key])}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}
                  aria-label={label(f.key)}
                >
                  <option value="">{t('importer.notImported')}</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-subtle">{t('importer.sample')}</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="bg-sunken text-muted">
                  <tr>
                    {parsed.headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-2 py-1.5 text-start font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.sample.map((r, ri) => (
                    <tr key={ri} className="border-t border-line">
                      {parsed.headers.map((_h, ci) => (
                        <td key={ci} className="max-w-48 truncate whitespace-nowrap px-2 py-1">
                          {r[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {step === 'check' && preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat tone="success" label={t('importer.ready', { count: preview.valid })} value={fmtNumber(preview.valid)} />
            <Stat tone="info" label={t('importer.existing', { count: preview.existing })} value={fmtNumber(preview.existing)} />
            <Stat tone={preview.issues.length ? 'danger' : 'neutral'} label={t('importer.problems', { count: preview.issues.length })} value={fmtNumber(preview.issues.length)} />
          </div>
          {preview.existing > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunken/60 p-3">
              <div>
                <p className="text-sm font-bold">{t('importer.existingMode')}</p>
                <p className="text-xs text-muted">{entity === 'products' ? t('importer.updateHintProducts') : t('importer.updateHintCustomers')}</p>
              </div>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'skip', label: t('importer.skip') },
                  { value: 'update', label: t('importer.update') }
                ]}
              />
            </div>
          ) : null}
          {preview.issues.length ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-bold text-subtle">{t('importer.problemsTitle')}</p>
                <Button size="sm" variant="ghost" onClick={() => void exportProblems(preview.issues)}>
                  <FileDown /> {t('importer.failedReport')}
                </Button>
              </div>
              <IssueTable issues={preview.issues.slice(0, 200)} label={label} />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'done' && result ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-lg font-extrabold text-success">
            <CheckCircle2 className="size-6" /> {t('importer.result')}
          </p>
          <div className="grid grid-cols-4 gap-3">
            <Stat tone="success" label={t('importer.created')} value={fmtNumber(result.created)} />
            <Stat tone="info" label={t('importer.updated')} value={fmtNumber(result.updated)} />
            <Stat tone="neutral" label={t('importer.skipped')} value={fmtNumber(result.skipped)} />
            <Stat tone={result.failed.length ? 'danger' : 'neutral'} label={t('importer.failed')} value={fmtNumber(result.failed.length)} />
          </div>
          {result.failed.length ? (
            <Button variant="outline" onClick={() => void exportProblems(result.failed)}>
              <FileDown /> {t('importer.failedReport')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  )
}

function IssueTable({ issues, label }: { issues: ImportResult['failed']; label: (k: string) => string }) {
  const { t } = useTranslation()
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-sunken text-xs text-muted">
          <tr>
            <th className="px-3 py-1.5 text-start">{t('importer.row')}</th>
            <th className="px-3 py-1.5 text-start">{t('importer.field')}</th>
            <th className="px-3 py-1.5 text-start">{t('importer.problem')}</th>
            <th className="px-3 py-1.5 text-start">{t('importer.value')}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i, n) => (
            <tr key={n} className="border-t border-line">
              <td className="px-3 py-1.5 tabular">{i.row}</td>
              <td className="px-3 py-1.5">{i.field ? label(i.field) : '—'}</td>
              <td className="px-3 py-1.5 font-semibold text-danger">{t(`importer.codes.${i.code}`)}</td>
              <td className="max-w-48 truncate px-3 py-1.5 text-muted">{i.value ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
