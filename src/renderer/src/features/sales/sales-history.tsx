import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Receipt } from 'lucide-react'
import type { SaleQueryInput } from '@shared/schemas/sales'
import type { SaleListItem } from '@shared/types/sales'
import { useApi } from '../../lib/query'
import { dayRange, fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { SearchInput, Select } from '../../components/ui/input'
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'
import { SaleDetailDialog, STATUS_TONE } from './sale-detail'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all'

function periodRange(p: Period): { from?: string; to?: string } {
  const today = dayRange()
  const day = 86_400_000
  switch (p) {
    case 'today':
      return today
    case 'yesterday':
      return { from: new Date(new Date(today.from).getTime() - day).toISOString(), to: today.from }
    case 'week':
      return { from: new Date(new Date(today.from).getTime() - 6 * day).toISOString(), to: today.to }
    case 'month': {
      const d = new Date()
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), to: today.to }
    }
    default:
      return {}
  }
}

export default function SalesHistoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [period, setPeriod] = useState<Period>('today')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState<SaleQueryInput>({ page: 1, pageSize: 50 })
  const [params, setParams] = useSearchParams()
  const open = params.get('sale')
  const setOpen = (id: string | null) => setParams(id ? { sale: id } : {}, { replace: true })
  const setSearch = useMemo(() => debounce((v: string) => setQuery((x) => ({ ...x, q: v || undefined, page: 1 })), 250), [])
  const range = periodRange(period)
  const list = useApi('pos.sales', { ...query, ...range }, { placeholderData: (p) => p })

  const columns: Column<SaleListItem>[] = [
    {
      key: 'number',
      header: t('sales.number'),
      cell: (s) => (
        <div>
          <p className="font-bold" dir="ltr">
            {s.invoiceNumber ?? s.number}
          </p>
          <p className="text-xs text-muted">{fmtDate(s.createdAt, true)}</p>
        </div>
      )
    },
    { key: 'customer', header: t('sales.customer'), cell: (s) => s.customerName ?? <span className="text-subtle">{t('pos.walkIn')}</span> },
    { key: 'cashier', header: t('sales.cashier'), cell: (s) => <span className="text-muted">{s.cashierName}</span> },
    { key: 'items', header: t('sales.items'), align: 'center', cell: (s) => <span className="tabular">{fmtNumber(s.itemCount)}</span> },
    {
      key: 'total',
      header: t('common.total'),
      align: 'end',
      cell: (s) => (
        <div>
          <p className="font-extrabold tabular">{fmtMoney(s.total)}</p>
          {s.creditAmount > 0 ? <p className="text-xs text-warning">{t('sales.credit')} {fmtMoney(s.creditAmount)}</p> : null}
        </div>
      )
    },
    ...(can('view_profit') ? [{ key: 'profit', header: t('sales.profit'), align: 'end' as const, cell: (s: SaleListItem) => <span className="tabular text-success">{fmtMoney(s.profit)}</span> }] : []),
    { key: 'status', header: t('sales.status'), cell: (s) => <Badge tone={STATUS_TONE[s.status]}>{t(`sales.statuses.${s.status}`)}</Badge> }
  ]

  return (
    <div className="flex h-full flex-col p-5">
      <PageHeader
        icon={Receipt}
        title={t('pos.history')}
        actions={
          <Button variant="outline" onClick={() => navigate('/pos')}>
            <ArrowLeft className="rtl:rotate-180" /> {t('nav.pos')}
          </Button>
        }
      />
      <Card padded={false} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="min-w-64 flex-1">
            <SearchInput
              autoFocus
              value={q}
              placeholder={t('sales.searchPlaceholder')}
              onChange={(e) => {
                setQ(e.target.value)
                setSearch(e.target.value)
              }}
              onClear={() => {
                setQ('')
                setSearch('')
              }}
            />
          </div>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="today">{t('common.today')}</option>
            <option value="yesterday">{t('common.yesterday')}</option>
            <option value="week">{t('common.thisWeek')}</option>
            <option value="month">{t('common.thisMonth')}</option>
            <option value="all">{t('common.all')}</option>
          </Select>
          <Select className="w-44" value={query.status ?? ''} onChange={(e) => setQuery({ ...query, status: (e.target.value || undefined) as SaleQueryInput['status'], page: 1 })}>
            <option value="">{t('common.all')}</option>
            {(['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`sales.statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(s) => s.id} onRowClick={(s) => setOpen(s.id)} loading={list.isFetching} empty={<EmptyState icon={Receipt} title={t('sales.noSales')} />} />
        </div>
        <div className="border-t border-line">
          <Pagination page={query.page ?? 1} pageSize={50} total={list.data?.total ?? 0} onPage={(p) => setQuery({ ...query, page: p })} />
        </div>
      </Card>
      {open ? <SaleDetailDialog saleId={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}
