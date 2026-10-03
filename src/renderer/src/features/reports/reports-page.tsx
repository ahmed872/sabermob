import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BarChart3, FileDown, FileSpreadsheet, FileText } from 'lucide-react'
import type { ExportTable, ReportGroup } from '@shared/types/reports'
import type { PermissionKey } from '@shared/permissions'
import { call } from '../../lib/api'
import { toastError, useApi } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber, numberLocale } from '../../lib/format'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Input, Select } from '../../components/ui/input'
import { Card, CardHeader, EmptyState, PageHeader, Stat, Tabs } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { DataTable, type Column } from '../../components/ui/table'
import { BarLineChart, ShareBars } from '../../components/charts'
import { statusLabel } from '../repairs/repairs-page'
import { addDays, startOfDay } from '@shared/dates'

type RangeKey = 'today' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom'

function rangeOf(k: RangeKey, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date()
  const tomorrow = addDays(now, 1)
  switch (k) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: tomorrow.toISOString() }
    case 'week':
      return { from: addDays(now, -6).toISOString(), to: tomorrow.toISOString() }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: tomorrow.toISOString() }
    case 'lastMonth':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: tomorrow.toISOString() }
    default:
      return { from: new Date(`${custom.from}T00:00:00`).toISOString(), to: addDays(new Date(`${custom.to}T00:00:00`), 1).toISOString() }
  }
}

const TABS: Array<{ key: string; perm: PermissionKey[] }> = [
  { key: 'sales', perm: ['view_reports'] },
  { key: 'profit', perm: ['view_profit'] },
  { key: 'inventory', perm: ['view_reports', 'view_inventory'] },
  { key: 'repairs', perm: ['view_reports'] },
  { key: 'suppliers', perm: ['view_supplier_balances'] },
  { key: 'employees', perm: ['view_reports'] }
]

export default function ReportsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const tabs = TABS.filter((x) => can(x.perm))
  const { tab = tabs[0]?.key ?? 'sales' } = useParams()
  const [rk, setRk] = useState<RangeKey>('month')
  const today = new Date().toISOString().slice(0, 10)
  const [custom, setCustom] = useState({ from: today, to: today })
  const [group, setGroup] = useState<ReportGroup>('day')
  const range = useMemo(() => rangeOf(rk, custom), [rk, custom])
  const subtitle = `${fmtDate(range.from)} → ${fmtDate(new Date(new Date(range.to).getTime() - 1))}`

  return (
    <div className="h-full overflow-y-auto p-5">
      <PageHeader icon={BarChart3} title={t('reports.title')} subtitle={t('reports.subtitle')} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => navigate(`/reports/${v}`)} items={tabs.map((x) => ({ value: x.key, label: t(`reports.tabs.${x.key}`) }))} />
        {tab !== 'inventory' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-40" value={rk} onChange={(e) => setRk(e.target.value as RangeKey)} aria-label={t('reports.range')}>
              {(['today', 'week', 'month', 'lastMonth', 'year', 'custom'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`reports.ranges.${k}`)}
                </option>
              ))}
            </Select>
            {rk === 'custom' ? (
              <>
                <Input type="date" className="w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <Input type="date" className="w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </>
            ) : null}
            {tab === 'sales' || tab === 'profit' ? (
              <Select className="w-32" value={group} onChange={(e) => setGroup(e.target.value as ReportGroup)} aria-label={t('reports.group')}>
                {(['day', 'week', 'month', 'year'] as const).map((g) => (
                  <option key={g} value={g}>
                    {t(`reports.groups.${g}`)}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        ) : null}
      </div>
      {tab === 'sales' ? <SalesTab range={range} group={group} subtitle={subtitle} /> : null}
      {tab === 'profit' ? <ProfitTab range={range} group={group} subtitle={subtitle} /> : null}
      {tab === 'inventory' ? <InventoryTab /> : null}
      {tab === 'repairs' ? <RepairsTab range={range} subtitle={subtitle} /> : null}
      {tab === 'suppliers' ? <SuppliersTab range={range} subtitle={subtitle} /> : null}
      {tab === 'employees' ? <EmployeesTab range={range} subtitle={subtitle} /> : null}
    </div>
  )
}

export function ExportButtons({ build }: { build: () => ExportTable }) {
  const { t } = useTranslation()
  const can = useCan()
  if (!can('export_reports')) return null
  const run = async (format: 'csv' | 'xlsx' | 'pdf') => {
    try {
      const res = await call('reports.export', { table: build(), format })
      if (res.path) toast.success(t('reports.exported', { path: res.path }))
    } catch (err) {
      toastError(err)
    }
  }
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => void run('xlsx')}>
        <FileSpreadsheet /> {t('reports.xlsx')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void run('csv')}>
        <FileDown /> {t('reports.csv')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void run('pdf')}>
        <FileText /> {t('reports.pdf')}
      </Button>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      {children}
    </Card>
  )
}

const periodLabel = (p: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return new Intl.DateTimeFormat(numberLocale(), { day: 'numeric', month: 'short' }).format(new Date(`${p}T12:00:00`))
  return p
}

function SalesTab({ range, group, subtitle }: { range: { from: string; to: string }; group: ReportGroup; subtitle: string }) {
  const { t } = useTranslation()
  const q = useApi('reports.sales', { ...range, group })
  const d = q.data
  if (!d) return <PageLoader />
  const productCols: Column<(typeof d.topProducts)[number]>[] = [
    { key: 'n', header: t('reports.product'), cell: (r) => r.name },
    { key: 'q', header: t('reports.qty'), align: 'center', cell: (r) => fmtNumber(r.qty) },
    { key: 'r', header: t('reports.revenue'), align: 'end', cell: (r) => <span className="tabular">{fmtMoney(r.revenue)}</span> },
    ...(d.totals.profit !== null ? [{ key: 'p', header: t('reports.profit'), align: 'end' as const, cell: (r: (typeof d.topProducts)[number]) => <span className="tabular text-success">{fmtMoney(r.profit)}</span> }] : [])
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('reports.revenue')} value={fmtMoney(d.totals.revenue)} hint={`${t('reports.count')}: ${fmtNumber(d.totals.count)}`} />
        {d.totals.profit !== null ? <Stat tone="success" label={t('reports.profit')} value={fmtMoney(d.totals.profit)} /> : null}
        <Stat tone="info" label={t('reports.avgTicket')} value={fmtMoney(d.totals.avgTicket)} />
        <Stat tone="warning" label={t('reports.discounts')} value={fmtMoney(d.totals.discount)} hint={`${t('reports.refunds')}: ${fmtMoney(d.totals.refunds)}`} />
      </div>
      <Section
        title={t('reports.revenue')}
        action={
          <ExportButtons
            build={() => ({
              title: `${t('reports.tabs.sales')}`,
              subtitle,
              columns: [
                { key: 'period', header: t('reports.period') },
                { key: 'count', header: t('reports.count'), type: 'number' },
                { key: 'revenue', header: t('reports.revenue'), type: 'money' },
                ...(d.totals.profit !== null ? [{ key: 'profit', header: t('reports.profit'), type: 'money' as const }] : [])
              ],
              rows: d.series.map((s) => ({ period: s.period, count: s.count, revenue: s.revenue, profit: s.profit }))
            })}
          />
        }
      >
        {d.series.length ? <BarLineChart data={d.series.map((s) => ({ label: s.period, bar: s.revenue, line: s.profit }))} format={(v) => fmtMoney(v)} labelFormat={periodLabel} /> : <EmptyState title={t('reports.noData')} />}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('reports.byMethod')}>
          <ShareBars rows={d.byMethod.map((m) => ({ label: t(`pos.methods.${m.method}`, { defaultValue: m.method }), value: m.amount }))} format={(v) => fmtMoney(v)} />
        </Section>
        <Section title={t('reports.byCategory')}>
          <ShareBars rows={d.byCategory.map((c) => ({ label: c.name, value: c.revenue, hint: fmtNumber(c.qty) }))} format={(v) => fmtMoney(v)} />
        </Section>
      </div>
      <Section
        title={t('reports.topProducts')}
        action={
          <ExportButtons
            build={() => ({
              title: t('reports.topProducts'),
              subtitle,
              columns: [
                { key: 'name', header: t('reports.product') },
                { key: 'qty', header: t('reports.qty'), type: 'number' },
                { key: 'revenue', header: t('reports.revenue'), type: 'money' },
                ...(d.totals.profit !== null ? [{ key: 'profit', header: t('reports.profit'), type: 'money' as const }] : [])
              ],
              rows: d.topProducts.map((p) => ({ ...p }))
            })}
          />
        }
      >
        <DataTable columns={productCols} rows={d.topProducts} rowKey={(r) => r.name} dense empty={<EmptyState title={t('reports.noData')} />} />
      </Section>
    </div>
  )
}

function ProfitTab({ range, group, subtitle }: { range: { from: string; to: string }; group: ReportGroup; subtitle: string }) {
  const { t } = useTranslation()
  const d = useApi('reports.profit', { ...range, group }).data
  if (!d) return <PageLoader />
  const rows = [
    { k: 'productProfit', v: d.productProfit },
    { k: 'serviceProfit', v: d.serviceProfit },
    { k: 'repairProfit', v: d.repairProfit },
    { k: 'grossProfit', v: d.grossProfit },
    { k: 'expenses', v: -d.expenses },
    { k: 'estimatedNet', v: d.estimatedNet }
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="success" label={t('reports.grossProfit')} value={fmtMoney(d.grossProfit)} />
        <Stat label={t('reports.productProfit')} value={fmtMoney(d.productProfit + d.serviceProfit)} />
        <Stat tone="info" label={t('reports.repairProfit')} value={fmtMoney(d.repairProfit)} hint={`${t('reports.repairRevenue')}: ${fmtMoney(d.repairRevenue)}`} />
        <Stat tone="primary" label={t('reports.estimatedNet')} value={fmtMoney(d.estimatedNet)} hint={t('reports.netHint')} />
      </div>
      <Section
        title={t('reports.profit')}
        action={
          <ExportButtons
            build={() => ({
              title: t('reports.tabs.profit'),
              subtitle,
              columns: [
                { key: 'label', header: t('common.description') },
                { key: 'value', header: t('common.amount'), type: 'money' }
              ],
              rows: rows.map((r) => ({ label: t(`reports.${r.k}`), value: r.v }))
            })}
          />
        }
      >
        {d.series.length ? <BarLineChart data={d.series.map((s) => ({ label: s.period, bar: s.profit }))} format={(v) => fmtMoney(v)} labelFormat={periodLabel} /> : <EmptyState title={t('reports.noData')} />}
        <dl className="mt-4 divide-y divide-line rounded-xl border border-line px-3 text-sm">
          {rows.map((r) => (
            <div key={r.k} className={`flex justify-between py-2 ${r.k === 'estimatedNet' || r.k === 'grossProfit' ? 'font-extrabold' : ''}`}>
              <dt>{t(`reports.${r.k}`)}</dt>
              <dd className="tabular">{fmtMoney(r.v)}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  )
}

function InventoryTab() {
  const { t } = useTranslation()
  const can = useCan()
  const d = useApi('reports.inventory').data
  if (!d) return <PageLoader />
  const simple = (title: string, rows: Array<Record<string, string | number | null>>, cols: Array<{ key: string; header: string; type?: 'money' | 'number' | 'date' }>) => (
    <Section title={title} action={<ExportButtons build={() => ({ title, columns: cols, rows })} />}>
      <DataTable
        dense
        columns={cols.map((c) => ({
          key: c.key,
          header: c.header,
          align: c.type === 'money' || c.type === 'number' ? 'end' : 'start',
          cell: (r: Record<string, string | number | null>) =>
            c.type === 'money' ? fmtMoney(r[c.key] as number) : c.type === 'date' ? (r[c.key] ? fmtDate(r[c.key] as string) : '—') : c.type === 'number' ? fmtNumber(r[c.key] as number) : String(r[c.key] ?? '—')
        }))}
        rows={rows.slice(0, 50)}
        rowKey={(r) => String(r.name) + String(r.stock)}
        empty={<EmptyState title={t('reports.noData')} />}
      />
    </Section>
  )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can('view_cost') ? <Stat label={`${t('reports.valuation')} (${t('reports.cost')})`} value={fmtMoney(d.valuation.cost)} /> : null}
        <Stat tone="success" label={t('reports.valuation')} value={fmtMoney(d.valuation.retail)} />
        <Stat tone="info" label={t('reports.units')} value={fmtNumber(d.valuation.units)} />
        <Stat tone="warning" label={t('reports.items')} value={fmtNumber(d.valuation.items)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {simple(t('reports.low'), d.low, [
          { key: 'name', header: t('reports.product') },
          { key: 'stock', header: t('reports.stock'), type: 'number' },
          { key: 'minStock', header: t('reports.minStock'), type: 'number' }
        ])}
        {simple(t('reports.dead'), d.dead, [
          { key: 'name', header: t('reports.product') },
          { key: 'stock', header: t('reports.stock'), type: 'number' },
          ...(can('view_cost') ? [{ key: 'value', header: t('reports.value'), type: 'money' as const }] : []),
          { key: 'lastSoldAt', header: t('reports.lastSold'), type: 'date' }
        ])}
        {simple(t('reports.fast'), d.fast, [
          { key: 'name', header: t('reports.product') },
          { key: 'qty', header: t('reports.qty'), type: 'number' },
          { key: 'stock', header: t('reports.stock'), type: 'number' }
        ])}
        {simple(t('reports.slow'), d.slow, [
          { key: 'name', header: t('reports.product') },
          { key: 'qty', header: t('reports.qty'), type: 'number' },
          { key: 'stock', header: t('reports.stock'), type: 'number' }
        ])}
      </div>
    </div>
  )
}

function RepairsTab({ range, subtitle }: { range: { from: string; to: string }; subtitle: string }) {
  const { t, i18n } = useTranslation()
  const d = useApi('reports.repairs', range).data
  if (!d) return <PageLoader />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t('reports.received')} value={fmtNumber(d.received)} />
        <Stat tone="success" label={t('reports.delivered')} value={fmtNumber(d.delivered)} hint={`${t('reports.avgDays')}: ${d.avgDays}`} />
        <Stat tone="danger" label={t('reports.delayed')} value={fmtNumber(d.delayed)} />
        <Stat tone="info" label={t('reports.repairRevenue')} value={fmtMoney(d.revenue)} />
        {d.profit !== null ? <Stat tone="success" label={t('reports.profit')} value={fmtMoney(d.profit)} /> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('common.status')}>
          <ShareBars rows={d.byStatus.filter((s) => s.count > 0).map((s) => ({ label: statusLabel(s, i18n.language), value: s.count }))} format={(v) => fmtNumber(v)} />
        </Section>
        <Section
          title={t('dashboard.technicians')}
          action={
            <ExportButtons
              build={() => ({
                title: `${t('reports.tabs.repairs')} — ${t('dashboard.technicians')}`,
                subtitle,
                columns: [
                  { key: 'name', header: t('reports.employee') },
                  { key: 'delivered', header: t('reports.delivered'), type: 'number' },
                  { key: 'open', header: t('reports.open'), type: 'number' },
                  { key: 'revenue', header: t('reports.repairRevenue'), type: 'money' },
                  { key: 'avgDays', header: t('reports.avgDays'), type: 'number' }
                ],
                rows: d.technicians.map((x) => ({ ...x }))
              })}
            />
          }
        >
          <DataTable
            dense
            columns={[
              { key: 'n', header: t('reports.employee'), cell: (r) => r.name },
              { key: 'd', header: t('reports.delivered'), align: 'center', cell: (r) => fmtNumber(r.delivered) },
              { key: 'o', header: t('reports.open'), align: 'center', cell: (r) => fmtNumber(r.open) },
              { key: 'r', header: t('reports.repairRevenue'), align: 'end', cell: (r) => fmtMoney(r.revenue) },
              { key: 'a', header: t('reports.avgDays'), align: 'center', cell: (r) => r.avgDays }
            ]}
            rows={d.technicians}
            rowKey={(r) => r.name}
          />
        </Section>
      </div>
    </div>
  )
}

function SuppliersTab({ range, subtitle }: { range: { from: string; to: string }; subtitle: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const d = useApi('reports.suppliers', range).data
  if (!d) return <PageLoader />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="danger" label={t('reports.owed')} value={fmtMoney(d.totalOwed)} />
        <Stat tone="success" label={t('reports.owedToUs')} value={fmtMoney(d.totalOwedToUs)} />
        <Stat label={t('reports.purchases')} value={fmtMoney(d.purchases)} hint={subtitle} />
        <Stat tone="info" label={t('reports.payments')} value={fmtMoney(d.payments)} hint={subtitle} />
      </div>
      <Section
        title={t('suppliers.balance')}
        action={
          <ExportButtons
            build={() => ({
              title: `${t('reports.tabs.suppliers')} — ${t('suppliers.balance')}`,
              columns: [
                { key: 'name', header: t('common.name') },
                { key: 'balance', header: t('suppliers.balance'), type: 'money' }
              ],
              rows: d.balances.map((b) => ({ name: b.name, balance: b.balance }))
            })}
          />
        }
      >
        <DataTable
          dense
          columns={[
            { key: 'n', header: t('common.name'), cell: (r) => r.name },
            { key: 'b', header: t('suppliers.balance'), align: 'end', cell: (r) => <span className={r.balance > 0 ? 'font-bold text-danger' : 'font-bold text-success'}>{r.balance > 0 ? t('suppliers.weOwe') : t('suppliers.theyOwe')} {fmtMoney(Math.abs(r.balance))}</span> }
          ]}
          rows={d.balances}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/suppliers/${r.id}`)}
          empty={<EmptyState title={t('reports.noData')} />}
        />
      </Section>
    </div>
  )
}

function EmployeesTab({ range, subtitle }: { range: { from: string; to: string }; subtitle: string }) {
  const { t } = useTranslation()
  const d = useApi('reports.employees', range).data
  if (!d) return <PageLoader />
  return (
    <Section
      title={t('reports.tabs.employees')}
      action={
        <ExportButtons
          build={() => ({
            title: t('reports.tabs.employees'),
            subtitle,
            columns: [
              { key: 'name', header: t('reports.employee') },
              { key: 'sales', header: t('reports.count'), type: 'number' },
              { key: 'revenue', header: t('reports.revenue'), type: 'money' },
              { key: 'discounts', header: t('reports.discounts'), type: 'money' },
              { key: 'refunds', header: t('reports.refunds'), type: 'money' },
              { key: 'voids', header: t('reports.voids'), type: 'number' },
              { key: 'actions', header: t('reports.actions'), type: 'number' }
            ],
            rows: d.rows.map((r) => ({ ...r }))
          })}
        />
      }
    >
      <DataTable
        columns={[
          { key: 'n', header: t('reports.employee'), cell: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 's', header: t('reports.count'), align: 'center', cell: (r) => fmtNumber(r.sales) },
          { key: 'r', header: t('reports.revenue'), align: 'end', cell: (r) => fmtMoney(r.revenue) },
          { key: 'd', header: t('reports.discounts'), align: 'end', cell: (r) => fmtMoney(r.discounts) },
          { key: 'f', header: t('reports.refunds'), align: 'end', cell: (r) => fmtMoney(r.refunds) },
          { key: 'v', header: t('reports.voids'), align: 'center', cell: (r) => fmtNumber(r.voids) },
          { key: 'a', header: t('reports.actions'), align: 'center', cell: (r) => fmtNumber(r.actions) }
        ]}
        rows={d.rows}
        rowKey={(r) => r.userId}
      />
    </Section>
  )
}
