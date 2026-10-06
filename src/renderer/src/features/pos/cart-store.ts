import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { priceCart, type Discount, type PricingResult } from '@shared/domain/pricing'
import type { VariantListItem } from '@shared/types/catalog'
import type { CustomerListItem } from '@shared/types/customers'
import type { AllSettings } from '@shared/settings'
import { uuid } from '../../lib/utils'

export interface CartLine {
  key: string
  variantId: string | null
  productId: string | null
  type: string
  name: string
  listPrice: number
  unitPrice: number
  qty: number
  taxBpOverride: number | null
  discount: Discount | null
  minPrice: number | null
  trackStock: boolean
  stockQty: number
  trackSerials: boolean
  serial: string | null
  categoryId: string | null
  offerId: string | null
  offerLabel: string | null
  /** discount applied automatically by an owner-configured offer */
  autoOffer?: boolean
}

export interface OfferEventRecord {
  offerId: string | null
  source: 'OFFER' | 'AFFINITY' | 'CLEARANCE' | 'THRESHOLD'
  event: 'SHOWN' | 'ACCEPTED' | 'DISMISSED'
  productId: string | null
}

interface CartState {
  /** Stable per cart; sent with the sale so retries are idempotent. */
  idempotencyKey: string
  lines: CartLine[]
  customer: CustomerListItem | null
  kind: 'QUICK' | 'INVOICE'
  cartDiscount: Discount | null
  note: string
  selectedKey: string | null
  heldId: string | null
  offerEvents: OfferEventRecord[]
  dismissedOffers: string[]
  add: (item: VariantListItem, opts?: { qty?: number; unitPrice?: number; serial?: string | null; offerId?: string | null; offerLabel?: string | null; discount?: Discount | null }) => void
  addCustom: (name: string, price: number) => void
  update: (key: string, patch: Partial<CartLine>) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  select: (key: string | null) => void
  setCustomer: (c: CustomerListItem | null) => void
  setKind: (k: 'QUICK' | 'INVOICE') => void
  setCartDiscount: (d: Discount | null) => void
  setNote: (n: string) => void
  recordOffer: (e: OfferEventRecord) => void
  dismissOffer: (id: string) => void
  reset: (kind?: 'QUICK' | 'INVOICE') => void
  load: (snapshot: CartSnapshot, heldId: string | null) => void
  snapshot: () => CartSnapshot
}

export type CartSnapshot = Pick<CartState, 'lines' | 'customer' | 'kind' | 'cartDiscount' | 'note'>

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      idempotencyKey: uuid(),
      lines: [],
      customer: null,
      kind: 'QUICK',
      cartDiscount: null,
      note: '',
      selectedKey: null,
      heldId: null,
      offerEvents: [],
      dismissedOffers: [],
      add: (item, opts = {}) =>
        set((s) => {
          const qty = opts.qty ?? 1
          // Merge identical lines (same product, price, no IMEI chosen, no offer/discount).
          const existing =
            !opts.serial && !opts.offerId && !opts.discount
              ? s.lines.find((l) => l.variantId === item.variantId && l.unitPrice === (opts.unitPrice ?? item.sellPrice) && !l.serial && !l.offerId && !l.discount)
              : undefined
          if (existing) {
            return { lines: s.lines.map((l) => (l.key === existing.key ? { ...l, qty: l.qty + qty } : l)), selectedKey: existing.key }
          }
          const line: CartLine = {
            key: uuid(),
            variantId: item.variantId,
            productId: item.productId,
            type: item.type,
            name: item.name,
            listPrice: item.sellPrice,
            unitPrice: opts.unitPrice ?? item.sellPrice,
            qty,
            taxBpOverride: item.taxBp,
            discount: opts.discount ?? null,
            minPrice: item.minPrice,
            trackStock: item.trackStock,
            stockQty: item.stockQty,
            trackSerials: item.trackSerials,
            serial: opts.serial ?? null,
            categoryId: item.categoryId,
            offerId: opts.offerId ?? null,
            offerLabel: opts.offerLabel ?? null
          }
          return { lines: [...s.lines, line], selectedKey: line.key }
        }),
      addCustom: (name, price) =>
        set((s) => {
          const line: CartLine = {
            key: uuid(),
            variantId: null,
            productId: null,
            type: 'CUSTOM',
            name,
            listPrice: price,
            unitPrice: price,
            qty: 1,
            taxBpOverride: null,
            discount: null,
            minPrice: null,
            trackStock: false,
            stockQty: 0,
            trackSerials: false,
            serial: null,
            categoryId: null,
            offerId: null,
            offerLabel: null
          }
          return { lines: [...s.lines, line], selectedKey: line.key }
        }),
      update: (key, patch) => set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })),
      setQty: (key, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty: l.serial ? 1 : Math.min(qty, 100000) } : l))
        })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key), selectedKey: s.selectedKey === key ? null : s.selectedKey })),
      select: (selectedKey) => set({ selectedKey }),
      setCustomer: (customer) => set({ customer }),
      setKind: (kind) => set({ kind }),
      setCartDiscount: (cartDiscount) => set({ cartDiscount }),
      setNote: (note) => set({ note }),
      recordOffer: (e) => set((s) => ({ offerEvents: [...s.offerEvents, e].slice(-100) })),
      dismissOffer: (id) => set((s) => ({ dismissedOffers: [...s.dismissedOffers, id] })),
      reset: (kind) =>
        set({
          idempotencyKey: uuid(),
          lines: [],
          customer: null,
          kind: kind ?? 'QUICK',
          cartDiscount: null,
          note: '',
          selectedKey: null,
          heldId: null,
          offerEvents: [],
          dismissedOffers: []
        }),
      load: (snap, heldId) => set({ ...snap, idempotencyKey: uuid(), heldId, selectedKey: null, offerEvents: [], dismissedOffers: [] }),
      snapshot: () => {
        const s = get()
        return { lines: s.lines, customer: s.customer, kind: s.kind, cartDiscount: s.cartDiscount, note: s.note }
      }
    }),
    {
      name: 'central.cart.v1',
      storage: createJSONStorage(() => {
        try {
          return localStorage
        } catch {
          const mem = new Map<string, string>()
          return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
        }
      }),
      partialize: (s) => ({
        idempotencyKey: s.idempotencyKey,
        lines: s.lines,
        customer: s.customer,
        kind: s.kind,
        cartDiscount: s.cartDiscount,
        note: s.note,
        heldId: s.heldId
      })
    }
  )
)

export function lineTaxBp(line: CartLine, settings: AllSettings): number {
  if (!settings.taxes.enabled) return 0
  return line.taxBpOverride ?? settings.taxes.defaultTaxBp
}

/** Same pricing engine the main process uses — totals always match. */
export function priceLines(lines: CartLine[], cartDiscount: Discount | null, settings: AllSettings): PricingResult {
  return priceCart({
    lines: lines.map((l) => ({
      key: l.key,
      qty: l.qty,
      unitPrice: l.unitPrice,
      unitCost: 0,
      taxBp: lineTaxBp(l, settings),
      discount: l.discount,
      minPrice: l.minPrice
    })),
    cartDiscount,
    pricesIncludeTax: settings.taxes.pricesIncludeTax
  })
}
