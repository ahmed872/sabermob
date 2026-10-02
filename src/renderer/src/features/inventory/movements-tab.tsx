import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Wallet } from 'lucide-react'
import { STOCK_MOVEMENT_TYPES } from '@shared/constants/enums'
import type { StockMovementDto } from '@shared/types/catalog'
import { useApi } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Select } from '../../components/ui/input'
import { Card, EmptyState, Stat } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'

export function MovementsTab({ variantId }: { variantId?: string }) {
  const { t } = useTranslation()
  const can = useCan()
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const list = useApi('inventory.movements', { page, pageSize: 50, variantId, type: type || undefined }, { placeholderData: (p) => p })
  const valuation = useApi('inventory.valuation', undefined, { enabled: can('view_cost') && !variantId })

  const columns: Column<StockMovementDto>[] = [
    { key: 'date', header: t('common.date'), cell: (m) => <span className="whitespace-nowrap text-muted">{fmtDate(m.createdAt, true)}</span> },
    ...(variantId ? [] : [{ key: 'product', header: t('common.name'), cell: (m: StockMovementDto) => <span className="font-semibold">{m.productName}</span> }]),
    { key: 'type', header: t('common.type'), cell: (m) => t(`inventory.movementTypes.${m.type}`) },
    {
      key: 'qty',
      header: t('common.qty'),
      align: 'center',
      cell: (m) => <span className={cn('font-bold tabular', m.qty > 0 ? 'text-success' : 'text-danger')} dir="ltr">{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
    },
    { key: 'bal', header: t('inventory.balance'), align: 'center', cell: (m) => <span className="tabular">{fmtNumber(m.balanceAfter)}</span> },
    ...(can('view_cost') ? [{ key: 'cost', header: t('inventory.costPrice'), align: 'end' as const, cell: (m: StockMovementDto) => <span className="tabular text-muted">{fmtMoney(m.unitCost)}</span> }] : []),
    { key: 'reason', header: t('common.reason'), cell: (m) => <span className="text-muted">{m.reason ?? '—'}</span> },
    { key: 'user', header: t('common.user'), cell: (m) => <span className="text-muted">{m.userName ?? '—'}</span> }
  ]

  return (
    <div className="flex h-full flex-col gap-4">
      {valuation.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Wallet} label={`${t('inventory.valuation')} — ${t('inventory.costValue')}`} value={fmtMoney(valuation.data.costValue)} />
          <Stat icon={Wallet} tone="success" label={`${t('inventory.valuation')} — ${t('inventory.retailValue')}`} value={fmtMoney(valuation.data.retailValue)} />
          <Stat icon={History} tone="info" label={t('inventory.skuCount')} value={fmtNumber(valuation.data.skuCount)} />
          <Stat icon={History} tone="warning" label={t('common.qty')} value={fmtNumber(valuation.data.totalUnits)} />
        </div>
      ) : null}
      <Card padded={false} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Select
            className="w-56"
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('common.all')}</option>
            {STOCK_MOVEMENT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`inventory.movementTypes.${ty}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(m) => m.id} dense loading={list.isFetching} empty={<EmptyState icon={History} title={t('common.noResults')} />} />
        </div>
        <div className="border-t border-line">
          <Pagination page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
        </div>
      </Card>
    </div>
  )
}
