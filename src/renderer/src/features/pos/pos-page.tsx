import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Clock3, History, PauseCircle, Percent, Receipt, Trash2, Wallet, FileText, Zap } from 'lucide-react'
import type { VariantListItem } from '@shared/types/catalog'
import type { SaleDto } from '@shared/types/sales'
import { call } from '../../lib/api'
import { invalidate, toastError } from '../../lib/query'
import { fmtMoney } from '../../lib/format'
import { beep, useScanner } from '../../lib/scanner'
import { cn } from '../../lib/utils'
import { useApp, useCan } from '../../stores/app'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput } from '../../components/ui/input'
import { Kbd, Segmented } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { useCart, priceLines } from './cart-store'
import { ProductPanel, type ProductPanelHandle } from './product-panel'
import { CartDiscountDialog, CartLines, CustomerChip, Totals } from './cart-panel'
import { CustomerPicker } from './customer-picker'
import { HeldCartsDialog } from './held-carts'
import { PaymentDialog } from './payment-dialog'
import { SaleDoneDialog } from './sale-done'
import { OpenShiftCard, ShiftDialog, useCurrentShift } from './shift'
import { PosSuggestions } from './pos-suggestions'

type DialogName = 'customer' | 'payment' | 'held' | 'discount' | 'shift' | 'custom' | 'price' | null

export default function PosPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const confirm = useConfirm()
  const settings = useApp((s) => s.settings)!
  const shift = useCurrentShift()
  const cart = useCart()
  const [dialog, setDialog] = useState<DialogName>(null)
  const [done, setDone] = useState<SaleDto | null>(null)
  const [pricePrompt, setPricePrompt] = useState<VariantListItem | null>(null)
  const panel = useRef<ProductPanelHandle>(null)
  const priced = useMemo(() => priceLines(cart.lines, cart.cartDiscount, settings), [cart.lines, cart.cartDiscount, settings])

  // Default sale mode from settings for a fresh cart.
  useEffect(() => {
    if (cart.lines.length === 0 && cart.kind !== settings.pos.defaultSaleMode) cart.setKind(settings.pos.defaultSaleMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.pos.defaultSaleMode])

  const addItem = useCallback(
    (item: VariantListItem, serial?: string | null) => {
      if (item.sellPrice === 0) {
        setPricePrompt(item)
        return
      }
      if (item.trackSerials && !serial) {
        // IMEI is chosen in the line editor; add the line first.
        useCart.getState().add(item)
        return
      }
      useCart.getState().add(item, { serial: serial ?? null })
    },
    []
  )

  const handleCode = useCallback(
    async (code: string, fallback?: VariantListItem) => {
      try {
        const item = await call('catalog.findByCode', { code })
        if (item) {
          if (settings.pos.scanSound) beep(true)
          const serial = item.trackSerials && code !== item.barcode && code !== item.sku ? code : null
          addItem(item, serial)
          return
        }
        if (fallback) {
          addItem(fallback)
          return
        }
        if (settings.pos.scanSound) beep(false)
        toast.error(t('pos.notFound', { code }), {
          action: can('manage_inventory') ? { label: t('pos.addProduct'), onClick: () => navigate(`/inventory/products/new?barcode=${encodeURIComponent(code)}`) } : undefined
        })
      } catch (err) {
        toastError(err)
      }
    },
    [addItem, can, navigate, settings.pos.scanSound, t]
  )

  const shiftRequired = settings.pos.requireShift && !shift.data
  const blocking = dialog !== null || done !== null || !!pricePrompt
  useScanner((code) => void handleCode(code), !blocking && !shiftRequired)

  const hold = useCallback(async () => {
    const s = useCart.getState()
    if (s.lines.length === 0) return
    try {
      await call('pos.hold', {
        id: s.heldId ?? undefined,
        label: s.customer?.name ?? new Date().toLocaleTimeString(),
        customerId: s.customer?.id ?? null,
        total: priceLines(s.lines, s.cartDiscount, settings).total,
        payload: JSON.stringify(s.snapshot())
      })
      s.reset(settings.pos.defaultSaleMode)
      invalidate('pos.held')
      toast.success(t('pos.holdDone'))
    } catch (err) {
      toastError(err)
    }
  }, [settings, t])

  const clear = useCallback(async () => {
    if (useCart.getState().lines.length === 0) return
    if (await confirm({ title: t('pos.confirmClear'), danger: true, confirmLabel: t('pos.clear') })) useCart.getState().reset(settings.pos.defaultSaleMode)
  }, [confirm, settings.pos.defaultSaleMode, t])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blocking) return
      const s = useCart.getState()
      switch (e.key) {
        case 'F2':
          e.preventDefault()
          panel.current?.focusSearch()
          break
        case 'F4':
          e.preventDefault()
          setDialog('customer')
          break
        case 'F6':
          e.preventDefault()
          if (can('apply_discount')) setDialog('discount')
          break
        case 'F8':
          e.preventDefault()
          if (s.lines.length) setDialog('payment')
          break
        case 'F9':
          e.preventDefault()
          void hold()
          break
        case 'F10':
          e.preventDefault()
          if (s.lines.length) setDialog('payment')
          break
        case 'Delete':
          if (s.selectedKey && !(e.target as HTMLElement).closest('input,textarea')) s.remove(s.selectedKey)
          break
        case '+':
        case '-': {
          if ((e.target as HTMLElement).closest('input,textarea')) return
          const key = s.selectedKey ?? s.lines.at(-1)?.key
          const line = s.lines.find((l) => l.key === key)
          if (line) {
            e.preventDefault()
            s.setQty(line.key, line.qty + (e.key === '+' ? 1 : -1))
          }
          break
        }
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocking, can, hold])

  if (shift.isLoading) return <PageLoader />
  if (shiftRequired) return <OpenShiftCard />

  const onSaleDone = (sale: SaleDto) => {
    setDialog(null)
    setDone(sale)
    useCart.getState().reset(settings.pos.defaultSaleMode)
    invalidate('catalog.', 'inventory.', 'shifts.', 'pos.', 'customers.', 'reports.', 'offers.')
  }

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => navigate('/sales/history')}>
              <History /> {t('pos.history')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDialog('held')}>
              <PauseCircle /> {t('pos.held')}
            </Button>
            {can(['view_all_shifts']) ? (
              <Button variant="ghost" size="sm" onClick={() => navigate('/sales/shifts')}>
                <Clock3 /> {t('pos.shifts')}
              </Button>
            ) : null}
          </div>
          {shift.data ? (
            <button onClick={() => setDialog('shift')} className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-1.5 text-[13px] font-bold text-success">
              <Wallet className="size-4" /> {t('pos.shiftOpen')} · {shift.data.number}
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1">
          <ProductPanel ref={panel} onPick={(i) => addItem(i)} onSubmitCode={(code, first) => void handleCode(code, first)} onCustomItem={() => setDialog('custom')} />
        </div>
        <div className="hidden items-center gap-3 border-t border-line bg-surface px-3 py-1.5 text-[11px] text-muted lg:flex">
          <span><Kbd>F2</Kbd> {t('common.search')}</span>
          <span><Kbd>F4</Kbd> {t('pos.customer')}</span>
          <span><Kbd>F6</Kbd> {t('pos.discount')}</span>
          <span><Kbd>F8</Kbd> {t('pos.pay')}</span>
          <span><Kbd>F9</Kbd> {t('pos.hold')}</span>
          <span><Kbd>+</Kbd>/<Kbd>-</Kbd> {t('common.qty')}</span>
          <span><Kbd>Del</Kbd> {t('pos.remove')}</span>
        </div>
      </section>

      <aside className="flex w-[380px] shrink-0 flex-col border-s border-line bg-surface xl:w-[420px]">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <Segmented
              className="flex-1"
              value={cart.kind}
              onChange={cart.setKind}
              options={[
                { value: 'QUICK', label: t('pos.quickSale'), icon: Zap },
                { value: 'INVOICE', label: t('pos.invoice'), icon: FileText }
              ]}
            />
          </div>
          <CustomerChip onPick={() => setDialog('customer')} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CartLines priced={priced} />
        </div>
        <PosSuggestions priced={priced} />
        <div className="space-y-3 border-t border-line p-3">
          <Totals priced={priced} />
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold text-muted">
                {t('pos.total')} · {t('pos.items', { count: priced.itemCount })}
              </p>
              <p className="text-3xl font-black tabular" data-testid="cart-total">
                {fmtMoney(priced.total)}
              </p>
            </div>
            <div className="flex gap-1">
              {can('apply_discount') ? (
                <Button variant="outline" size="icon" onClick={() => setDialog('discount')} aria-label={t('pos.discount')} className={cn(cart.cartDiscount && 'border-success text-success')}>
                  <Percent />
                </Button>
              ) : null}
              <Button variant="outline" size="icon" onClick={() => void hold()} disabled={!cart.lines.length} aria-label={t('pos.hold')}>
                <PauseCircle />
              </Button>
              <Button variant="outline" size="icon" onClick={() => void clear()} disabled={!cart.lines.length} aria-label={t('pos.clear')}>
                <Trash2 />
              </Button>
            </div>
          </div>
          <Button variant="success" size="xl" className="w-full" disabled={!cart.lines.length} onClick={() => setDialog('payment')}>
            <Receipt /> {t('pos.pay')} <Kbd>F8</Kbd>
          </Button>
        </div>
      </aside>

      <CustomerPicker open={dialog === 'customer'} onOpenChange={(o) => setDialog(o ? 'customer' : null)} onPick={(c) => cart.setCustomer(c)} />
      <HeldCartsDialog open={dialog === 'held'} onOpenChange={(o) => setDialog(o ? 'held' : null)} />
      {dialog === 'discount' ? <CartDiscountDialog open onOpenChange={(o) => setDialog(o ? 'discount' : null)} /> : null}
      {dialog === 'shift' ? <ShiftDialog open onOpenChange={(o) => setDialog(o ? 'shift' : null)} /> : null}
      {dialog === 'custom' ? <CustomItemDialog onClose={() => setDialog(null)} /> : null}
      <PaymentDialog open={dialog === 'payment'} onOpenChange={(o) => setDialog(o ? 'payment' : null)} total={priced.total} onDone={onSaleDone} />
      <SaleDoneDialog
        sale={done}
        onNew={() => {
          setDone(null)
          setTimeout(() => panel.current?.focusSearch(), 50)
        }}
      />
      {pricePrompt ? (
        <OpenPriceDialog
          item={pricePrompt}
          onClose={() => setPricePrompt(null)}
          onConfirm={(price) => {
            useCart.getState().add(pricePrompt, { unitPrice: price })
            setPricePrompt(null)
          }}
        />
      ) : null}
    </div>
  )
}

function CustomItemDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [price, setPrice] = useState(0)
  const ok = name.trim() && price > 0
  const add = () => {
    if (!ok) return
    useCart.getState().addCustom(name.trim(), price)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="sm" title={t('pos.customItem')} footer={<Button onClick={add} disabled={!ok}>{t('common.add')}</Button>}>
      <div className="space-y-3">
        <Field label={t('pos.customItemName')}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('common.price')}>
          <MoneyInput value={price} onChange={(v) => setPrice(v ?? 0)} onEnter={add} />
        </Field>
      </div>
    </Dialog>
  )
}

function OpenPriceDialog({ item, onClose, onConfirm }: { item: VariantListItem; onClose: () => void; onConfirm: (price: number) => void }) {
  const { t } = useTranslation()
  const [price, setPrice] = useState(0)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('pos.enterPrice', { name: item.name })}
      footer={
        <Button onClick={() => price > 0 && onConfirm(price)} disabled={price <= 0}>
          {t('common.add')}
        </Button>
      }
    >
      <MoneyInput autoFocus value={price} onChange={(v) => setPrice(v ?? 0)} onEnter={() => price > 0 && onConfirm(price)} className="h-14 text-2xl font-extrabold" />
    </Dialog>
  )
}
