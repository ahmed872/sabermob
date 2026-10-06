import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Barcode, ChevronDown, Cpu, Layers, Package, PencilLine, Plus, Save, Smartphone, Sparkles, Trash2, Truck, Wrench, Boxes, Recycle } from 'lucide-react'
import { PRODUCT_TYPES, type ProductType } from '@shared/constants/enums'
import { applyBp, bpToPercentString, ratioBp } from '@shared/money'
import type { ProductDto, VariantListItem } from '@shared/types/catalog'
import type { ProductSaveInput } from '@shared/schemas/catalog'
import { call } from '../../lib/api'
import { invalidate, toastError, useApi } from '../../lib/query'
import { fmtMoney, fmtNumber, fmtPercentBp } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useApp, useCan } from '../../stores/app'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Field, Input, MoneyInput, NumberInput, Select, Textarea } from '../../components/ui/input'
import { Badge, Card, CardHeader, Segmented, SwitchRow } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { MovementsTab } from './movements-tab'
import { AdjustStockDialog } from './adjust-dialog'

interface VariantForm {
  id?: string
  name: string
  sku: string
  color: string
  storage: string
  ram: string
  size: string
  material: string
  sellPrice: number
  costPrice: number
  minPrice: number | null
  wholesalePrice: number | null
  minStock: number | null
  maxStock: number | null
  barcodes: string[]
  openingStock: number
  serialsText: string
  stockQty: number
  remove?: boolean
}

interface ProductForm {
  type: ProductType
  name: string
  altName: string
  categoryId: string
  brandId: string
  deviceModelId: string
  taxBp: number | null
  trackStock: boolean
  trackSerials: boolean
  warrantyDays: number | null
  isFavorite: boolean
  isActive: boolean
  notes: string
}

const TYPE_ICONS: Record<ProductType, typeof Package> = {
  ACCESSORY: Package,
  DEVICE: Smartphone,
  USED_DEVICE: Recycle,
  SERVICE: Wrench,
  PART: Cpu,
  CUSTOM: Boxes
}

const emptyVariant = (): VariantForm => ({
  name: '',
  sku: '',
  color: '',
  storage: '',
  ram: '',
  size: '',
  material: '',
  sellPrice: 0,
  costPrice: 0,
  minPrice: null,
  wholesalePrice: null,
  minStock: null,
  maxStock: null,
  barcodes: [],
  openingStock: 0,
  serialsText: '',
  stockQty: 0
})

function fromDto(p: ProductDto): { product: ProductForm; variants: VariantForm[] } {
  return {
    product: {
      type: p.type,
      name: p.name,
      altName: p.altName ?? '',
      categoryId: p.categoryId ?? '',
      brandId: p.brandId ?? '',
      deviceModelId: p.deviceModelId ?? '',
      taxBp: p.taxBp,
      trackStock: p.trackStock,
      trackSerials: p.trackSerials,
      warrantyDays: p.warrantyDays,
      isFavorite: p.isFavorite,
      isActive: p.isActive,
      notes: p.notes ?? ''
    },
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name ?? '',
      sku: v.sku ?? '',
      color: v.color ?? '',
      storage: v.storage ?? '',
      ram: v.ram ?? '',
      size: v.size ?? '',
      material: v.material ?? '',
      sellPrice: v.sellPrice,
      costPrice: v.costPrice ?? 0,
      minPrice: v.minPrice,
      wholesalePrice: v.wholesalePrice,
      minStock: v.minStock,
      maxStock: v.maxStock,
      barcodes: v.barcodes,
      openingStock: 0,
      serialsText: '',
      stockQty: v.stockQty
    }))
  }
}

export default function ProductEditorPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const existing = useApi('catalog.product', { id: id ?? '' }, { enabled: !isNew })
  if (!isNew && !existing.data) return <PageLoader />
  return <ProductEditor key={id ?? 'new'} initial={existing.data ?? null} />
}

function ProductEditor({ initial }: { initial: ProductDto | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const confirm = useConfirm()
  const settings = useApp((s) => s.settings)!
  const canEdit = can('manage_inventory') && (!initial || can('view_cost'))
  const canCost = can('view_cost')
  const init = useMemo(() => (initial ? fromDto(initial) : null), [initial])
  const [product, setProduct] = useState<ProductForm>(
    init?.product ?? {
      type: 'ACCESSORY',
      name: '',
      altName: '',
      categoryId: '',
      brandId: '',
      deviceModelId: '',
      taxBp: null,
      trackStock: true,
      trackSerials: false,
      warrantyDays: null,
      isFavorite: false,
      isActive: true,
      notes: ''
    }
  )
  const [searchParams] = useSearchParams()
  const [variants, setVariants] = useState<VariantForm[]>(
    init?.variants ?? [{ ...emptyVariant(), barcodes: searchParams.get('barcode') ? [searchParams.get('barcode')!] : [] }]
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [adjustItem, setAdjustItem] = useState<VariantListItem | null>(null)
  // Saved products: the quantity changes through a stock adjustment (kept in the stock history).
  const editStock = can('modify_stock') ? (variantId: string) => void call('catalog.variant', { id: variantId }).then(setAdjustItem, toastError) : undefined
  const addDevices = initial && product.trackSerials && can('manage_purchases') ? () => navigate('/suppliers/purchases/new') : undefined
  // Refresh quantities after an adjustment without losing other edits on the page.
  useEffect(() => {
    if (!initial) return
    setVariants((vs) => vs.map((v) => ({ ...v, stockQty: initial.variants.find((x) => x.id === v.id)?.stockQty ?? v.stockQty })))
  }, [initial])
  const [saving, setSaving] = useState(false)
  const [historyVariant, setHistoryVariant] = useState(init?.variants[0]?.id ?? '')
  const categories = useApi('catalog.categories')
  const brands = useApi('catalog.brands')
  const models = useApi('catalog.models', { brandId: product.brandId || undefined }, { enabled: !!product.brandId })

  const active = variants.filter((v) => !v.remove)
  const multi = active.length > 1
  const isService = product.type === 'SERVICE'
  const isDevice = product.type === 'DEVICE' || product.type === 'USED_DEVICE'
  const showStock = !isService && product.trackStock
  const showCompat = product.type === 'ACCESSORY' || product.type === 'PART' || isDevice

  // Smart defaults when the product type changes (new products only).
  useEffect(() => {
    if (initial) return
    setProduct((p) => ({
      ...p,
      trackStock: product.type !== 'SERVICE',
      trackSerials: product.type === 'USED_DEVICE' || product.type === 'DEVICE',
      warrantyDays: p.warrantyDays ?? (product.type === 'DEVICE' ? 365 : product.type === 'USED_DEVICE' ? 30 : null),
      // Only pre-select a category when it is unambiguous (one category of that kind).
      categoryId: p.categoryId || (() => {
        const kind = product.type === 'USED_DEVICE' || product.type === 'DEVICE' ? 'DEVICE' : product.type === 'CUSTOM' ? 'OTHER' : product.type
        const matching = categories.data?.filter((c) => c.kind === kind) ?? []
        return matching.length === 1 ? matching[0]!.id : ''
      })()
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.type, categories.data])

  const updateVariant = (i: number, patch: Partial<VariantForm>) => setVariants((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v)))

  const generateBarcode = async (i: number) => {
    try {
      const { code } = await call('catalog.generateBarcode')
      updateVariant(i, { barcodes: [...variants[i]!.barcodes, code] })
    } catch (err) {
      toastError(err)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const input: ProductSaveInput = {
        id: initial?.id,
        type: product.type,
        name: product.name,
        altName: product.altName || null,
        categoryId: product.categoryId || null,
        brandId: product.brandId || null,
        deviceModelId: product.deviceModelId || null,
        taxBp: product.taxBp,
        trackStock: product.trackStock,
        trackSerials: product.trackSerials,
        warrantyDays: product.warrantyDays,
        isFavorite: product.isFavorite,
        isActive: product.isActive,
        notes: product.notes || null,
        variants: variants
          .filter((v) => v.id || !v.remove)
          .map((v) => ({
            id: v.id,
            name: v.name || null,
            sku: v.sku || null,
            color: v.color || null,
            storage: v.storage || null,
            ram: v.ram || null,
            size: v.size || null,
            material: v.material || null,
            sellPrice: v.sellPrice,
            costPrice: v.costPrice,
            minPrice: v.minPrice,
            wholesalePrice: v.wholesalePrice,
            minStock: v.minStock,
            maxStock: v.maxStock,
            barcodes: v.barcodes.map((b) => b.trim()).filter(Boolean),
            openingStock: v.id ? 0 : v.openingStock,
            serials: product.trackSerials && !v.id ? v.serialsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : undefined,
            remove: v.remove
          }))
      }
      const saved = await call('catalog.saveProduct', input)
      invalidate('catalog.', 'inventory.')
      toast.success(t('inventory.saved'))
      navigate(`/inventory/products/${saved.id}`, { replace: true })
      if (initial) {
        const next = fromDto(saved)
        setProduct(next.product)
        setVariants(next.variants)
      }
    } catch (err) {
      toastError(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!initial) return
    const ok = await confirm({ title: t('inventory.deleteConfirm', { name: initial.name }), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    try {
      await call('catalog.deleteProduct', { id: initial.id })
      invalidate('catalog.', 'inventory.')
      toast.success(t('inventory.deleted'))
      navigate('/inventory')
    } catch (err) {
      toastError(err)
    }
  }

  const canSave = canEdit && product.name.trim().length > 0 && active.length > 0 && (!multi || active.every((v) => v.name.trim()))
  const first = active[0]
  const taxDefault = settings.taxes.enabled ? bpToPercentString(settings.taxes.defaultTaxBp) + '%' : '0%'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/inventory')}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
          <h1 className="truncate text-lg font-extrabold">{initial ? initial.name : t('inventory.newProduct')}</h1>
          {initial && !initial.isActive ? <Badge tone="neutral">{t('common.inactive')}</Badge> : null}
        </div>
        <div className="flex gap-2">
          {initial && can('manage_inventory') ? (
            <Button variant="ghost" onClick={remove}>
              <Trash2 /> {t('common.delete')}
            </Button>
          ) : null}
          {canEdit ? (
            <Button onClick={save} loading={saving} disabled={!canSave}>
              <Save /> {t('common.save')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <fieldset disabled={!canEdit} className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {!initial ? (
              <Card>
                <p className="mb-3 text-sm font-bold">{t('inventory.productType')}</p>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                  {PRODUCT_TYPES.map((ty) => {
                    const Icon = TYPE_ICONS[ty]
                    return (
                      <button
                        key={ty}
                        type="button"
                        onClick={() => setProduct({ ...product, type: ty })}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition',
                          product.type === ty ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:border-line-strong'
                        )}
                      >
                        <Icon className="size-6" />
                        <span className="text-[13px] font-bold">{t(`inventory.types.${ty}`)}</span>
                        <span className="hidden text-[11px] leading-tight text-muted xl:block">{t(`inventory.typeHints.${ty}`)}</span>
                      </button>
                    )
                  })}
                </div>
              </Card>
            ) : null}

            <Card>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('inventory.productName')} className="sm:col-span-2">
                  <Input autoFocus={!initial} value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} className="h-11 text-base font-semibold" />
                </Field>
                <Field label={t('inventory.altName')} hint={t('inventory.altNameHint')} optional>
                  <Input value={product.altName} onChange={(e) => setProduct({ ...product, altName: e.target.value })} />
                </Field>
                <Field label={t('inventory.category')} hint={t('inventory.categoryHint')} optional>
                  <Select value={product.categoryId} onChange={(e) => setProduct({ ...product, categoryId: e.target.value })}>
                    <option value="">{t('common.none')}</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {showCompat ? (
                  <>
                    <Field label={isDevice ? t('inventory.brand') : t('inventory.phoneBrand')} hint={isDevice ? undefined : t('inventory.phoneBrandHint')} optional>
                      <Select value={product.brandId} onChange={(e) => setProduct({ ...product, brandId: e.target.value, deviceModelId: '' })}>
                        <option value="">{t('common.none')}</option>
                        {brands.data?.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={isDevice ? t('inventory.model') : t('inventory.compatibleModel')} hint={isDevice ? undefined : t('inventory.compatibleModelHint')} optional>
                      <Select value={product.deviceModelId} disabled={!product.brandId} onChange={(e) => setProduct({ ...product, deviceModelId: e.target.value })}>
                        <option value="">{t('common.none')}</option>
                        {models.data?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                ) : null}
              </div>
            </Card>

            {!multi && first ? (
              <Card>
                <CardHeader title={t('common.price')} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t('inventory.sellPrice')} hint={isService && first.sellPrice === 0 ? t('inventory.openPrice') : undefined}>
                    <MoneyInput value={first.sellPrice} onChange={(v) => updateVariant(variants.indexOf(first), { sellPrice: v ?? 0 })} className="h-11 text-base font-bold" />
                  </Field>
                  {canCost ? (
                    <Field label={t('inventory.costPrice')} hint={t('inventory.costPriceHint')}>
                      <MoneyInput value={first.costPrice} onChange={(v) => updateVariant(variants.indexOf(first), { costPrice: v ?? 0 })} />
                    </Field>
                  ) : null}
                  <Field label={t('inventory.minPrice')} hint={t('inventory.minPriceHint')} optional>
                    <MoneyInput allowEmpty value={first.minPrice} onChange={(v) => updateVariant(variants.indexOf(first), { minPrice: v })} />
                  </Field>
                </div>
                {canCost && first.sellPrice > 0 && first.costPrice > first.sellPrice ? (
                  <p className="mt-2 text-sm font-semibold text-danger">{t('inventory.priceBelowCost')}</p>
                ) : null}
              </Card>
            ) : null}

            {!isService ? (
              <Card>
                <CardHeader
                  title={showStock ? t('inventory.stockQty') : t('inventory.barcodes')}
                  icon={showStock ? Boxes : Barcode}
                  action={
                    !multi ? (
                      <Button size="sm" variant="ghost" onClick={() => setVariants([...variants, { ...emptyVariant(), sellPrice: first?.sellPrice ?? 0, costPrice: first?.costPrice ?? 0 }])}>
                        <Layers /> {t('inventory.addVariant')}
                      </Button>
                    ) : null
                  }
                />
                {!multi && first ? (
                  <SingleStockFields
                    v={first}
                    isNew={!first.id}
                    showStock={showStock}
                    trackSerials={product.trackSerials}
                    onChange={(patch) => updateVariant(variants.indexOf(first), patch)}
                    onGenerate={() => generateBarcode(variants.indexOf(first))}
                    isDevice={isDevice}
                    onTrackSerials={(v) => setProduct({ ...product, trackSerials: v })}
                    onEditStock={editStock}
                    onAddDevices={addDevices}
                  />
                ) : null}
                {multi ? (
                  <VariantsTable
                    variants={variants}
                    canCost={canCost}
                    showStock={showStock}
                    trackSerials={product.trackSerials}
                    onChange={updateVariant}
                    onEditStock={editStock}
                    onGenerate={generateBarcode}
                    onRemove={(i) => (variants[i]!.id ? updateVariant(i, { remove: true }) : setVariants(variants.filter((_, k) => k !== i)))}
                    onAdd={() => setVariants([...variants, { ...emptyVariant(), sellPrice: first?.sellPrice ?? 0, costPrice: first?.costPrice ?? 0 }])}
                  />
                ) : null}
                <p className="mt-2 text-xs text-muted">{t('inventory.variantsHint')}</p>
              </Card>
            ) : null}

            <Card>
              <button type="button" className="flex w-full items-center justify-between text-sm font-bold" onClick={() => setShowAdvanced(!showAdvanced)}>
                {t('inventory.advanced')}
                <ChevronDown className={cn('size-4 transition', showAdvanced && 'rotate-180')} />
              </button>
              {showAdvanced ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label={t('inventory.warranty')} optional>
                    <NumberInput allowEmpty value={product.warrantyDays} max={3650} onChange={(v) => setProduct({ ...product, warrantyDays: v })} />
                  </Field>
                  <Field label={t('inventory.tax')}>
                    <Select value={product.taxBp === null ? '' : String(product.taxBp)} onChange={(e) => setProduct({ ...product, taxBp: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">{t('inventory.taxDefault', { rate: taxDefault })}</option>
                      {[0, 500, 1000, 1400].map((bp) => (
                        <option key={bp} value={bp}>
                          {bpToPercentString(bp)}%
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {!multi && first ? (
                    <>
                      <Field label={t('inventory.wholesalePrice')} optional>
                        <MoneyInput allowEmpty value={first.wholesalePrice} onChange={(v) => updateVariant(variants.indexOf(first), { wholesalePrice: v })} />
                      </Field>
                      <Field label={t('inventory.sku')} optional>
                        <Input dir="ltr" value={first.sku} onChange={(e) => updateVariant(variants.indexOf(first), { sku: e.target.value })} />
                      </Field>
                      {showStock ? (
                        <Field label={t('inventory.maxStock')} optional>
                          <NumberInput allowEmpty value={first.maxStock} onChange={(v) => updateVariant(variants.indexOf(first), { maxStock: v })} />
                        </Field>
                      ) : null}
                      {isDevice ? (
                        <>
                          <Field label={t('inventory.storage')} optional>
                            <Input value={first.storage} onChange={(e) => updateVariant(variants.indexOf(first), { storage: e.target.value })} placeholder="128GB" />
                          </Field>
                          <Field label={t('inventory.ram')} optional>
                            <Input value={first.ram} onChange={(e) => updateVariant(variants.indexOf(first), { ram: e.target.value })} placeholder="8GB" />
                          </Field>
                        </>
                      ) : null}
                      <Field label={t('inventory.color')} optional>
                        <Input value={first.color} onChange={(e) => updateVariant(variants.indexOf(first), { color: e.target.value })} />
                      </Field>
                      {product.type === 'ACCESSORY' ? (
                        <Field label={t('inventory.material')} optional>
                          <Input value={first.material} onChange={(e) => updateVariant(variants.indexOf(first), { material: e.target.value })} />
                        </Field>
                      ) : null}
                    </>
                  ) : null}
                  {!isService ? (
                    <div className="sm:col-span-2">
                      <SwitchRow label={t('inventory.trackStock')} checked={product.trackStock} onCheckedChange={(v) => setProduct({ ...product, trackStock: v, trackSerials: v && product.trackSerials })} />
                      {isDevice ? (
                        <SwitchRow label={t('inventory.trackSerials')} checked={product.trackSerials} onCheckedChange={(v) => setProduct({ ...product, trackSerials: v })} disabled={!product.trackStock} />
                      ) : null}
                    </div>
                  ) : null}
                  <Field label={t('inventory.notes')} optional className="sm:col-span-2">
                    <Textarea value={product.notes} onChange={(e) => setProduct({ ...product, notes: e.target.value })} />
                  </Field>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <SwitchRow label={t('inventory.favorite')} checked={product.isFavorite} onCheckedChange={(v) => setProduct({ ...product, isFavorite: v })} />
              <SwitchRow label={t('inventory.active')} checked={product.isActive} onCheckedChange={(v) => setProduct({ ...product, isActive: v })} />
            </Card>
            {first && canCost && first.sellPrice > 0 ? (
              <Card>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Sparkles className="size-4 text-primary" /> {t('inventory.margin')}
                </div>
                <p className="mt-2 text-3xl font-extrabold tabular">{fmtPercentBp(ratioBp(first.sellPrice - first.costPrice, first.sellPrice))}</p>
                <p className="text-sm text-muted">
                  {t('inventory.profitPerUnit')}: <b className="text-fg">{fmtMoney(first.sellPrice - first.costPrice)}</b>
                </p>
                {settings.taxes.enabled && settings.taxes.pricesIncludeTax ? (
                  <p className="mt-1 text-xs text-muted">
                    {settings.taxes.taxLabel}: {fmtMoney(applyBp(first.sellPrice, product.taxBp ?? settings.taxes.defaultTaxBp))}
                  </p>
                ) : null}
              </Card>
            ) : null}
            {initial && showStock ? (
              <Card>
                <p className="text-sm font-bold">{t('inventory.stockQty')}</p>
                <p className="mt-1 text-3xl font-extrabold tabular">{fmtNumber(initial.variants.reduce((a, v) => a + v.stockQty, 0))}</p>
                {product.trackSerials ? (
                  <p className="text-xs text-muted">{t('inventory.serialsCount', { count: initial.variants.reduce((a, v) => a + v.serialsInStock, 0) })}</p>
                ) : null}
              </Card>
            ) : null}
          </div>
        </fieldset>

        {initial && showStock ? (
          <div className="mx-auto mt-4 max-w-6xl">
            <Card padded={false} className="h-[420px] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[15px] font-bold">{t('inventory.history')}</h3>
                {initial.variants.length > 1 ? (
                  <Select className="w-56" value={historyVariant} onChange={(e) => setHistoryVariant(e.target.value)}>
                    {initial.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name ?? initial.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>
              <div className="h-[350px]">
                <MovementsTab variantId={historyVariant} />
              </div>
            </Card>
          </div>
        ) : null}
      </div>
      {adjustItem ? <AdjustStockDialog key={adjustItem.variantId} open onOpenChange={(o) => !o && setAdjustItem(null)} initial={adjustItem} /> : null}
    </div>
  )
}

function BarcodeEditor({ codes, onChange, onGenerate }: { codes: string[]; onChange: (c: string[]) => void; onGenerate: () => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const add = () => {
    const c = draft.trim()
    if (c && !codes.includes(c)) onChange([...codes, c])
    setDraft('')
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input
          dir="ltr"
          className="font-mono"
          value={draft}
          placeholder="6221234567890"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
        <Button variant="outline" onClick={onGenerate} type="button">
          <Barcode /> {t('inventory.generateBarcode')}
        </Button>
      </div>
      {codes.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-lg bg-sunken px-2 py-1 font-mono text-xs" dir="ltr">
              {c}
              <button type="button" className="text-subtle hover:text-danger" onClick={() => onChange(codes.filter((x) => x !== c))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SingleStockFields({
  v,
  isNew,
  showStock,
  trackSerials,
  onChange,
  onGenerate,
  isDevice,
  onTrackSerials,
  onEditStock,
  onAddDevices
}: {
  v: VariantForm
  isNew: boolean
  showStock: boolean
  trackSerials: boolean
  onChange: (p: Partial<VariantForm>) => void
  onGenerate: () => void
  isDevice: boolean
  onTrackSerials: (v: boolean) => void
  onEditStock?: (variantId: string) => void
  onAddDevices?: () => void
}) {
  const { t } = useTranslation()
  const serialCount = v.serialsText.split(/\r?\n/).filter((s) => s.trim()).length
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showStock && isNew && isDevice ? (
        <Field label={t('inventory.countBy')} className="sm:col-span-2">
          <Segmented
            value={trackSerials ? 'imei' : 'qty'}
            onChange={(m) => onTrackSerials(m === 'imei')}
            options={[
              { value: 'imei', label: t('inventory.byImei') },
              { value: 'qty', label: t('inventory.byQty') }
            ]}
          />
        </Field>
      ) : null}
      {showStock ? (
        <>
          {isNew && !trackSerials ? (
            <Field label={t('inventory.openingStock')}>
              <NumberInput value={v.openingStock} onChange={(n) => onChange({ openingStock: n ?? 0 })} className="h-11 text-base font-bold" />
            </Field>
          ) : isNew && trackSerials ? (
            <Field label={t('inventory.openingStock')}>
              <div className="flex h-11 items-center rounded-xl bg-sunken px-3 text-base font-bold tabular">{fmtNumber(serialCount)}</div>
            </Field>
          ) : (
            <Field label={t('inventory.stockQty')} hint={!onEditStock && onAddDevices ? t('inventory.serialStockHint') : undefined}>
              <div className="flex gap-2">
                <div className="flex h-11 flex-1 items-center rounded-xl bg-sunken px-3 text-base font-bold tabular">{fmtNumber(v.stockQty)}</div>
                {onEditStock && v.id ? (
                  <Button variant="outline" className="h-11" onClick={() => onEditStock(v.id!)}>
                    <PencilLine /> {t('inventory.editQty')}
                  </Button>
                ) : onAddDevices ? (
                  <Button variant="outline" className="h-11" onClick={onAddDevices}>
                    <Truck /> {t('inventory.addDevices')}
                  </Button>
                ) : null}
              </div>
            </Field>
          )}
          <Field label={t('inventory.minStock')} hint={t('inventory.minStockHint')}>
            <NumberInput allowEmpty value={v.minStock} onChange={(n) => onChange({ minStock: n })} placeholder="2" />
          </Field>
        </>
      ) : null}
      {isNew && trackSerials && isDevice ? (
        <Field label={`${t('inventory.serials')} (${serialCount})`} hint={t('inventory.serialsHint')} className="sm:col-span-2">
          <Textarea dir="ltr" rows={4} className="font-mono" value={v.serialsText} onChange={(e) => onChange({ serialsText: e.target.value })} />
        </Field>
      ) : null}
      <Field label={t('inventory.barcodes')} optional className="sm:col-span-2">
        <BarcodeEditor codes={v.barcodes} onChange={(barcodes) => onChange({ barcodes })} onGenerate={onGenerate} />
      </Field>
    </div>
  )
}

function VariantsTable({
  variants,
  canCost,
  showStock,
  trackSerials,
  onChange,
  onEditStock,
  onGenerate,
  onRemove,
  onAdd
}: {
  variants: VariantForm[]
  canCost: boolean
  showStock: boolean
  trackSerials: boolean
  onChange: (i: number, p: Partial<VariantForm>) => void
  onEditStock?: (variantId: string) => void
  onGenerate: (i: number) => void
  onRemove: (i: number) => void
  onAdd: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      {variants.map((v, i) =>
        v.remove ? null : (
          <div key={v.id ?? `n${i}`} className="rounded-xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto]">
              <Field label={t('inventory.variantName')}>
                <Input value={v.name} onChange={(e) => onChange(i, { name: e.target.value, color: v.color || e.target.value })} placeholder="Black / 128GB" />
              </Field>
              <Field label={t('inventory.sellPrice')}>
                <MoneyInput value={v.sellPrice} onChange={(n) => onChange(i, { sellPrice: n ?? 0 })} />
              </Field>
              {canCost ? (
                <Field label={t('inventory.costPrice')}>
                  <MoneyInput value={v.costPrice} onChange={(n) => onChange(i, { costPrice: n ?? 0 })} />
                </Field>
              ) : (
                <span />
              )}
              {showStock ? (
                <Field label={v.id ? t('inventory.stockQty') : t('inventory.openingStock')}>
                  {v.id ? (
                    <div className="flex h-10 items-center gap-1 rounded-xl bg-sunken ps-3 font-bold tabular">
                      <span className="flex-1">{fmtNumber(v.stockQty)}</span>
                      {onEditStock ? (
                        <Button variant="ghost" size="icon-sm" title={t('inventory.editQty')} onClick={() => onEditStock(v.id!)}>
                          <PencilLine />
                        </Button>
                      ) : null}
                    </div>
                  ) : trackSerials ? (
                    <div className="flex h-10 items-center rounded-xl bg-sunken px-3 font-bold tabular">{v.serialsText.split(/\n/).filter((s) => s.trim()).length}</div>
                  ) : (
                    <NumberInput value={v.openingStock} onChange={(n) => onChange(i, { openingStock: n ?? 0 })} />
                  )}
                </Field>
              ) : (
                <span />
              )}
              <div className="flex items-end">
                <Button variant="ghost" size="icon" onClick={() => onRemove(i)} disabled={v.id !== undefined && v.stockQty !== 0}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {!v.id && trackSerials ? (
              <Textarea dir="ltr" rows={2} className="mt-2 font-mono" placeholder={t('inventory.serials')} value={v.serialsText} onChange={(e) => onChange(i, { serialsText: e.target.value })} />
            ) : null}
            <div className="mt-2">
              <BarcodeEditor codes={v.barcodes} onChange={(barcodes) => onChange(i, { barcodes })} onGenerate={() => onGenerate(i)} />
            </div>
          </div>
        )
      )}
      <Button variant="soft" size="sm" onClick={onAdd}>
        <Plus /> {t('inventory.addVariant')}
      </Button>
    </div>
  )
}
