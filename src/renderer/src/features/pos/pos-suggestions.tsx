import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lightbulb, Plus, X } from 'lucide-react'
import type { PricingResult } from '@shared/domain/pricing'
import type { Suggestion } from '@shared/domain/offers'
import { call } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { debounce } from '../../lib/utils'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { useCart } from './cart-store'

/**
 * Up to 1–3 smart suggestions under the cart. Never blocks the cashier:
 * one tap to add, one tap to ignore. Also keeps automatic offer discounts
 * (quantity / buy-X-get-Y / % off) in sync with the cart.
 */
export function PosSuggestions(_props: { priced: PricingResult }) {
  const { t } = useTranslation()
  const enabled = useApp((s) => s.settings?.offers.enabled)
  const lines = useCart((s) => s.lines)
  const customer = useCart((s) => s.customer)
  const dismissed = useCart((s) => s.dismissedOffers)
  const cartKey = useCart((s) => s.idempotencyKey)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const shown = useRef(new Set<string>())

  // Only stock items participate (custom lines have no product).
  const signature = useMemo(
    () => JSON.stringify(lines.filter((l) => l.variantId).map((l) => [l.variantId, l.qty, l.unitPrice])) + (customer?.id ?? '') + dismissed.join(','),
    [lines, customer, dismissed]
  )

  useEffect(() => {
    shown.current = new Set()
  }, [cartKey])

  useEffect(() => {
    if (!enabled) return
    const run = debounce(async () => {
      const s = useCart.getState()
      const input = s.lines.filter((l) => l.variantId).map((l) => ({ variantId: l.variantId!, qty: l.qty, unitPrice: l.unitPrice }))
      if (input.length === 0) {
        setSuggestions([])
        return
      }
      try {
        const res = await call('offers.suggest', { customerId: s.customer?.id ?? null, lines: input, dismissed: s.dismissedOffers })
        setSuggestions(res.suggestions)
        for (const sug of res.suggestions) {
          if (!shown.current.has(sug.key)) {
            shown.current.add(sug.key)
            s.recordOffer({ offerId: sug.offerId, source: sug.source, event: 'SHOWN', productId: sug.productId })
          }
        }
        // Sync automatic discounts.
        const cart = useCart.getState()
        for (const line of cart.lines) {
          const auto = res.autoApply.find((a) => a.variantId === line.variantId)
          if (auto && (line.offerId !== auto.offerId || JSON.stringify(line.discount) !== JSON.stringify(auto.discount))) {
            if (!line.offerId || line.autoOffer) cart.update(line.key, { offerId: auto.offerId, offerLabel: auto.offerName, discount: auto.discount, autoOffer: true })
          } else if (!auto && line.autoOffer) {
            cart.update(line.key, { offerId: null, offerLabel: null, discount: null, autoOffer: false })
          }
        }
      } catch {
        setSuggestions([])
      }
    }, 250)
    run()
    return () => run.cancel()
  }, [signature, enabled])

  if (!enabled || suggestions.length === 0) return null

  const accept = async (s: Suggestion) => {
    try {
      const item = await call('catalog.variant', { id: s.variantId })
      const cart = useCart.getState()
      cart.add(item, { qty: 1, unitPrice: s.regularPrice, discount: s.discount, offerId: s.offerId, offerLabel: s.offerName })
      cart.recordOffer({ offerId: s.offerId, source: s.source, event: 'ACCEPTED', productId: s.productId })
    } catch {
      /* product became unavailable; ignore */
    }
  }
  const ignore = (s: Suggestion) => {
    const cart = useCart.getState()
    cart.dismissOffer(s.key)
    cart.recordOffer({ offerId: s.offerId, source: s.source, event: 'DISMISSED', productId: s.productId })
  }

  return (
    <div className="space-y-1.5 border-t border-line bg-primary-soft/40 p-2.5">
      {suggestions.map((s) => (
        <div key={s.key} className="flex items-center gap-2 rounded-xl border border-primary/20 bg-surface p-2 shadow-sm">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15">
            <Lightbulb className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold">{s.name}</p>
            <p className="flex items-center gap-1.5 text-xs">
              {s.offerPrice < s.regularPrice ? (
                <>
                  <span className="text-muted line-through tabular">{fmtMoney(s.regularPrice)}</span>
                  <span className="font-extrabold text-success tabular">{fmtMoney(s.offerPrice)}</span>
                </>
              ) : (
                <span className="text-muted">
                  {t('offers.boughtTogether')} · <span className="font-bold tabular text-fg">{fmtMoney(s.regularPrice)}</span>
                </span>
              )}
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={() => void accept(s)}>
            <Plus /> {t('offers.add')}
          </Button>
          <button className="rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-fg" onClick={() => ignore(s)} aria-label={t('offers.ignore')}>
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
