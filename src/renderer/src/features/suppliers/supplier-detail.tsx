import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Ban, HandCoins, PackagePlus, Pencil, Undo2, Wallet } from 'lucide-react'
import type { PurchaseListItem, SupplierLedgerDto, SupplierPaymentDto } from '@shared/types/suppliers'
import type { PaymentMethod } from '@shared/constants/enums'
import type { VariantListItem } from '@shared/types/catalog'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput, NumberInput } from '../../components/ui/input'
import { Badge, Card, EmptyState, Segmented, Stat, Tabs } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { DataTable, type Column } from '../../components/ui/table'
import { ProductPicker } from '../../components/product-picker'
import { SupplierBalance, SupplierFormDialog } from './suppliers-page'
import { PurchaseDialog, PURCHASE_TONE } from './purchase-dialog'

export default function SupplierDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [tab, setTab] = useState('purchases')
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<'OUT' | 'IN' | null>(null)
  const [returning, setReturning] = useState(false)
  const [purchase, setPurchase] = useState<string | null>(null)
  const s = useApi('suppliers.get', { id })
  const purchases = useApi('purchases.list', { supplierId: id, page: 1, pageSize: 100 }, { enabled: tab === 'purchases' })
  const payments = useApi('suppliers.payments', { id }, { enabled: tab === 'payments' && can(['view_supplier_balances', 'pay_suppliers']) })
  const ledger = useApi('suppliers.ledger', { id }, { enabled: tab === 'ledger' && can(['view_supplier_balances', 'pay_suppliers']) })
  const voidPayment = useApiMutation('suppliers.voidPayment', { invalidate: ['suppliers.', 'shifts.'], success: 'common.saved' })
  if (!s.data) return <PageLoader />
  const sup = s.data
  const canMoney = can(['view_supplier_balances', 'pay_suppliers'])

  const purchaseCols: Column<PurchaseListItem>[] = [
    { key: 'n', header: '#', cell: (p) => <span className="font-semibold">{p.number}</span> },
    { key: 'inv', header: t('suppliers.invoiceNo'), cell: (p) => <span className="text-muted">{p.supplierInvoiceNo ?? '—'}</span> },
    { key: 'd', header: t('common.date'), cell: (p) => <span className="text-muted">{fmtDate(p.orderedAt)}</span> },
    { key: 'q', header: t('common.qty'), align: 'center', cell: (p) => fmtNumber(p.itemCount) },
    { key: 't', header: t('suppliers.valueReceived'), align: 'end', cell: (p) => <span className="font-bold tabular">{fmtMoney(p.total)}</span> },
    { key: 'p', header: t('suppliers.paidNow'), align: 'end', cell: (p) => <span className="tabular text-muted">{fmtMoney(p.paid)}</span> },
    { key: 's', header: t('common.status'), cell: (p) => <Badge tone={PURCHASE_TONE[p.status]}>{t(`suppliers.statuses.${p.status}`)}</Badge> }
  ]
  const paymentCols: Column<SupplierPaymentDto>[] = [
    { key: 'd', header: t('common.date'), cell: (p) => <span className="text-muted">{fmtDate(p.createdAt, true)}</span> },
    { key: 'dir', header: t('common.type'), cell: (p) => t(`suppliers.direction.${p.direction}`) },
    { key: 'm', header: t('pos.payment'), cell: (p) => t(`pos.methods.${p.method}`) },
    { key: 'po', header: t('suppliers.purchase'), cell: (p) => p.purchaseNumber ?? '—' },
    { key: 'a', header: t('common.amount'), align: 'end', cell: (p) => <span className={cn('font-bold tabular', p.voidedAt && 'line-through opacity-50')}>{fmtMoney(p.amount)}</span> },
    { key: 'u', header: t('common.user'), cell: (p) => <span className="text-muted">{p.userName}</span> },
    {
      key: 'x',
      header: '',
      cell: (p) =>
        !p.voidedAt && can('pay_suppliers') ? (
          <Button variant="ghost" size="icon-sm" onClick={() => voidPayment.mutate({ id: p.id, reason: 'Cancelled by user' })} aria-label={t('suppliers.voidPayment')}>
            <Ban />
          </Button>
        ) : null
    }
  ]
  const ledgerCols: Column<SupplierLedgerDto>[] = [
    { key: 'd', header: t('common.date'), cell: (l) => <span className="text-muted">{fmtDate(l.createdAt, true)}</span> },
    { key: 't', header: t('common.type'), cell: (l) => t(`suppliers.ledgerTypes.${l.type}`, { defaultValue: l.type }) },
    { key: 'n', header: t('common.note'), cell: (l) => <span className="text-muted">{l.note ?? '—'}</span> },
    { key: 'a', header: t('common.amount'), align: 'end', cell: (l) => <span className={cn('font-bold tabular', l.amount > 0 ? 'text-danger' : 'text-success')} dir="ltr">{l.amount > 0 ? '+' : ''}{fmtMoney(l.amount)}</span> },
    { key: 'b', header: t('suppliers.balance'), align: 'end', cell: (l) => <SupplierBalance value={l.balanceAfter} /> }
  ]

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/suppliers')}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
          <div>
            <h1 className="text-xl font-extrabold">{sup.name}</h1>
            <p className="text-sm text-muted">{[sup.companyName, sup.phone, sup.address].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('manage_purchases') ? (
            <Button onClick={() => navigate(`/suppliers/purchases/new?supplierId=${sup.id}`)}>
              <PackagePlus /> {t('suppliers.newPurchase')}
            </Button>
          ) : null}
          {can('pay_suppliers') ? (
            <>
              <Button variant="success" onClick={() => setPaying('OUT')}>
                <HandCoins /> {t('suppliers.pay')}
              </Button>
              {sup.balance < 0 ? (
                <Button variant="outline" onClick={() => setPaying('IN')}>
                  <Wallet /> {t('suppliers.receiveMoney')}
                </Button>
              ) : null}
            </>
          ) : null}
          {can('manage_purchases') ? (
            <Button variant="outline" onClick={() => setReturning(true)}>
              <Undo2 /> {t('suppliers.returnToSupplier')}
            </Button>
          ) : null}
          {can('manage_suppliers') ? (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
          ) : null}
        </div>
      </div>
      {canMoney ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={t('suppliers.balance')} value={<SupplierBalance value={sup.balance} large />} icon={Wallet} tone={sup.balance > 0 ? 'danger' : 'success'} />
          <Stat label={t('suppliers.totalPurchases')} value={fmtMoney(sup.totalPurchases)} icon={PackagePlus} />
          <Stat label={t('suppliers.totalPaid')} value={fmtMoney(sup.totalPaid)} icon={HandCoins} tone="info" />
        </div>
      ) : null}
      <Tabs
        className="mb-3"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'purchases', label: t('suppliers.purchases') },
          ...(canMoney ? [{ value: 'payments', label: t('suppliers.payments') }, { value: 'ledger', label: t('suppliers.ledger') }] : [])
        ]}
      />
      <Card padded={false}>
        {tab === 'purchases' ? <DataTable columns={purchaseCols} rows={purchases.data?.items ?? []} rowKey={(p) => p.id} onRowClick={(p) => setPurchase(p.id)} empty={<EmptyState title={t('common.noResults')} />} /> : null}
        {tab === 'payments' ? <DataTable columns={paymentCols} rows={payments.data ?? []} rowKey={(p) => p.id} dense empty={<EmptyState title={t('common.noResults')} />} /> : null}
        {tab === 'ledger' ? <DataTable columns={ledgerCols} rows={ledger.data ?? []} rowKey={(l) => l.id} dense empty={<EmptyState title={t('common.noResults')} />} /> : null}
      </Card>
      {editing ? <SupplierFormDialog value={sup} onClose={() => setEditing(false)} /> : null}
      {paying ? <PaySupplierDialog supplierId={sup.id} direction={paying} balance={sup.balance} onClose={() => setPaying(null)} /> : null}
      {returning ? <ReturnDialog supplierId={sup.id} onClose={() => setReturning(false)} /> : null}
      {purchase ? <PurchaseDialog purchaseId={purchase} onClose={() => setPurchase(null)} /> : null}
    </div>
  )
}

function PaySupplierDialog({ supplierId, direction, balance, onClose }: { supplierId: string; direction: 'OUT' | 'IN'; balance: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(Math.abs(balance))
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const pay = useApiMutation('suppliers.pay', { invalidate: ['suppliers.', 'shifts.', 'purchases.'], success: 'suppliers.paymentDone', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={direction === 'OUT' ? t('suppliers.pay') : t('suppliers.receiveMoney')}
      footer={
        <Button variant="success" loading={pay.isPending} disabled={amount <= 0} onClick={() => pay.mutate({ supplierId, amount, method, direction, reference: reference || null })}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-sunken p-3 text-sm">
          <SupplierBalance value={balance} />
        </div>
        <Field label={t('common.amount')}>
          <MoneyInput autoFocus value={amount} onChange={(v) => setAmount(v ?? 0)} className="h-12 text-lg font-bold" />
        </Field>
        <Field label={t('pos.payment')}>
          <Segmented className="w-full" value={method} onChange={setMethod} options={(['CASH', 'TRANSFER', 'WALLET', 'CARD'] as const).map((m) => ({ value: m, label: t(`pos.methods.${m}`) }))} />
        </Field>
        <Field label={t('common.note')} optional>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}

function ReturnDialog({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<Array<{ item: VariantListItem; qty: number; unitCost: number }>>([])
  const [note, setNote] = useState('')
  const ret = useApiMutation('purchases.return', { invalidate: ['suppliers.', 'catalog.', 'inventory.', 'purchases.'], success: 'suppliers.returnDone', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('suppliers.returnToSupplier')}
      footer={
        <Button loading={ret.isPending} disabled={lines.length === 0} onClick={() => ret.mutate({ supplierId, note: note || null, items: lines.map((l) => ({ variantId: l.item.variantId, qty: l.qty, unitCost: l.unitCost })) })}>
          <Undo2 /> {t('suppliers.returnToSupplier')}
        </Button>
      }
    >
      <div className="space-y-3">
        <ProductPicker autoFocus filter={(i) => i.trackStock && !i.trackSerials} onPick={(item) => setLines((ls) => (ls.some((l) => l.item.variantId === item.variantId) ? ls : [...ls, { item, qty: 1, unitCost: item.costPrice ?? 0 }]))} />
        {lines.map((l, i) => (
          <div key={l.item.variantId} className="flex items-center gap-2 rounded-xl border border-line p-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.item.name}</span>
            <div className="w-24">
              <NumberInput value={l.qty} min={1} max={l.item.stockQty} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: v ?? 1 } : x)))} />
            </div>
            <div className="w-36">
              <MoneyInput value={l.unitCost} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, unitCost: v ?? 0 } : x)))} />
            </div>
          </div>
        ))}
        <Field label={t('common.note')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-end text-sm">
          {t('common.total')}: <b className="tabular">{fmtMoney(lines.reduce((a, l) => a + l.qty * l.unitCost, 0))}</b>
        </p>
      </div>
    </Dialog>
  )
}

