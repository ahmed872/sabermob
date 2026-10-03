import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlarmClock, AlertTriangle, CheckCircle2, Coins, HandCoins, PackageMinus, PackagePlus, PackageX, ShoppingCart, Smartphone, Sparkles, TrendingUp, Truck, Wrench } from 'lucide-react'
import type { DashboardData } from '@shared/types/reports'
import { useApi } from '../../lib/query'
import { fmtMoney, fmtNumber, fmtRelative, numberLocale } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useApp, useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Card, CardHeader, EmptyState, Stat } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { BarLineChart, ShareBars } from '../../components/charts'

export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const session = useApp((s) => s.session)!
  const q = useApi('reports.dashboard', undefined, { refetchInterval: 60_000, staleTime: 0, refetchOnMount: 'always' })
  const d = q.data
  if (!d) return <PageLoader />
  const alerts = buildAlerts(d, t)

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{t('dashboard.greeting', { name: session.fullName.split(' ')[0] })}</h1>
          <p className="text-sm text-muted">{new Intl.DateTimeFormat(numberLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('create_sale') ? (
            <Button onClick={() => navigate('/pos')}>
              <ShoppingCart /> {t('dashboard.quick.sale')}
            </Button>
          ) : null}
          {can('manage_repairs') ? (
            <Button variant="outline" onClick={() => navigate('/repairs/new')}>
              <Smartphone /> {t('dashboard.quick.repair')}
            </Button>
          ) : null}
          {can('manage_inventory') ? (
            <Button variant="outline" onClick={() => navigate('/inventory/products/new')}>
              <PackagePlus /> {t('dashboard.quick.product')}
            </Button>
          ) : null}
          {can('manage_purchases') ? (
            <Button variant="outline" onClick={() => navigate('/suppliers/purchases/new')}>
              <Truck /> {t('dashboard.quick.purchase')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat icon={Coins} label={t('dashboard.todaySales')} value={fmtMoney(d.today.sales)} hint={`${t('dashboard.salesCount', { count: d.today.count })} · ${t('dashboard.vsYesterday', { amount: fmtMoney(d.yesterdaySales) })}`} onClick={can('view_sales') ? () => navigate('/sales/history') : undefined} />
        {d.today.profit !== null ? <Stat icon={TrendingUp} tone="success" label={t('dashboard.todayProfit')} value={fmtMoney(d.today.profit)} onClick={can('view_reports') ? () => navigate('/reports/profit') : undefined} /> : null}
        <Stat icon={Wrench} tone="info" label={t('dashboard.pendingRepairs')} value={fmtNumber(d.pendingRepairs)} hint={d.overdueRepairs ? t('dashboard.alertOverdue', { count: d.overdueRepairs }) : undefined} onClick={can('view_repairs') ? () => navigate(d.overdueRepairs ? '/repairs?overdue=1' : '/repairs') : undefined} />
        <Stat icon={PackageMinus} tone="warning" label={t('dashboard.lowStock')} value={fmtNumber(d.lowStock + d.outOfStock)} onClick={can('view_inventory') ? () => navigate(d.lowStock ? '/inventory?stock=low' : '/inventory?stock=out') : undefined} />
        {d.supplierDebt !== null ? <Stat icon={HandCoins} tone="danger" label={t('dashboard.supplierDebt')} value={fmtMoney(d.supplierDebt)} hint={d.customerDebt !== null ? `${t('dashboard.customerDebt')}: ${fmtMoney(d.customerDebt)}` : undefined} onClick={() => navigate('/suppliers')} /> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title={t('dashboard.trend')}
            icon={TrendingUp}
            action={
              d.trend[0]?.profit !== null ? (
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-primary" /> {t('dashboard.sales')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-3 bg-success" /> {t('dashboard.profit')}
                  </span>
                </span>
              ) : null
            }
          />
          <BarLineChart
            data={d.trend.map((x) => ({ label: x.day, bar: x.sales, line: x.profit }))}
            format={(v) => fmtMoney(v)}
            labelFormat={(l) => `${Number(l.slice(8, 10))}/${Number(l.slice(5, 7))}`}
          />
        </Card>
        <Card>
          <CardHeader title={t('dashboard.alerts')} icon={Sparkles} />
          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm font-semibold text-success">
              <CheckCircle2 className="size-5" /> {t('dashboard.allGood')}
            </p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <button key={a.text} onClick={() => navigate(a.to)} className={cn('flex w-full items-center gap-2.5 rounded-xl p-2.5 text-start text-sm font-semibold transition hover:brightness-95', a.cls)}>
                  <a.icon className="size-5 shrink-0" />
                  {a.text}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={t('dashboard.repairsList')} icon={Wrench} />
          {d.pendingRepairList.length === 0 ? (
            <EmptyState icon={Wrench} title={t('repairs.noRepairs')} />
          ) : (
            <div className="divide-y divide-line">
              {d.pendingRepairList.map((r) => (
                <button key={r.id} onClick={() => navigate(`/repairs/${r.id}`)} className="flex w-full items-center gap-3 py-2 text-start hover:bg-sunken/50">
                  <span className="w-20 shrink-0 text-xs font-bold text-muted" dir="ltr">
                    {r.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.deviceModel}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.customerName} {r.technicianName ? `· ${r.technicianName}` : ''}
                    </span>
                  </span>
                  {r.overdue ? <AlarmClock className="size-4 text-danger" /> : null}
                  <span className="text-xs text-subtle">{fmtRelative(r.receivedAt)}</span>
                </button>
              ))}
            </div>
          )}
          {d.technicians.length ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              {d.technicians.map((tech) => (
                <span key={tech.name} className="rounded-lg bg-sunken px-2.5 py-1 text-xs font-semibold">
                  🔧 {tech.name === '—' ? t('repairs.unassigned') : tech.name}: {t('dashboard.openRepairs', { count: tech.open })}
                </span>
              ))}
            </div>
          ) : null}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('dashboard.topProducts')} icon={ShoppingCart} />
            {d.topProducts.length ? (
              <ShareBars rows={d.topProducts.map((p) => ({ label: p.name, value: p.qty, hint: fmtMoney(p.revenue) }))} format={(v) => fmtNumber(v)} />
            ) : (
              <EmptyState title={t('reports.noData')} />
            )}
          </Card>
          {d.topOffers.length ? (
            <Card>
              <CardHeader title={t('dashboard.topOffers')} icon={Sparkles} />
              <ShareBars rows={d.topOffers.map((o) => ({ label: o.name, value: o.profit, hint: `${o.accepted}✓` }))} format={(v) => fmtMoney(v)} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function buildAlerts(d: DashboardData, t: (k: string, o?: Record<string, unknown>) => string) {
  const out: Array<{ text: string; to: string; icon: typeof AlertTriangle; cls: string }> = []
  if (d.outOfStock) out.push({ text: t('dashboard.alertOut', { count: d.outOfStock }), to: '/inventory?stock=out', icon: PackageX, cls: 'bg-danger-soft text-danger' })
  if (d.lowStock) out.push({ text: t('dashboard.alertLow', { count: d.lowStock }), to: '/inventory?stock=low', icon: PackageMinus, cls: 'bg-warning-soft text-warning' })
  if (d.overdueRepairs) out.push({ text: t('dashboard.alertOverdue', { count: d.overdueRepairs }), to: '/repairs?overdue=1', icon: AlarmClock, cls: 'bg-danger-soft text-danger' })
  if (d.readyRepairs) out.push({ text: t('dashboard.alertReady', { count: d.readyRepairs }), to: '/repairs?status=READY', icon: CheckCircle2, cls: 'bg-success-soft text-success' })
  if (d.deadStock) out.push({ text: t('dashboard.alertDead', { count: d.deadStock }), to: '/offers', icon: Sparkles, cls: 'bg-info-soft text-info' })
  if (d.unreviewedShiftDiffs) out.push({ text: t('dashboard.alertShift', { count: d.unreviewedShiftDiffs }), to: '/sales/shifts', icon: AlertTriangle, cls: 'bg-warning-soft text-warning' })
  return out
}
