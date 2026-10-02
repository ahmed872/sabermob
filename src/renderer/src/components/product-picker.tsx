import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package } from 'lucide-react'
import type { VariantListItem } from '@shared/types/catalog'
import { call } from '../lib/api'
import { fmtMoney, fmtNumber } from '../lib/format'
import { cn, debounce } from '../lib/utils'
import { SearchInput } from './ui/input'

/**
 * Search-as-you-type product selector. Enter selects the first result, so a
 * barcode scanner (which types + Enter) works out of the box.
 */
export function ProductPicker({
  onPick,
  placeholder,
  autoFocus,
  filter,
  clearOnPick = true
}: {
  onPick: (item: VariantListItem) => void
  placeholder?: string
  autoFocus?: boolean
  filter?: (item: VariantListItem) => boolean
  clearOnPick?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<VariantListItem[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const reqId = useRef(0)

  const search = useRef(
    debounce(async (text: string) => {
      const id = ++reqId.current
      if (!text.trim()) return setResults([])
      const res = await call('catalog.posSearch', { q: text, limit: 12 })
      if (id === reqId.current) {
        setResults(filter ? res.filter(filter) : res)
        setActive(0)
      }
    }, 120)
  ).current

  useEffect(() => () => search.cancel(), [search])

  const pick = (item: VariantListItem | undefined) => {
    if (!item) return
    onPick(item)
    if (clearOnPick) {
      setQ('')
      setResults([])
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <SearchInput
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          search(e.target.value)
        }}
        onClear={() => {
          setQ('')
          setResults([])
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={async (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            search.cancel()
            // Scanner path: exact code lookup first, then current results.
            const exact = q.trim() ? await call('catalog.findByCode', { code: q.trim() }) : null
            if (exact && (!filter || filter(exact))) pick(exact)
            else if (results[active]) pick(results[active])
            else if (q.trim()) {
              const res = await call('catalog.posSearch', { q, limit: 12 })
              pick((filter ? res.filter(filter) : res)[0])
            }
          } else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && results.length > 0 ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-[var(--shadow-pop)]">
          {results.map((r, i) => (
            <button
              key={r.variantId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start', i === active ? 'bg-sunken' : 'hover:bg-sunken')}
            >
              <Package className="size-4 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-muted">{[r.barcode ?? r.sku, r.categoryName, r.modelName].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="text-end">
                <span className="block text-sm font-bold tabular">{fmtMoney(r.sellPrice)}</span>
                {r.trackStock ? <span className={cn('block text-xs tabular', r.stockQty <= 0 ? 'text-danger' : 'text-muted')}>{fmtNumber(r.stockQty)}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
