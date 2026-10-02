import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Gift, Lightbulb, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { OFFER_TYPES, CUSTOMER_TYPES, type OfferType } from '@shared/constants/enums'
import { bpToPercentString } from '@shared/money'
import type { OfferDto, OfferStats } from '@shared/types/offers'
import type { OfferSaveInput } from '@shared/schemas/offers'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtMoney, fmtNumber, fmtPercentBp } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput, NumberInput, Select } from '../../components/ui/input'
import { Badge, Card, Checkbox, EmptyState, PageHeader, SwitchRow, Tabs } from '../../components/ui/misc'
import { DataTable, type Column } from '../../components/ui/table'
import { ProductPicker } from '../../components/product-picker'

const SUGGEST_TYPES: OfferType[] = ['CROSS_SELL', 'BUNDLE', 'CART_THRESHOLD', 'CLEARANCE']

export default function OffersPage() {
  const { t } = useTranslation()
  const can = useCan()
  const confirm = useConfirm()
  const [tab, setTab] = useState(can('manage_offers') ? 'offers' : 'results')
  const [editing, setEditing] = useState<Partial<OfferDto> | null>(null)
  const list = useApi('offers.list')
  const stats = useApi('offers.analytics', {}, { enabled: tab === 'results' && can('view_offer_analytics') })
  const insights = useApi('offers.insights')
  const save = useApiMutation('offers.save', { invalidate: ['offers.'], success: 'common.saved' })
  const del = useApiMutation('offers.delete', { invalidate: ['offers.'], success: 'common.deleted' })

  const statCols: Column<OfferStats>[] = [
    { key: 'n', header: t('common.name'), cell: (s) => <span className="font-semibold">{s.offerId ? s.name : t(`offers.sources.${s.name}`, { defaultValue: s.name })}</span> },
    { key: 'sh', header: t('offers.shown'), align: 'center', cell: (s) => fmtNumber(s.shown) },
    { key: 'ac', header: t('offers.accepted'), align: 'center', cell: (s) => fmtNumber(s.accepted) },
    { key: 'cv', header: t('offers.converted'), align: 'center', cell: (s) => fmtNumber(s.converted) },
    { key: 'r', header: t('offers.conversion'), align: 'center', cell: (s) => <Badge tone={s.conversionBp >= 2000 ? 'success' : 'neutral'}>{fmtPercentBp(s.conversionBp)}</Badge> },
    { key: 'rev', header: t('offers.revenue'), align: 'end', cell: (s) => <span className="tabular">{fmtMoney(s.revenue)}</span> },
    { key: 'd', header: t('offers.discountCost'), align: 'end', cell: (s) => <span className="tabular text-danger">{fmtMoney(s.discountCost)}</span> },
    { key: 'p', header: t('offers.profit'), align: 'end', cell: (s) => <span className="font-bold tabular text-success">{fmtMoney(s.profit)}</span> }
  ]

  return (
    <div className="h-full overflow-y-auto p-5">
      <PageHeader
        icon={Gift}
        title={t('offers.title')}
        subtitle={t('offers.subtitle')}
        actions={
          can('manage_offers') ? (
            <Button onClick={() => setEditing({ type: 'CROSS_SELL', isActive: true, priority: 0, discountBp: 1000 })}>
              <Plus /> {t('offers.newOffer')}
            </Button>
          ) : null
        }
      />
      {insights.data && insights.data.deadStockCount > 0 && can('manage_offers') ? (
        <Card className="mb-4 flex items-center justify-between gap-3 border-warning/40 bg-warning-soft">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <Lightbulb className="size-5" /> {t('offers.deadStock', { count: insights.data.deadStockCount, value: fmtMoney(insights.data.deadStockValue) })}
          </p>
          <Button size="sm" variant="outline" onClick={() => setEditing({ type: 'CLEARANCE', isActive: true, discountBp: 1500, name: t('offers.types.CLEARANCE') })}>
            {t('offers.createClearance')}
          </Button>
        </Card>
      ) : null}
      <Tabs
        className="mb-3"
        value={tab}
        onValueChange={setTab}
        items={[
          ...(can(['manage_offers', 'view_offer_analytics']) ? [{ value: 'offers', label: t('offers.offersTab') }] : []),
          ...(can('view_offer_analytics') ? [{ value: 'results', label: t('offers.analytics') }] : [])
        ]}
      />
      {tab === 'offers' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data?.map((o) => (
            <Card key={o.id} className={cn('flex flex-col', !o.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{o.name}</p>
                  <p className="text-xs text-muted">{t(`offers.types.${o.type}`)}</p>
                </div>
                <div className="flex gap-1">
                  {o.autoApply ? <Badge tone="info">Auto</Badge> : null}
                  <Badge tone={o.isActive ? 'success' : 'neutral'}>{o.isActive ? t('common.active') : t('common.inactive')}</Badge>
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-primary">
                {o.bundlePrice !== null ? fmtMoney(o.bundlePrice) : o.discountBp !== null ? `-${bpToPercentString(o.discountBp)}%` : o.discountAmount !== null ? `-${fmtMoney(o.discountAmount)}` : `${o.buyQty}+${o.getQty}`}
              </p>
              <div className="mt-2 space-y-1 text-xs text-muted">
                {o.triggerNames.length ? <p>{t('offers.when')}: {o.triggerNames.join('، ')}</p> : null}
                <p>{t('offers.offerOn')}: {o.targetNames.join('، ')}</p>
                {o.minCartTotal ? <p>{t('offers.minCartTotal')}: {fmtMoney(o.minCartTotal)}</p> : null}
                <p>{t('offers.uses', { count: o.usageCount })}</p>
              </div>
              {can('manage_offers') ? (
                <div className="mt-auto flex justify-end gap-1 pt-3">
                  <Button size="sm" variant="ghost" onClick={() => save.mutate({ ...toInput(o), isActive: !o.isActive })}>
                    {o.isActive ? t('common.disabled') : t('common.enabled')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                    {t('common.edit')}
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={async () => (await confirm({ title: t('common.confirmDelete'), body: o.name, danger: true })) && del.mutate({ id: o.id })}>
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
          {list.data?.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState icon={Gift} title={t('offers.noOffers')} body={t('offers.noOffersBody')} />
            </div>
          ) : null}
        </div>
      ) : (
        <Card padded={false}>
          <DataTable columns={statCols} rows={stats.data ?? []} rowKey={(s) => `${s.offerId ?? s.name}`} empty={<EmptyState title={t('common.noResults')} />} />
        </Card>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-4" /> {t('offers.safety')}
      </p>
      {editing ? <OfferEditor value={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function toInput(o: OfferDto): OfferSaveInput {
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    type: o.type,
    isActive: o.isActive,
    autoApply: o.autoApply,
    priority: o.priority,
    discountBp: o.discountBp,
    discountAmount: o.discountAmount,
    bundlePrice: o.bundlePrice,
    buyQty: o.buyQty,
    getQty: o.getQty,
    minQty: o.minQty,
    minCartTotal: o.minCartTotal,
    customerType: o.customerType as OfferSaveInput['customerType'],
    daysOfWeek: o.daysOfWeek,
    hourFrom: o.hourFrom,
    hourTo: o.hourTo,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    maxUses: o.maxUses,
    triggers: o.triggers,
    targets: o.targets
  }
}

interface PickedSet {
  products: Array<{ id: string; name: string }>
  categoryIds: string[]
}

function SetPicker({ label, hint, value, onChange }: { label: string; hint?: string; value: PickedSet; onChange: (v: PickedSet) => void }) {
  const { t } = useTranslation()
  const categories = useApi('catalog.categories')
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2 rounded-xl border border-line p-2">
        <ProductPicker placeholder={t('offers.products')} onPick={(i) => !value.products.some((p) => p.id === i.productId) && onChange({ ...value, products: [...value.products, { id: i.productId, name: i.productName }] })} />
        <div className="flex flex-wrap gap-1.5">
          {value.products.map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
              {p.name}
              <button onClick={() => onChange({ ...value, products: value.products.filter((x) => x.id !== p.id) })}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.data?.map((c) => {
            const on = value.categoryIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ ...value, categoryIds: on ? value.categoryIds.filter((x) => x !== c.id) : [...value.categoryIds, c.id] })}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', on ? 'border-primary bg-primary text-primary-fg' : 'border-line text-muted')}
              >
                {c.name}
              </button>
            )
          })}
        </div>
      </div>
    </Field>
  )
}

function OfferEditor({ value, onClose }: { value: Partial<OfferDto>; onClose: () => void }) {
  const { t } = useTranslation()
  const named = (ids: string[], names: string[] | undefined) => ids.map((id, i) => ({ id, name: names?.[i] ?? id }))
  const [f, setF] = useState({
    name: value.name ?? '',
    type: (value.type ?? 'CROSS_SELL') as OfferType,
    isActive: value.isActive ?? true,
    autoApply: value.autoApply ?? false,
    priority: value.priority ?? 0,
    benefit: (value.bundlePrice != null ? 'price' : value.discountAmount != null ? 'amount' : 'percent') as 'percent' | 'amount' | 'price',
    discountBp: value.discountBp ?? 1000,
    discountAmount: value.discountAmount ?? 0,
    bundlePrice: value.bundlePrice ?? 0,
    buyQty: value.buyQty ?? 2,
    getQty: value.getQty ?? 1,
    minQty: value.minQty ?? 3,
    minCartTotal: value.minCartTotal ?? null,
    customerType: value.customerType ?? '',
    daysOfWeek: value.daysOfWeek ?? [],
    startsAt: value.startsAt?.slice(0, 10) ?? '',
    endsAt: value.endsAt?.slice(0, 10) ?? '',
    maxUses: value.maxUses ?? null,
    triggers: { products: named(value.triggers?.productIds ?? [], value.triggerNames), categoryIds: value.triggers?.categoryIds ?? [] } as PickedSet,
    targets: { products: named(value.targets?.productIds ?? [], value.targetNames), categoryIds: value.targets?.categoryIds ?? [] } as PickedSet
  })
  const save = useApiMutation('offers.save', { invalidate: ['offers.'], success: 'common.saved', onSuccess: onClose })
  const isSuggest = SUGGEST_TYPES.includes(f.type)
  const weekdays = t('offers.weekdays', { returnObjects: true }) as string[]
  const submit = () =>
    save.mutate({
      id: value.id,
      name: f.name || t(`offers.types.${f.type}`),
      type: f.type,
      isActive: f.isActive,
      autoApply: !isSuggest && f.autoApply,
      priority: f.priority,
      discountBp: f.type !== 'BUY_X_GET_Y' && f.benefit === 'percent' ? f.discountBp : null,
      discountAmount: f.type !== 'BUY_X_GET_Y' && f.benefit === 'amount' ? f.discountAmount : null,
      bundlePrice: f.type !== 'BUY_X_GET_Y' && f.benefit === 'price' ? f.bundlePrice : null,
      buyQty: f.type === 'BUY_X_GET_Y' ? f.buyQty : null,
      getQty: f.type === 'BUY_X_GET_Y' ? f.getQty : null,
      minQty: f.type === 'QTY_DISCOUNT' ? f.minQty : null,
      minCartTotal: f.minCartTotal,
      customerType: (f.customerType || null) as OfferSaveInput['customerType'],
      daysOfWeek: f.daysOfWeek.length ? f.daysOfWeek : null,
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
      endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
      maxUses: f.maxUses,
      triggers: { productIds: f.triggers.products.map((p) => p.id), categoryIds: f.triggers.categoryIds },
      targets: { productIds: f.targets.products.map((p) => p.id), categoryIds: f.targets.categoryIds }
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={value.id ? t('offers.editOffer') : t('offers.newOffer')}
      footer={
        <Button onClick={submit} loading={save.isPending} disabled={f.targets.products.length + f.targets.categoryIds.length === 0}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {OFFER_TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setF({ ...f, type: ty, autoApply: !SUGGEST_TYPES.includes(ty) })}
              className={cn('rounded-xl border-2 p-2.5 text-start transition', f.type === ty ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong')}
            >
              <p className="text-[13px] font-bold">{t(`offers.types.${ty}`)}</p>
              <p className="text-[11px] leading-tight text-muted">{t(`offers.typeHints.${ty}`)}</p>
            </button>
          ))}
        </div>
        <Field label={t('common.name')}>
          <Input value={f.name} placeholder={t(`offers.types.${f.type}`)} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        {f.type === 'CROSS_SELL' || f.type === 'BUNDLE' ? <SetPicker label={t('offers.when')} hint={t('offers.whenHint')} value={f.triggers} onChange={(v) => setF({ ...f, triggers: v })} /> : null}
        <SetPicker label={t('offers.offerOn')} value={f.targets} onChange={(v) => setF({ ...f, targets: v })} />
        {f.type === 'BUY_X_GET_Y' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('offers.buyQty')}>
              <NumberInput value={f.buyQty} min={1} max={100} onChange={(v) => setF({ ...f, buyQty: v ?? 1 })} />
            </Field>
            <Field label={t('offers.getQty')}>
              <NumberInput value={f.getQty} min={1} max={100} onChange={(v) => setF({ ...f, getQty: v ?? 1 })} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <Select value={f.benefit} onChange={(e) => setF({ ...f, benefit: e.target.value as typeof f.benefit })}>
              <option value="percent">{t('offers.discountPercent')}</option>
              <option value="amount">{t('offers.discountAmount')}</option>
              <option value="price">{t('offers.bundlePrice')}</option>
            </Select>
            {f.benefit === 'percent' ? (
              <Input
                dir="ltr"
                inputMode="decimal"
                defaultValue={bpToPercentString(f.discountBp)}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n > 0 && n <= 100) setF({ ...f, discountBp: Math.round(n * 100) })
                }}
              />
            ) : f.benefit === 'amount' ? (
              <MoneyInput value={f.discountAmount} onChange={(v) => setF({ ...f, discountAmount: v ?? 0 })} />
            ) : (
              <MoneyInput value={f.bundlePrice} onChange={(v) => setF({ ...f, bundlePrice: v ?? 0 })} />
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {f.type === 'QTY_DISCOUNT' ? (
            <Field label={t('offers.minQty')}>
              <NumberInput value={f.minQty} min={2} onChange={(v) => setF({ ...f, minQty: v ?? 2 })} />
            </Field>
          ) : null}
          <Field label={t('offers.minCartTotal')} optional>
            <MoneyInput allowEmpty value={f.minCartTotal} onChange={(v) => setF({ ...f, minCartTotal: v })} />
          </Field>
          <Field label={t('offers.customerType')}>
            <Select value={f.customerType} onChange={(e) => setF({ ...f, customerType: e.target.value })}>
              <option value="">{t('offers.anyCustomer')}</option>
              {CUSTOMER_TYPES.map((c) => (
                <option key={c} value={c}>
                  {t(`customers.types.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('offers.startsAt')} optional>
            <Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          </Field>
          <Field label={t('offers.endsAt')} optional>
            <Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          </Field>
          <Field label={t('offers.maxUses')} optional>
            <NumberInput allowEmpty value={f.maxUses} min={1} onChange={(v) => setF({ ...f, maxUses: v })} />
          </Field>
        </div>
        <Field label={t('offers.days')} hint={f.daysOfWeek.length === 0 ? t('offers.allDays') : undefined}>
          <div className="flex flex-wrap gap-3">
            {weekdays.map((d, i) => (
              <Checkbox key={d} checked={f.daysOfWeek.includes(i)} onCheckedChange={(on) => setF({ ...f, daysOfWeek: on ? [...f.daysOfWeek, i] : f.daysOfWeek.filter((x) => x !== i) })} label={d} />
            ))}
          </div>
        </Field>
        {!isSuggest ? <SwitchRow label={t('offers.autoApply')} checked={f.autoApply} onCheckedChange={(v) => setF({ ...f, autoApply: v })} /> : null}
        <SwitchRow label={t('offers.active')} checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
      </div>
    </Dialog>
  )
}
