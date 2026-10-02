import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Smartphone, Tag, Trash2, Layers } from 'lucide-react'
import { CATEGORY_KINDS } from '@shared/constants/enums'
import type { BrandDto, CategoryDto, DeviceModelDto } from '@shared/types/catalog'
import { useApi, useApiMutation } from '../../lib/query'
import { cn } from '../../lib/utils'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, Select } from '../../components/ui/input'
import { Card, CardHeader, EmptyState } from '../../components/ui/misc'

const COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b', '#78716c']

export function SetupTab() {
  const { t } = useTranslation()
  const [brandId, setBrandId] = useState<string | null>(null)
  const categories = useApi('catalog.categories')
  const brands = useApi('catalog.brands')
  const models = useApi('catalog.models', { brandId: brandId ?? undefined }, { enabled: !!brandId })
  const [editCat, setEditCat] = useState<Partial<CategoryDto> | null>(null)
  const [editBrand, setEditBrand] = useState<Partial<BrandDto> | null>(null)
  const [editModel, setEditModel] = useState<Partial<DeviceModelDto> | null>(null)
  const confirm = useConfirm()
  const delCat = useApiMutation('catalog.deleteCategory', { invalidate: ['catalog.'], success: 'common.deleted' })
  const delBrand = useApiMutation('catalog.deleteBrand', { invalidate: ['catalog.'], success: 'common.deleted' })
  const delModel = useApiMutation('catalog.deleteModel', { invalidate: ['catalog.'], success: 'common.deleted' })

  const ask = async (name: string) => confirm({ title: t('common.confirmDelete'), body: name, danger: true, confirmLabel: t('common.delete') })

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-3">
      <Card className="flex min-h-0 flex-col">
        <CardHeader
          icon={Layers}
          title={t('inventory.categories')}
          action={
            <Button size="sm" variant="soft" onClick={() => setEditCat({ kind: 'ACCESSORY', color: COLORS[0] })}>
              <Plus /> {t('common.add')}
            </Button>
          }
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {categories.data?.map((c) => (
            <Row
              key={c.id}
              label={c.name}
              sub={`${t(`inventory.kinds.${c.kind}`)} · ${t('inventory.productsCount', { count: c.productCount })}`}
              color={c.color}
              onEdit={() => setEditCat(c)}
              onDelete={async () => (await ask(c.name)) && delCat.mutate({ id: c.id })}
            />
          ))}
          {categories.data?.length === 0 ? <EmptyState icon={Layers} title={t('common.noResults')} /> : null}
        </div>
      </Card>

      <Card className="flex min-h-0 flex-col">
        <CardHeader
          icon={Tag}
          title={t('inventory.brands')}
          action={
            <Button size="sm" variant="soft" onClick={() => setEditBrand({})}>
              <Plus /> {t('common.add')}
            </Button>
          }
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {brands.data?.map((b) => (
            <Row
              key={b.id}
              label={b.name}
              sub={t('inventory.modelsCount', { count: b.modelCount })}
              active={brandId === b.id}
              onClick={() => setBrandId(b.id)}
              onEdit={() => setEditBrand(b)}
              onDelete={async () => (await ask(b.name)) && delBrand.mutate({ id: b.id })}
            />
          ))}
        </div>
      </Card>

      <Card className="flex min-h-0 flex-col">
        <CardHeader
          icon={Smartphone}
          title={t('inventory.models')}
          subtitle={brands.data?.find((b) => b.id === brandId)?.name}
          action={
            brandId ? (
              <Button size="sm" variant="soft" onClick={() => setEditModel({ brandId })}>
                <Plus /> {t('common.add')}
              </Button>
            ) : null
          }
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {!brandId ? <EmptyState icon={Smartphone} title={t('inventory.selectBrand')} /> : null}
          {models.data?.map((m) => (
            <Row
              key={m.id}
              label={m.name}
              sub={m.aliases ?? undefined}
              onEdit={() => setEditModel(m)}
              onDelete={async () => (await ask(m.name)) && delModel.mutate({ id: m.id })}
            />
          ))}
        </div>
      </Card>

      {editCat ? <CategoryDialog value={editCat} onClose={() => setEditCat(null)} /> : null}
      {editBrand ? <BrandDialog value={editBrand} onClose={() => setEditBrand(null)} /> : null}
      {editModel ? <ModelDialog value={editModel} onClose={() => setEditModel(null)} /> : null}
    </div>
  )
}

function Row({
  label,
  sub,
  color,
  active,
  onClick,
  onEdit,
  onDelete
}: {
  label: string
  sub?: string
  color?: string | null
  active?: boolean
  onClick?: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn('group flex items-center gap-3 rounded-xl px-2.5 py-2', onClick && 'cursor-pointer', active ? 'bg-primary-soft' : 'hover:bg-sunken')}
    >
      {color ? <span className="size-3 shrink-0 rounded-full" style={{ background: color }} /> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        {sub ? <p className="truncate text-xs text-muted">{sub}</p> : null}
      </div>
      <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function CategoryDialog({ value, onClose }: { value: Partial<CategoryDto>; onClose: () => void }) {
  const { t } = useTranslation()
  const [v, setV] = useState(value)
  const save = useApiMutation('catalog.saveCategory', { invalidate: ['catalog.'], success: 'common.saved', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={value.id ? t('common.edit') : t('inventory.newCategory')}
      footer={
        <Button
          loading={save.isPending}
          disabled={!v.name?.trim()}
          onClick={() => save.mutate({ id: v.id, name: v.name ?? '', kind: (v.kind ?? 'ACCESSORY') as CategoryDto['kind'] & 'ACCESSORY', color: v.color ?? null, parentId: v.parentId ?? null })}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label={t('common.name')}>
          <Input autoFocus value={v.name ?? ''} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label={t('inventory.categoryKind')}>
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
            {CATEGORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`inventory.kinds.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setV({ ...v, color: c })}
              className={cn('size-8 rounded-full ring-offset-2 ring-offset-raised', v.color === c && 'ring-2 ring-fg')}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </Dialog>
  )
}

function BrandDialog({ value, onClose }: { value: Partial<BrandDto>; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(value.name ?? '')
  const save = useApiMutation('catalog.saveBrand', { invalidate: ['catalog.'], success: 'common.saved', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={value.id ? t('common.edit') : t('inventory.newBrand')}
      footer={
        <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate({ id: value.id, name })}>
          {t('common.save')}
        </Button>
      }
    >
      <Field label={t('common.name')}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && save.mutate({ id: value.id, name })} />
      </Field>
    </Dialog>
  )
}

function ModelDialog({ value, onClose }: { value: Partial<DeviceModelDto>; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(value.name ?? '')
  const [aliases, setAliases] = useState(value.aliases ?? '')
  const save = useApiMutation('catalog.saveModel', { invalidate: ['catalog.'], success: 'common.saved', onSuccess: onClose })
  const submit = () => save.mutate({ id: value.id, brandId: value.brandId!, name, aliases: aliases || null })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={value.id ? t('common.edit') : t('inventory.newModel')}
      footer={
        <Button loading={save.isPending} disabled={!name.trim()} onClick={submit}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label={t('common.name')}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('inventory.aliases')} hint={t('inventory.aliasesHint')} optional>
          <Input dir="ltr" value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
