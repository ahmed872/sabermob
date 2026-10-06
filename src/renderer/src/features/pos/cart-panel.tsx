import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Percent, Plus, ShoppingBasket, Tag, Trash2, UserRound, X } from 'lucide-react'
import type { Discount, PricingResult } from '@shared/domain/pricing'
import { bpToPercentString } from '@shared/money'
import { call } from '../../lib/api'
import { fmtMoney, fmtNumber } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useApp, useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput, NumberInput, Select } from '../../components/ui/input'
import { Badge, Segmented } from '../../components/ui/misc'
import { useCart, type CartLine } from './cart-store'

export function CartLines({ priced }: { priced: PricingResult }) {
  const { t } = useTranslation()
  const { lines, selectedKey, select, setQty, remove } = useCart()
  const [editing, setEditing] = useState<CartLine | null>(null)
  const byKey = useMemo(() => new Map(priced.lines.map((l) => [l.key, l])), [priced])

  if (lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted">
        <div className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-sunken">
          <ShoppingBasket className="size-8 text-subtle" />
        </div>
        <p className="font-bold text-fg">{t('pos.emptyCart')}</p>
        <p className="text-sm">{t('pos.emptyCartHint')}</p>
      </div>
    )
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const p = byKey.get(l.key)
          const short = l.trackStock && l.qty > l.stockQty
          return (
            <li
              key={l.key}
              onClick={() => select(l.key)}
              onDoubleClick={() => setEditing(l)}
              className={cn('cursor-pointer px-3 py-2.5 transition', selectedKey === l.key ? 'bg-primary-soft/60' : 'hover:bg-sunken/70')}
            >
              <div className="flex items-start gap-2">
                <button className="min-w-0 flex-1 text-start" onClick={() => setEditing(l)}>
                  <p className="line-clamp-2 text-[13px] font-bold leading-snug">{l.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="tabular">{fmtMoney(l.unitPrice)}</span>
                    {l.unitPrice !== l.listPrice && l.listPrice > 0 ? <span className="tabular line-through">{fmtMoney(l.listPrice)}</span> : null}
                    {l.serial ? <Badge tone="info">IMEI {l.serial}</Badge> : null}
                    {p && p.lineDiscount > 0 ? <Badge tone="success">-{fmtMoney(p.lineDiscount)}</Badge> : null}
                    {l.offerLabel ? <Badge tone="primary">{l.offerLabel}</Badge> : null}
                    {short ? <Badge tone="danger">{t('pos.inStock', { count: l.stockQty })}</Badge> : null}
                    {p?.belowMinPrice ? <Badge tone="warning">min</Badge> : null}
                  </p>
                </button>
                <span className="text-sm font-extrabold tabular">{fmtMoney(p?.total ?? l.unitPrice * l.qty)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button className="flex size-8 items-center justify-center rounded-lg bg-sunken hover:bg-line" onClick={() => setQty(l.key, l.qty - 1)} aria-label="-">
                    <Minus className="size-4" />
                  </button>
                  <span className="w-9 text-center text-sm font-extrabold tabular">{fmtNumber(l.qty)}</span>
                  <button className="flex size-8 items-center justify-center rounded-lg bg-sunken hover:bg-line disabled:opacity-40" disabled={!!l.serial} onClick={() => setQty(l.key, l.qty + 1)} aria-label="+">
                    <Plus className="size-4" />
                  </button>
                </div>
                <button className="rounded-lg p-1.5 text-subtle hover:bg-danger-soft hover:text-danger" onClick={(e) => (e.stopPropagation(), remove(l.key))} aria-label={t('pos.remove')}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {editing ? <LineEditor line={editing} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

function LineEditor({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const { update, remove } = useCart()
  const [qty, setQty] = useState(line.qty)
  const [price, setPrice] = useState(line.unitPrice)
  const [dType, setDType] = useState<'PERCENT' | 'AMOUNT'>(line.discount?.type ?? 'PERCENT')
  const [dValue, setDValue] = useState<number>(line.discount ? (line.discount.type === 'PERCENT' ? line.discount.bp : line.discount.amount) : 0)
  const [serial, setSerial] = useState(line.serial ?? '')
  const [serials, setSerials] = useState<Array<{ serial: string }>>([])
  useEffect(() => {
    if (line.trackSerials && line.variantId) void call('catalog.serials', { variantId: line.variantId }).then(setSerials)
  }, [line])
  const openPrice = line.listPrice === 0 || line.type === 'CUSTOM'
  const save = () => {
    const discount: Discount | null = dValue > 0 ? (dType === 'PERCENT' ? { type: 'PERCENT', bp: dValue } : { type: 'AMOUNT', amount: dValue }) : null
    const chosen = serial.trim() || null
    const count = Math.max(1, qty)
    update(line.key, { qty: chosen ? 1 : count, unitPrice: price, discount: line.offerId ? line.discount : discount, serial: chosen })
    // An IMEI picked on a line of several phones: the others stay on their own line.
    if (chosen && count > 1) useCart.setState((s) => ({ lines: [...s.lines, { ...line, key: crypto.randomUUID(), qty: count - 1, serial: null }] }))
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={line.name}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              remove(line.key)
              onClose()
            }}
          >
            <Trash2 /> {t('pos.remove')}
          </Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {line.trackSerials ? (
          <Field label={t('pos.selectSerial')} hint={serials.length === 0 ? t('pos.noSerialsHint') : undefined}>
            {serials.length > 0 ? (
              <Select value={serials.some((s) => s.serial === serial) ? serial : ''} onChange={(e) => setSerial(e.target.value)} dir="ltr" className="mb-2">
                <option value="">{t('pos.withoutSerial')}</option>
                {serials.map((s) => (
                  <option key={s.serial} value={s.serial}>
                    {s.serial}
                  </option>
                ))}
              </Select>
            ) : null}
            <Input dir="ltr" className="font-mono" placeholder={t('pos.typeSerial')} value={serial} onChange={(e) => setSerial(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </Field>
        ) : null}
        {!line.trackSerials || !serial.trim() ? (
          <Field label={t('common.qty')}>
            <NumberInput autoFocus={!line.trackSerials} value={qty} min={1} onChange={(v) => setQty(v ?? 1)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-11 text-lg font-bold" />
          </Field>
        ) : null}
        <Field label={t('pos.unitPrice')} hint={!openPrice && !can('edit_price') ? t('permissions.edit_price') : undefined}>
          <MoneyInput value={price} onChange={(v) => setPrice(v ?? 0)} onEnter={save} />
        </Field>
        {!line.offerId ? (
          <Field label={t('pos.lineDiscount')}>
            <div className="flex gap-2">
              <Segmented value={dType} onChange={(v) => (setDType(v), setDValue(0))} options={[{ value: 'PERCENT', label: '%' }, { value: 'AMOUNT', label: t('pos.amount') }]} />
              {dType === 'PERCENT' ? (
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  defaultValue={dValue ? bpToPercentString(dValue) : ''}
                  placeholder="0"
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n) && n >= 0 && n <= 100) setDValue(Math.round(n * 100))
                  }}
                />
              ) : (
                <MoneyInput value={dValue} onChange={(v) => setDValue(v ?? 0)} />
              )}
            </div>
          </Field>
        ) : null}
      </div>
    </Dialog>
  )
}

export function CartDiscountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const { cartDiscount, setCartDiscount } = useCart()
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>(cartDiscount?.type ?? 'PERCENT')
  const [value, setValue] = useState(cartDiscount ? (cartDiscount.type === 'PERCENT' ? cartDiscount.bp : cartDiscount.amount) : 0)
  const apply = () => {
    setCartDiscount(value > 0 ? (type === 'PERCENT' ? { type, bp: value } : { type, amount: value }) : null)
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t('pos.cartDiscount')}
      footer={
        <>
          <Button variant="ghost" onClick={() => (setCartDiscount(null), onOpenChange(false))}>
            {t('common.clear')}
          </Button>
          <Button onClick={apply}>{t('common.apply')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented className="w-full" value={type} onChange={(v) => (setType(v), setValue(0))} options={[{ value: 'PERCENT', label: '%', icon: Percent }, { value: 'AMOUNT', label: t('pos.amount'), icon: Tag }]} />
        {type === 'PERCENT' ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 1500, 2000].map((bp) => (
                <Button key={bp} variant={value === bp ? 'primary' : 'outline'} onClick={() => setValue(bp)}>
                  {bpToPercentString(bp)}%
                </Button>
              ))}
            </div>
            <Input
              autoFocus
              dir="ltr"
              inputMode="decimal"
              key={value}
              defaultValue={value ? bpToPercentString(value) : ''}
              placeholder="%"
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 0 && n <= 100) setValue(Math.round(n * 100))
              }}
            />
          </>
        ) : (
          <MoneyInput autoFocus value={value} onChange={(v) => setValue(v ?? 0)} onEnter={apply} />
        )}
      </div>
    </Dialog>
  )
}

export function CustomerChip({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation()
  const { customer, setCustomer } = useCart()
  return (
    <div className="flex items-center gap-1">
      <button onClick={onPick} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-start hover:border-primary">
        <UserRound className="size-4 shrink-0 text-muted" />
        {customer ? (
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold">{customer.name}</span>
            <span className="block truncate text-[11px] text-muted" dir="ltr">
              {customer.phone}
              {customer.balance > 0 ? ` · ${t('pos.customerOwes', { amount: fmtMoney(customer.balance) })}` : ''}
            </span>
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-muted">{t('pos.selectCustomer')}</span>
        )}
      </button>
      {customer ? (
        <Button variant="ghost" size="icon-sm" onClick={() => setCustomer(null)}>
          <X />
        </Button>
      ) : null}
    </div>
  )
}

export function Totals({ priced }: { priced: PricingResult }) {
  const { t } = useTranslation()
  const taxes = useApp((s) => s.settings!.taxes)
  return (
    <div className="space-y-1 text-sm">
      {priced.discountTotal > 0 ? (
        <>
          <Row label={t('pos.subtotal')} value={fmtMoney(priced.subtotal)} />
          <Row label={t('pos.discount')} value={`- ${fmtMoney(priced.discountTotal)}`} className="text-success" />
        </>
      ) : null}
      {taxes.enabled && priced.taxTotal > 0 ? <Row label={`${taxes.taxLabel}${taxes.pricesIncludeTax ? ' (incl.)' : ''}`} value={fmtMoney(priced.taxTotal)} /> : null}
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex justify-between', className)}>
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </div>
  )
}
