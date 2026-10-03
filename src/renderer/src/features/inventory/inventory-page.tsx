import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Boxes, FileSpreadsheet, Package, PackagePlus, Star, Tags } from 'lucide-react'
import type { ProductQueryInput } from '@shared/schemas/catalog'
import type { VariantListItem } from '@shared/types/catalog'
import { PRODUCT_TYPES } from '@shared/constants/enums'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtMoney, fmtNumber } from '../../lib/format'
import { cn, debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Select, SearchInput } from '../../components/ui/input'
import { Badge, Card, EmptyState, PageHeader, Tabs } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'
import { AdjustStockDialog } from './adjust-dialog'
import { MovementsTab } from './movements-tab'
import { SetupTab } from './setup-tab'
import { LabelsDialog } from './labels-dialog'
import { ImportDialog } from '../importer/import-dialog'

export default function InventoryPage() {
  const { t } = useTranslation()
  const { tab = 'products' } = useParams()
  const navigate = useNavigate()
  const can = useCan()
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="flex h-full flex-col p-5">
      <PageHeader
        icon={Package}
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        actions={
          <>
            {can('manage_inventory') && can('import_data') ? (
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet /> {t('importer.button')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setLabelsOpen(true)}>
              <Tags /> {t('print.labels')}
            </Button>
            {can('modify_stock') ? (
              <Button variant="outline" onClick={() => setAdjustOpen(true)}>
                <ArrowDownUp /> {t('inventory.adjust')}
              </Button>
            ) : null}
            {can('manage_inventory') ? (
              <Button onClick={() => navigate('/inventory/products/new')}>
                <PackagePlus /> {t('inventory.newProduct')}
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onValueChange={(v) => navigate(v === 'products' ? '/inventory' : `/inventory/${v}`)}
        items={[
          { value: 'products', label: t('inventory.products') },
          { value: 'stock', label: t('inventory.stock') },
          ...(can('manage_inventory') ? [{ value: 'setup', label: t('inventory.setup') }] : [])
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === 'stock' ? <MovementsTab /> : tab === 'setup' ? <SetupTab /> : <ProductsTab />}
      </div>
      {adjustOpen ? <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} /> : null}
      {labelsOpen ? <LabelsDialog onClose={() => setLabelsOpen(false)} /> : null}
      {importOpen ? <ImportDialog entity="products" onClose={() => setImportOpen(false)} /> : null}
    </div>
  )
}

function StockBadge({ item }: { item: VariantListItem }) {
  const { t } = useTranslation()
  if (!item.trackStock) return <span className="text-xs text-subtle">—</span>
  const tone = item.stockQty <= 0 ? 'danger' : item.stockQty <= item.minStock ? 'warning' : item.maxStock !== null && item.stockQty > item.maxStock ? 'info' : 'success'
  return (
    <Badge tone={tone} className="tabular">
      {fmtNumber(item.stockQty)}
    </Badge>
  )
}

function ProductsTab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState<ProductQueryInput>({ page: 1, pageSize: 50, stock: 'all', sort: 'name' })
  const [adjustItem, setAdjustItem] = useState<VariantListItem | null>(null)
  const categories = useApi('catalog.categories')
  const brands = useApi('catalog.brands')
  const alerts = useApi('inventory.alerts')
  const list = useApi('catalog.list', query, { placeholderData: (prev) => prev })
  const fav = useApiMutation('catalog.toggleFavorite', { invalidate: ['catalog.'] })

  const setSearch = useMemo(() => debounce((v: string) => setQuery((qq) => ({ ...qq, q: v || undefined, page: 1 })), 200), [])
  useEffect(() => () => setSearch.cancel(), [setSearch])

  const columns: Column<VariantListItem>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.categoryColor ?? 'var(--line-strong)' }} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.name}</p>
            <p className="truncate text-xs text-muted">{[t(`inventory.types.${r.type}`), r.categoryName, r.brandName, r.modelName].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      )
    },
    { key: 'code', header: t('inventory.barcode'), cell: (r) => <span className="font-mono text-xs text-muted" dir="ltr">{r.barcode ?? r.sku ?? '—'}</span> },
    { key: 'price', header: t('inventory.sellPrice'), align: 'end', cell: (r) => <span className="font-bold tabular">{fmtMoney(r.sellPrice)}</span> },
    ...(can('view_cost')
      ? [{ key: 'cost', header: t('inventory.costPrice'), align: 'end' as const, cell: (r: VariantListItem) => <span className="tabular text-muted">{fmtMoney(r.costPrice)}</span> }]
      : []),
    { key: 'stock', header: t('inventory.stockQty'), align: 'center', cell: (r) => <StockBadge item={r} /> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: '96px',
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {can(['manage_inventory', 'create_sale']) ? (
            <Button variant="ghost" size="icon-sm" onClick={() => fav.mutate({ id: r.productId, isFavorite: !r.isFavorite })} aria-label={t('inventory.favorite')}>
              <Star className={cn(r.isFavorite && 'fill-amber-400 text-amber-400')} />
            </Button>
          ) : null}
          {can('modify_stock') && r.trackStock ? (
            <Button variant="ghost" size="icon-sm" onClick={() => setAdjustItem(r)} aria-label={t('inventory.adjust')}>
              <ArrowDownUp />
            </Button>
          ) : null}
        </div>
      )
    }
  ]

  const chips: Array<{ key: NonNullable<ProductQueryInput['stock']> | 'favorites'; label: string; count?: number }> = [
    { key: 'all', label: t('inventory.filters.all') },
    { key: 'low', label: t('inventory.filters.low'), count: alerts.data?.low },
    { key: 'out', label: t('inventory.filters.out'), count: alerts.data?.out },
    { key: 'dead', label: t('inventory.filters.dead'), count: alerts.data?.dead },
    { key: 'favorites', label: t('inventory.filters.favorites') }
  ]
  const activeChip = query.favorites ? 'favorites' : (query.stock ?? 'all')

  return (
    <Card padded={false} className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="min-w-60 flex-1">
          <SearchInput
            autoFocus
            value={q}
            placeholder={`${t('common.searchPlaceholder')} (A55, جراب، 622…)`}
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
        <Select className="w-44" value={query.categoryId ?? ''} onChange={(e) => setQuery({ ...query, categoryId: e.target.value || undefined, page: 1 })}>
          <option value="">{t('inventory.allCategories')}</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={query.brandId ?? ''} onChange={(e) => setQuery({ ...query, brandId: e.target.value || undefined, page: 1 })}>
          <option value="">{t('inventory.allBrands')}</option>
          {brands.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select className="w-36" value={query.type ?? ''} onChange={(e) => setQuery({ ...query, type: (e.target.value || undefined) as ProductQueryInput['type'], page: 1 })}>
          <option value="">{t('inventory.allTypes')}</option>
          {PRODUCT_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`inventory.types.${ty}`)}
            </option>
          ))}
        </Select>
        <Select className="w-36" value={query.sort} onChange={(e) => setQuery({ ...query, sort: e.target.value as ProductQueryInput['sort'] })}>
          {(['name', 'stock', 'price', 'recent'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`inventory.sort.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() =>
              setQuery({ ...query, page: 1, favorites: c.key === 'favorites' ? true : undefined, stock: c.key === 'favorites' ? 'all' : (c.key as ProductQueryInput['stock']) })
            }
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition',
              activeChip === c.key ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg'
            )}
          >
            {c.label}
            {c.count ? <span className="rounded-full bg-danger px-1.5 text-[11px] text-white tabular">{c.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          rowKey={(r) => r.variantId}
          loading={list.isFetching}
          onRowClick={(r) => navigate(`/inventory/products/${r.productId}`)}
          empty={
            <EmptyState
              icon={Boxes}
              title={t('inventory.noProducts')}
              body={t('inventory.noProductsBody')}
              action={
                can('manage_inventory') ? (
                  <Button onClick={() => navigate('/inventory/products/new')}>
                    <PackagePlus /> {t('inventory.newProduct')}
                  </Button>
                ) : null
              }
            />
          }
        />
      </div>
      <div className="border-t border-line">
        <Pagination page={query.page ?? 1} pageSize={query.pageSize ?? 50} total={list.data?.total ?? 0} onPage={(p) => setQuery({ ...query, page: p })} />
      </div>
      {adjustItem ? <AdjustStockDialog open onOpenChange={(o) => !o && setAdjustItem(null)} initial={adjustItem} /> : null}
    </Card>
  )
}

