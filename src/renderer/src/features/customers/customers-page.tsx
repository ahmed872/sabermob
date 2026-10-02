import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileSpreadsheet, UserPlus, Users } from 'lucide-react'
import type { CustomerQueryInput } from '@shared/schemas/customers'
import type { CustomerListItem } from '@shared/types/customers'
import { useApi } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { cn, debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { SearchInput, Select } from '../../components/ui/input'
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'
import { CustomerFormDialog } from './customer-form'
import { ImportDialog } from '../importer/import-dialog'

export function BalanceText({ value }: { value: number }) {
  const { t } = useTranslation()
  if (value === 0) return <span className="text-subtle">—</span>
  return (
    <span className={cn('font-bold tabular', value > 0 ? 'text-danger' : 'text-success')}>
      {value > 0 ? t('customers.owes') : t('customers.credit')} {fmtMoney(Math.abs(value))}
    </span>
  )
}

export default function CustomersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState<CustomerQueryInput>({ page: 1, pageSize: 50, sort: 'recent' })
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const setSearch = useMemo(() => debounce((v: string) => setQuery((x) => ({ ...x, q: v || undefined, page: 1 })), 200), [])
  const list = useApi('customers.list', query, { placeholderData: (p) => p })
  const columns: Column<CustomerListItem>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (c) => (
        <div>
          <p className="font-semibold">{c.name}</p>
          <p className="text-xs text-muted" dir="ltr">
            {c.phone ?? '—'}
          </p>
        </div>
      )
    },
    { key: 'type', header: t('customers.type'), cell: (c) => (c.type === 'REGULAR' ? <span className="text-muted">{t('customers.types.REGULAR')}</span> : <Badge tone="primary">{t(`customers.types.${c.type}`)}</Badge>) },
    { key: 'spent', header: t('customers.totalSpent'), align: 'end', cell: (c) => <span className="tabular">{fmtMoney(c.totalSpent)}</span> },
    { key: 'last', header: t('customers.lastPurchase'), cell: (c) => <span className="text-muted">{c.lastPurchaseAt ? fmtDate(c.lastPurchaseAt) : '—'}</span> },
    { key: 'points', header: t('customers.points'), align: 'center', cell: (c) => <span className="tabular text-muted">{fmtNumber(c.loyaltyPoints)}</span> },
    { key: 'balance', header: t('customers.balance'), align: 'end', cell: (c) => <BalanceText value={c.balance} /> }
  ]
  return (
    <div className="flex h-full flex-col p-5">
      <PageHeader
        icon={Users}
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        actions={
          can('manage_customers') ? (
            <>
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet /> {t('importer.button')}
              </Button>
              <Button onClick={() => setCreating(true)}>
                <UserPlus /> {t('customers.newCustomer')}
              </Button>
            </>
          ) : null
        }
      />
      <Card padded={false} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="min-w-64 flex-1">
            <SearchInput
              autoFocus
              value={q}
              placeholder={`${t('common.name')} / ${t('common.phone')}`}
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
          <Select className="w-36" value={query.type ?? ''} onChange={(e) => setQuery({ ...query, type: (e.target.value || undefined) as CustomerQueryInput['type'], page: 1 })}>
            <option value="">{t('common.all')}</option>
            {(['REGULAR', 'VIP', 'WHOLESALE'] as const).map((ty) => (
              <option key={ty} value={ty}>
                {t(`customers.types.${ty}`)}
              </option>
            ))}
          </Select>
          <Select className="w-40" value={query.sort} onChange={(e) => setQuery({ ...query, sort: e.target.value as CustomerQueryInput['sort'] })}>
            {(['recent', 'name', 'balance'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`customers.sort.${s}`)}
              </option>
            ))}
          </Select>
          <Button variant={query.withBalance ? 'soft' : 'outline'} onClick={() => setQuery({ ...query, withBalance: !query.withBalance || undefined, page: 1 })}>
            {t('customers.withDebt')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataTable
            columns={columns}
            rows={list.data?.items ?? []}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/customers/${c.id}`)}
            loading={list.isFetching}
            empty={<EmptyState icon={Users} title={t('customers.noCustomers')} />}
          />
        </div>
        <div className="border-t border-line">
          <Pagination page={query.page ?? 1} pageSize={50} total={list.data?.total ?? 0} onPage={(p) => setQuery({ ...query, page: p })} />
        </div>
      </Card>
      {importOpen ? <ImportDialog entity="customers" onClose={() => setImportOpen(false)} /> : null}
      {creating ? <CustomerFormDialog value={{}} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/customers/${c.id}`)} /> : null}
    </div>
  )
}
