import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Award, HandCoins, Pencil, Phone, Trash2, Receipt, ScrollText, Scale } from 'lucide-react'
import type { LedgerEntryDto } from '@shared/types/customers'
import type { SaleListItem } from '@shared/types/sales'
import type { RepairListItem } from '@shared/types/repairs'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput, Select } from '../../components/ui/input'
import { Badge, Card, EmptyState, Stat, Tabs } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { DataTable, type Column } from '../../components/ui/table'
import { SaleDetailDialog, STATUS_TONE } from '../sales/sale-detail'
import { CustomerFormDialog } from './customer-form'
import { BalanceText } from './customers-page'

export default function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const confirm = useConfirm()
  const [tab, setTab] = useState('ledger')
  const [editing, setEditing] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [sale, setSale] = useState<string | null>(null)
  const c = useApi('customers.get', { id })
  const ledger = useApi('customers.ledger', { id }, { enabled: tab === 'ledger' })
  const sales = useApi('pos.sales', { customerId: id, page: 1, pageSize: 100 }, { enabled: tab === 'sales' })
  const repairs = useApi('repairs.list', { q: c.data?.phone ?? '', page: 1, pageSize: 100 }, { enabled: tab === 'repairs' && !!c.data?.phone && can('view_repairs') })
  const del = useApiMutation('customers.delete', { invalidate: ['customers.'], success: 'common.deleted', onSuccess: () => navigate('/customers') })
  if (!c.data) return <PageLoader />
  const cust = c.data

  const ledgerCols: Column<LedgerEntryDto>[] = [
    { key: 'd', header: t('common.date'), cell: (l) => <span className="text-muted">{fmtDate(l.createdAt, true)}</span> },
    { key: 't', header: t('common.type'), cell: (l) => t(`customers.ledgerTypes.${l.type}`, { defaultValue: l.type }) },
    { key: 'n', header: t('common.note'), cell: (l) => <span className="text-muted">{l.note ?? '—'}</span> },
    { key: 'a', header: t('common.amount'), align: 'end', cell: (l) => <span className={cn('font-bold tabular', l.amount > 0 ? 'text-danger' : 'text-success')} dir="ltr">{l.amount > 0 ? '+' : ''}{fmtMoney(l.amount)}</span> },
    { key: 'b', header: t('customers.balance'), align: 'end', cell: (l) => <span className="tabular">{fmtMoney(l.balanceAfter)}</span> },
    { key: 'u', header: t('common.user'), cell: (l) => <span className="text-muted">{l.userName ?? '—'}</span> }
  ]
  const saleCols: Column<SaleListItem>[] = [
    { key: 'n', header: t('sales.number'), cell: (s) => <span className="font-semibold" dir="ltr">{s.invoiceNumber ?? s.number}</span> },
    { key: 'd', header: t('common.date'), cell: (s) => <span className="text-muted">{fmtDate(s.createdAt, true)}</span> },
    { key: 'i', header: t('sales.items'), align: 'center', cell: (s) => fmtNumber(s.itemCount) },
    { key: 't', header: t('common.total'), align: 'end', cell: (s) => <span className="font-bold tabular">{fmtMoney(s.total)}</span> },
    { key: 's', header: t('common.status'), cell: (s) => <Badge tone={STATUS_TONE[s.status]}>{t(`sales.statuses.${s.status}`)}</Badge> }
  ]
  const repairCols: Column<RepairListItem>[] = [
    { key: 'n', header: t('repairs.ticket'), cell: (r) => <span className="font-semibold">{r.number}</span> },
    { key: 'd', header: t('repairs.device'), cell: (r) => r.deviceModel },
    { key: 'c', header: t('repairs.complaint'), cell: (r) => <span className="line-clamp-1 text-muted">{r.complaint}</span> },
    { key: 'r', header: t('repairs.receivedAt'), cell: (r) => <span className="text-muted">{fmtDate(r.receivedAt)}</span> }
  ]

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/customers')}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-extrabold">
              {cust.name}
              {cust.type !== 'REGULAR' ? <Badge tone="primary">{t(`customers.types.${cust.type}`)}</Badge> : null}
              {cust.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted" dir="ltr">
              <Phone className="size-3.5" /> {cust.phone ?? '—'} {cust.phone2 ? ` · ${cust.phone2}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {can('collect_customer_debt') && cust.balance > 0 ? (
            <Button variant="success" onClick={() => setCollecting(true)}>
              <HandCoins /> {t('customers.collect')}
            </Button>
          ) : null}
          {can('manage_settings') ? (
            <Button variant="outline" onClick={() => setAdjusting(true)}>
              <Scale /> {t('customers.adjust')}
            </Button>
          ) : null}
          {can('manage_customers') ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> {t('common.edit')}
              </Button>
              <Button variant="ghost" onClick={async () => (await confirm({ title: t('common.confirmDelete'), body: cust.name, danger: true })) && del.mutate({ id })}>
                <Trash2 />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('customers.balance')} value={<BalanceText value={cust.balance} />} icon={HandCoins} tone={cust.balance > 0 ? 'danger' : 'success'} />
        <Stat label={t('customers.totalSpent')} value={fmtMoney(cust.totalSpent)} icon={Receipt} />
        <Stat label={t('customers.purchases')} value={fmtNumber(cust.salesCount)} icon={ScrollText} tone="info" hint={cust.lastPurchaseAt ? fmtDate(cust.lastPurchaseAt) : undefined} />
        <Stat label={t('customers.points')} value={fmtNumber(cust.loyaltyPoints)} icon={Award} tone="warning" />
      </div>
      {cust.notes || cust.address ? (
        <Card className="mb-4 text-sm">
          {cust.address ? <p>{cust.address}</p> : null}
          {cust.notes ? <p className="text-muted">{cust.notes}</p> : null}
        </Card>
      ) : null}
      <Tabs
        className="mb-3"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'ledger', label: t('customers.ledger') },
          { value: 'sales', label: t('customers.purchases'), count: cust.salesCount },
          ...(can('view_repairs') ? [{ value: 'repairs', label: t('customers.repairs'), count: cust.repairsCount }] : [])
        ]}
      />
      <Card padded={false}>
        {tab === 'ledger' ? <DataTable columns={ledgerCols} rows={ledger.data ?? []} rowKey={(l) => l.id} dense empty={<EmptyState title={t('common.noResults')} />} /> : null}
        {tab === 'sales' ? <DataTable columns={saleCols} rows={sales.data?.items ?? []} rowKey={(s) => s.id} onRowClick={(s) => setSale(s.id)} empty={<EmptyState title={t('sales.noSales')} />} /> : null}
        {tab === 'repairs' ? (
          <DataTable columns={repairCols} rows={repairs.data?.items ?? []} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/repairs/${r.id}`)} empty={<EmptyState title={t('repairs.noRepairs')} />} />
        ) : null}
      </Card>
      {editing ? <CustomerFormDialog value={cust} onClose={() => setEditing(false)} /> : null}
      {collecting ? <CollectDialog customerId={id} name={cust.name} balance={cust.balance} onClose={() => setCollecting(false)} /> : null}
      {adjusting ? <AdjustDialog customerId={id} onClose={() => setAdjusting(false)} /> : null}
      {sale ? <SaleDetailDialog saleId={sale} onClose={() => setSale(null)} /> : null}
    </div>
  )
}

function CollectDialog({ customerId, name, balance, onClose }: { customerId: string; name: string; balance: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(balance)
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'WALLET' | 'TRANSFER'>('CASH')
  const collect = useApiMutation('customers.collect', { invalidate: ['customers.', 'shifts.'], success: 'customers.collected', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('customers.collectTitle', { name })}
      footer={
        <Button variant="success" loading={collect.isPending} disabled={amount <= 0 || amount > balance} onClick={() => collect.mutate({ customerId, amount, method })}>
          <HandCoins /> {t('customers.collect')}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="rounded-xl bg-danger-soft p-3 text-sm font-bold text-danger">
          {t('customers.owes')} {fmtMoney(balance)}
        </p>
        <Field label={t('common.amount')}>
          <MoneyInput autoFocus value={amount} onChange={(v) => setAmount(v ?? 0)} className="h-12 text-lg font-bold" />
        </Field>
        <Field label={t('pos.payment')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {(['CASH', 'CARD', 'WALLET', 'TRANSFER'] as const).map((m) => (
              <option key={m} value={m}>
                {t(`pos.methods.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  )
}

function AdjustDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(0)
  const [sign, setSign] = useState<1 | -1>(1)
  const [note, setNote] = useState('')
  const adjust = useApiMutation('customers.adjust', { invalidate: ['customers.'], success: 'common.saved', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('customers.adjust')}
      footer={
        <Button loading={adjust.isPending} disabled={amount <= 0 || note.trim().length < 2} onClick={() => adjust.mutate({ customerId, amount: sign * amount, note })}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <Select value={String(sign)} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)}>
          <option value="1">+ {t('customers.owes')}</option>
          <option value="-1">− {t('customers.credit')}</option>
        </Select>
        <MoneyInput value={amount} onChange={(v) => setAmount(v ?? 0)} />
        <Field label={t('common.reason')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
