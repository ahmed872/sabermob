import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, PackageSearch, Plus, Star } from 'lucide-react'
import type { VariantListItem } from '@shared/types/catalog'
import type { PosSearchInput } from '@shared/schemas/catalog'
import { useApi } from '../../lib/query'
import { fmtMoney, fmtNumber } from '../../lib/format'
import { cn, debounce } from '../../lib/utils'
import { SearchInput } from '../../components/ui/input'
import { EmptyState } from '../../components/ui/misc'

type Mode = { kind: 'favorites' } | { kind: 'recent' } | { kind: 'category'; id: string }

export interface ProductPanelHandle {
  focusSearch: () => void
}

export const ProductPanel = forwardRef<
  ProductPanelHandle,
  { onPick: (item: VariantListItem) => void; onSubmitCode: (code: string, firstResult: VariantListItem | undefined) => void; onCustomItem: () => void }
>(({ onPick, onSubmitCode, onCustomItem }, ref) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<Mode>({ kind: 'favorites' })
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({ focusSearch: () => inputRef.current?.focus() }))
  const categories = useApi('catalog.categories', undefined, { staleTime: 60_000 })
  const setQuery = useMemo(() => debounce((v: string) => setQ(v), 90), [])
  useEffect(() => () => setQuery.cancel(), [setQuery])

  const searching = q.trim().length > 0
  const input: PosSearchInput = searching
    ? { q, mode: 'search', limit: 48 }
    : mode.kind === 'category'
      ? { mode: 'category', categoryId: mode.id, limit: 60 }
      : { mode: mode.kind, limit: 60 }
  const results = useApi('catalog.posSearch', input, { placeholderData: (p) => p, staleTime: 2_000 })
  const items = results.data ?? []

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="space-y-2.5 p-3 pb-2">
        <SearchInput
          ref={inputRef}
          size="lg"
          autoFocus
          data-scanner-target="1"
          value={text}
          placeholder={t('pos.searchPlaceholder')}
          onChange={(e) => {
            setText(e.target.value)
            setQuery(e.target.value)
          }}
          onClear={() => {
            setText('')
            setQ('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault()
              setQuery.cancel()
              onSubmitCode(text.trim(), q.trim() === text.trim() ? items[0] : undefined)
              setText('')
              setQ('')
            }
          }}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Chip active={!searching && mode.kind === 'favorites'} onClick={() => setMode({ kind: 'favorites' })}>
            <Star className="size-3.5" /> {t('pos.favorites')}
          </Chip>
          <Chip active={!searching && mode.kind === 'recent'} onClick={() => setMode({ kind: 'recent' })}>
            <Clock className="size-3.5" /> {t('pos.recent')}
          </Chip>
          {categories.data?.map((c) => (
            <Chip key={c.id} active={!searching && mode.kind === 'category' && mode.id === c.id} onClick={() => setMode({ kind: 'category', id: c.id })} color={c.color}>
              {c.name}
            </Chip>
          ))}
          <Chip onClick={onCustomItem}>
            <Plus className="size-3.5" /> {t('pos.customItem')}
          </Chip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {items.length === 0 && !results.isFetching ? (
          <EmptyState icon={PackageSearch} title={t('common.noResults')} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {items.map((item) => (
              <ProductTile key={item.variantId} item={item} onClick={() => onPick(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
ProductPanel.displayName = 'ProductPanel'

function Chip({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick: () => void; color?: string | null }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition',
        active ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-muted hover:text-fg'
      )}
    >
      {color ? <span className="size-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  )
}

function ProductTile({ item, onClick }: { item: VariantListItem; onClick: () => void }) {
  const { t } = useTranslation()
  const out = item.trackStock && item.stockQty <= 0
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex h-[104px] flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-3 text-start shadow-[var(--shadow-card)] transition active:scale-[0.97] hover:border-primary',
        out && 'opacity-60'
      )}
    >
      <span className="absolute inset-y-0 start-0 w-1" style={{ background: item.categoryColor ?? 'transparent' }} />
      <span className="flex min-w-0 items-start gap-2">
        <span className="line-clamp-2 flex-1 text-[13px] font-bold leading-snug">{item.name}</span>
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg border border-line bg-white object-contain" /> : null}
      </span>
      <span className="flex items-end justify-between gap-1">
        <span className="text-[15px] font-extrabold text-primary tabular">{item.sellPrice === 0 ? t('pos.openPrice') : fmtMoney(item.sellPrice)}</span>
        {item.trackStock ? (
          <span className={cn('rounded-md px-1.5 text-[11px] font-bold tabular', out ? 'bg-danger-soft text-danger' : item.stockQty <= item.minStock ? 'bg-warning-soft text-warning' : 'bg-sunken text-muted')}>
            {out ? t('pos.outOfStock') : fmtNumber(item.stockQty)}
          </span>
        ) : null}
      </span>
    </button>
  )
}
