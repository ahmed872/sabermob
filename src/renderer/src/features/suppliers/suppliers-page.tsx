import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PackagePlus, Plus, Truck } from 'lucide-react'
import type { SupplierDto, SupplierListItem } from '@shared/types/suppliers'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney } from '../../lib/format'
import { cn, debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput, SearchInput, Textarea } from '../../components/ui/input'
import { Card, EmptyState, PageHeader, Segmented } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'

/** "We owe 15,000" / "Owes us 2,000" — direction is always explicit. */
export function SupplierBalance({ value, large }: { value: number; large?: boolean }) {
  const { t } = useTranslation()
  if (value === 0) return <span className={cn('font-semibold text-success', large && 'text-xl')}>{t('suppliers.settled')}</span>
  return (
    <span className={cn('font-bold tabular', value > 0 ? 'text-danger' : 'text-success', large && 'text-xl')}>
      {value > 0 ? t('suppliers.weOwe') : t('suppliers.theyOwe')} {fmtMoney(Math.abs(value))}
    </span>
  )
}

export default function SuppliersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearchValue] = useState('')
  const [withBalance, setWithBalance] = useState(false)
  const [creating, setCreating] = useState(false)
  const setSearch = useMemo(() => debounce((v: string) => (setSearchValue(v), setPage(1)), 200), [])
  const list = useApi('suppliers.list', { q: search || undefined, page, pageSize: 50, withBalance: withBalance || undefined }, { placeholderData: (p) => p })
  const columns: Column<SupplierListItem>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (s) => (
        <div>
          <p className="font-semibold">{s.name}</p>
          <p className="text-xs text-muted">{[s.companyName, s.phone].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      )
    },
    { key: 'total', header: t('suppliers.totalPurchases'), align: 'end', cell: (s) => <span className="tabular">{fmtMoney(s.totalPurchases)}</span> },
    { key: 'last', header: t('customers.lastPurchase'), cell: (s) => <span className="text-muted">{s.lastPurchaseAt ? fmtDate(s.lastPurchaseAt) : '—'}</span> },
    ...(can(['view_supplier_balances', 'pay_suppliers']) ? [{ key: 'bal', header: t('suppliers.balance'), align: 'end' as const, cell: (s: SupplierListItem) => <SupplierBalance value={s.balance} /> }] : [])
  ]
  return (
    <div className="flex h-full flex-col p-5">
      <PageHeader
        icon={Truck}
        title={t('suppliers.title')}
        subtitle={t('suppliers.subtitle')}
        actions={
          <>
            {can('manage_purchases') ? (
              <Button variant="outline" onClick={() => navigate('/suppliers/purchases/new')}>
                <PackagePlus /> {t('suppliers.newPurchase')}
              </Button>
            ) : null}
            {can('manage_suppliers') ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> {t('suppliers.newSupplier')}
              </Button>
            ) : null}
          </>
        }
      />
      <Card padded={false} className="flex min-h-0 flex-1 flex-col">
        <div className="flex gap-2 border-b border-line p-3">
          <div className="flex-1">
            <SearchInput
              value={q}
              autoFocus
              placeholder={t('common.searchPlaceholder')}
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
          {can(['view_supplier_balances', 'pay_suppliers']) ? (
            <Segmented
              value={withBalance ? 'b' : 'a'}
              onChange={(v) => setWithBalance(v === 'b')}
              options={[
                { value: 'a', label: t('common.all') },
                { value: 'b', label: t('suppliers.balance') }
              ]}
            />
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/suppliers/${s.id}`)} empty={<EmptyState icon={Truck} title={t('suppliers.noSuppliers')} />} />
        </div>
        <div className="border-t border-line">
          <Pagination page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
        </div>
      </Card>
      {creating ? <SupplierFormDialog value={{}} onClose={() => setCreating(false)} onSaved={(s) => navigate(`/suppliers/${s.id}`)} /> : null}
    </div>
  )
}

export function SupplierFormDialog({ value, onClose, onSaved }: { value: Partial<SupplierDto>; onClose: () => void; onSaved?: (s: SupplierDto) => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    name: value.name ?? '',
    companyName: value.companyName ?? '',
    phone: value.phone ?? '',
    phone2: value.phone2 ?? '',
    address: value.address ?? '',
    notes: value.notes ?? '',
    opening: 0,
    openingSign: 1 as 1 | -1
  })
  const save = useApiMutation('suppliers.save', {
    invalidate: ['suppliers.'],
    success: 'common.saved',
    onSuccess: (s) => {
      onSaved?.(s)
      onClose()
    }
  })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? t('suppliers.editSupplier') : t('suppliers.newSupplier')}
      footer={
        <Button
          loading={save.isPending}
          disabled={!f.name.trim()}
          onClick={() =>
            save.mutate({
              id: value.id,
              name: f.name,
              companyName: f.companyName || null,
              phone: f.phone || null,
              phone2: f.phone2 || null,
              address: f.address || null,
              notes: f.notes || null,
              openingBalance: value.id ? undefined : f.opening * f.openingSign || undefined
            })
          }
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.name')}>
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('suppliers.company')} optional>
          <Input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
        </Field>
        <Field label={t('common.phone')} optional>
          <Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label={`${t('common.phone')} 2`} optional>
          <Input dir="ltr" value={f.phone2} onChange={(e) => setF({ ...f, phone2: e.target.value })} />
        </Field>
        <Field label={t('common.address')} optional className="sm:col-span-2">
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        {!value.id ? (
          <Field label={t('suppliers.openingBalance')} hint={t('suppliers.openingHint')} className="sm:col-span-2">
            <div className="flex gap-2">
              <Segmented
                value={f.openingSign === 1 ? 'owe' : 'owed'}
                onChange={(v) => setF({ ...f, openingSign: v === 'owe' ? 1 : -1 })}
                options={[
                  { value: 'owe', label: t('suppliers.weOwe') },
                  { value: 'owed', label: t('suppliers.theyOwe') }
                ]}
              />
              <div className="flex-1">
                <MoneyInput value={f.opening} onChange={(v) => setF({ ...f, opening: v ?? 0 })} />
              </div>
            </div>
          </Field>
        ) : null}
        <Field label={t('common.notes')} optional className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  )
}
