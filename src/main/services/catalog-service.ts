import { AppError } from '@shared/errors'
import { buildSearchText, searchTokens } from '@shared/text'
import type {
  BrandSaveInput,
  CategorySaveInput,
  DeviceModelSaveInput,
  PosSearchInput,
  ProductQueryInput,
  ProductSaveInput,
  VariantInput
} from '@shared/schemas/catalog'
import type { BrandDto, CategoryDto, DeviceModelDto, Paged, ProductDto, SerialDto, VariantListItem } from '@shared/types/catalog'
import { rawQuery, type Db, type Tx } from '../database/client'
import type { Actor } from './auth-service'
import type { AuditService } from './audit-service'
import { applyStockChange } from './inventory-service'
import { ean13CheckDigit, nextNumber } from './numbering'
import type { SettingsService } from './settings-service'

const SERIAL_TYPES = new Set(['DEVICE', 'USED_DEVICE'])

interface VariantRow {
  variantId: string
  productId: string
  type: string
  productName: string
  variantName: string | null
  sku: string | null
  barcode: string | null
  sellPrice: number
  minPrice: number | null
  wholesalePrice: number | null
  costPrice: number
  stockQty: number
  minStock: number
  maxStock: number | null
  trackStock: number
  trackSerials: number
  taxBp: number | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  brandName: string | null
  modelName: string | null
  isFavorite: number
  isActive: number
  warrantyDays: number | null
  lastSoldAt: string | Date | null
}

const VARIANT_SELECT = `
  SELECT v.id AS variantId, p.id AS productId, p.type AS type, p.name AS productName, v.name AS variantName,
         v.sku AS sku,
         (SELECT b.code FROM Barcode b WHERE b.variantId = v.id ORDER BY b.isInternal ASC, b.createdAt ASC LIMIT 1) AS barcode,
         v.sellPrice AS sellPrice, v.minPrice AS minPrice, v.wholesalePrice AS wholesalePrice, v.costPrice AS costPrice,
         v.stockQty AS stockQty, v.minStock AS minStock, v.maxStock AS maxStock,
         p.trackStock AS trackStock, p.trackSerials AS trackSerials, p.taxBp AS taxBp,
         p.categoryId AS categoryId, c.name AS categoryName, c.color AS categoryColor,
         br.name AS brandName, m.name AS modelName, p.isFavorite AS isFavorite, p.isActive AS isActive,
         p.warrantyDays AS warrantyDays, v.lastSoldAt AS lastSoldAt
  FROM ProductVariant v
  JOIN Product p ON p.id = v.productId
  LEFT JOIN Category c ON c.id = p.categoryId
  LEFT JOIN Brand br ON br.id = p.brandId
  LEFT JOIN DeviceModel m ON m.id = p.deviceModelId`

function toListItem(r: VariantRow, canViewCost: boolean): VariantListItem {
  const lastSold = r.lastSoldAt instanceof Date ? r.lastSoldAt.toISOString() : r.lastSoldAt
  return {
    variantId: r.variantId,
    productId: r.productId,
    type: r.type as VariantListItem['type'],
    name: r.variantName ? `${r.productName} — ${r.variantName}` : r.productName,
    productName: r.productName,
    variantName: r.variantName,
    sku: r.sku,
    barcode: r.barcode,
    sellPrice: r.sellPrice,
    minPrice: r.minPrice,
    wholesalePrice: r.wholesalePrice,
    costPrice: canViewCost ? r.costPrice : null,
    stockQty: r.stockQty,
    minStock: r.minStock,
    maxStock: r.maxStock,
    trackStock: !!r.trackStock,
    trackSerials: !!r.trackSerials,
    taxBp: r.taxBp,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
    brandName: r.brandName,
    modelName: r.modelName,
    isFavorite: !!r.isFavorite,
    isActive: !!r.isActive,
    warrantyDays: r.warrantyDays,
    lastSoldAt: lastSold ?? null
  }
}

/** Escapes LIKE wildcards in user input. */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export class CatalogService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly audit: AuditService
  ) {}

  // ───────────── Brands / models / categories ─────────────

  async listBrands(): Promise<BrandDto[]> {
    const rows = await this.db.brand.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { models: { where: { deletedAt: null } } } } }
    })
    return rows.map((b) => ({ id: b.id, name: b.name, modelCount: b._count.models }))
  }

  async saveBrand(input: BrandSaveInput, actor: Actor): Promise<BrandDto> {
    const name = input.name.trim()
    const dupe = await this.db.brand.findFirst({ where: { name, deletedAt: null, NOT: input.id ? { id: input.id } : undefined } })
    if (dupe) throw new AppError('DUPLICATE', 'Brand exists', { field: 'name' })
    const brand = input.id
      ? await this.db.brand.update({ where: { id: input.id }, data: { name } })
      : await this.db.brand.create({ data: { name } })
    if (input.id) await this.#reindex({ brandId: brand.id })
    await this.audit.log({ userId: actor.userId, action: input.id ? 'brand.updated' : 'brand.created', entity: 'Brand', entityId: brand.id })
    return { id: brand.id, name: brand.name, modelCount: 0 }
  }

  async deleteBrand(id: string, actor: Actor): Promise<void> {
    const used = await this.db.product.count({ where: { brandId: id, deletedAt: null } })
    if (used > 0) throw new AppError('CONFLICT', 'Brand in use', { count: used })
    await this.db.brand.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.db.deviceModel.updateMany({ where: { brandId: id, deletedAt: null }, data: { deletedAt: new Date() } })
    await this.audit.log({ userId: actor.userId, action: 'brand.deleted', entity: 'Brand', entityId: id })
  }

  async listModels(brandId?: string): Promise<DeviceModelDto[]> {
    const rows = await this.db.deviceModel.findMany({
      where: { deletedAt: null, ...(brandId ? { brandId } : {}) },
      orderBy: { name: 'asc' },
      include: { brand: { select: { name: true } } }
    })
    return rows.map((m) => ({ id: m.id, brandId: m.brandId, brandName: m.brand.name, name: m.name, aliases: m.aliases }))
  }

  async saveModel(input: DeviceModelSaveInput, actor: Actor): Promise<DeviceModelDto> {
    const brand = await this.db.brand.findFirst({ where: { id: input.brandId, deletedAt: null } })
    if (!brand) throw new AppError('NOT_FOUND', 'Brand not found')
    const data = { brandId: input.brandId, name: input.name.trim(), aliases: input.aliases ?? null }
    const dupe = await this.db.deviceModel.findFirst({
      where: { brandId: data.brandId, name: data.name, deletedAt: null, NOT: input.id ? { id: input.id } : undefined }
    })
    if (dupe) throw new AppError('DUPLICATE', 'Model exists', { field: 'name' })
    const m = input.id ? await this.db.deviceModel.update({ where: { id: input.id }, data }) : await this.db.deviceModel.create({ data })
    if (input.id) await this.#reindex({ deviceModelId: m.id })
    await this.audit.log({ userId: actor.userId, action: input.id ? 'model.updated' : 'model.created', entity: 'DeviceModel', entityId: m.id })
    return { id: m.id, brandId: m.brandId, brandName: brand.name, name: m.name, aliases: m.aliases }
  }

  async deleteModel(id: string, actor: Actor): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { deviceModelId: id }, data: { deviceModelId: null } })
      await tx.deviceModel.update({ where: { id }, data: { deletedAt: new Date() } })
      await this.audit.log({ userId: actor.userId, action: 'model.deleted', entity: 'DeviceModel', entityId: id }, tx)
    })
  }

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await this.db.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { deletedAt: null } } } } }
    })
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      parentId: c.parentId,
      color: c.color,
      icon: c.icon,
      sortOrder: c.sortOrder,
      productCount: c._count.products
    }))
  }

  async saveCategory(input: CategorySaveInput, actor: Actor): Promise<CategoryDto> {
    if (input.id && input.parentId === input.id) throw new AppError('VALIDATION', 'Category cannot be its own parent', { reason: 'categoryParent' })
    const data = {
      name: input.name.trim(),
      kind: input.kind ?? 'ACCESSORY',
      parentId: input.parentId ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0
    }
    const c = input.id ? await this.db.category.update({ where: { id: input.id }, data }) : await this.db.category.create({ data })
    if (input.id) await this.#reindex({ categoryId: c.id })
    await this.audit.log({ userId: actor.userId, action: input.id ? 'category.updated' : 'category.created', entity: 'Category', entityId: c.id })
    return { ...data, id: c.id, productCount: 0 }
  }

  async deleteCategory(id: string, actor: Actor): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
      await tx.category.updateMany({ where: { parentId: id }, data: { parentId: null } })
      await tx.category.update({ where: { id }, data: { deletedAt: new Date() } })
      await this.audit.log({ userId: actor.userId, action: 'category.deleted', entity: 'Category', entityId: id }, tx)
    })
  }

  // ───────────── Products ─────────────

  async #searchTextFor(tx: Tx, variantId: string): Promise<string> {
    const v = await tx.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: {
        barcodes: true,
        product: { include: { brand: true, deviceModel: true, category: true } }
      }
    })
    const p = v.product
    return buildSearchText([
      p.name,
      p.altName,
      v.name,
      v.color,
      v.storage,
      v.ram,
      v.size,
      v.material,
      v.sku,
      ...v.barcodes.map((b) => b.code),
      p.brand?.name,
      p.deviceModel?.name,
      p.deviceModel?.aliases,
      p.category?.name
    ])
  }

  async #reindexVariants(tx: Tx, variantIds: string[]): Promise<void> {
    for (const id of variantIds) {
      await tx.productVariant.update({ where: { id }, data: { searchText: await this.#searchTextFor(tx, id), version: undefined } })
    }
  }

  async #reindex(where: { brandId?: string; deviceModelId?: string; categoryId?: string }): Promise<void> {
    const variants = await this.db.productVariant.findMany({ where: { product: where, deletedAt: null }, select: { id: true } })
    await this.db.$transaction(async (tx) => this.#reindexVariants(tx, variants.map((v) => v.id)))
  }

  async #assertBarcodesFree(tx: Tx, codes: string[], exceptVariantId?: string): Promise<void> {
    const seen = new Set<string>()
    for (const c of codes) {
      if (seen.has(c)) throw new AppError('DUPLICATE_BARCODE', 'Duplicate barcode', { code: c })
      seen.add(c)
    }
    if (codes.length === 0) return
    const existing = await tx.barcode.findMany({
      where: { code: { in: codes }, ...(exceptVariantId ? { NOT: { variantId: exceptVariantId } } : {}) },
      include: { variant: { include: { product: { select: { name: true } } } } }
    })
    if (existing[0]) {
      throw new AppError('DUPLICATE_BARCODE', 'Barcode already assigned', { code: existing[0].code, productName: existing[0].variant.product.name })
    }
  }

  #normalizeProduct(input: ProductSaveInput) {
    const type = input.type
    const trackStock = type === 'SERVICE' ? false : (input.trackStock ?? true)
    const trackSerials = trackStock && SERIAL_TYPES.has(type) ? (input.trackSerials ?? false) : false
    return {
      type,
      name: input.name.trim(),
      altName: input.altName ?? null,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      deviceModelId: input.deviceModelId ?? null,
      supplierId: input.supplierId ?? null,
      taxBp: input.taxBp ?? null,
      trackStock,
      trackSerials,
      warrantyDays: input.warrantyDays ?? null,
      isFavorite: input.isFavorite ?? false,
      isActive: input.isActive ?? true,
      notes: input.notes ?? null,
      imagePath: input.imagePath ?? null
    }
  }

  #variantData(v: VariantInput, trackStock: boolean) {
    const defaultMin = this.settings.get('inventory').defaultMinStock
    if (v.minPrice != null && v.minPrice > v.sellPrice) throw new AppError('VALIDATION', 'Minimum price above selling price', { reason: 'minPriceAboveSell', field: 'minPrice' })
    return {
      name: v.name ?? null,
      sku: v.sku ?? null,
      color: v.color ?? null,
      material: v.material ?? null,
      size: v.size ?? null,
      storage: v.storage ?? null,
      ram: v.ram ?? null,
      costPrice: v.costPrice ?? 0,
      sellPrice: v.sellPrice,
      minPrice: v.minPrice ?? null,
      wholesalePrice: v.wholesalePrice ?? null,
      minStock: trackStock ? (v.minStock ?? defaultMin) : 0,
      maxStock: v.maxStock ?? null
    }
  }

  async #createVariant(
    tx: Tx,
    productId: string,
    v: VariantInput,
    product: { trackStock: boolean; trackSerials: boolean },
    isDefault: boolean,
    actor: Actor | null
  ): Promise<string> {
    const barcodes = v.barcodes ?? []
    await this.#assertBarcodesFree(tx, barcodes)
    const created = await tx.productVariant.create({
      data: { ...this.#variantData(v, product.trackStock), productId, isDefault, barcodes: { create: barcodes.map((code) => ({ code })) } }
    })
    const serials = (v.serials ?? []).map((s) => s.trim()).filter(Boolean)
    let opening = v.openingStock ?? 0
    if (product.trackSerials) {
      if (serials.length > 0 && opening > 0 && opening !== serials.length) {
        throw new AppError('VALIDATION', 'Opening quantity must match the number of IMEI/serials', { reason: 'serialsCount', field: 'serials' })
      }
      opening = serials.length || opening
      if (opening > 0 && serials.length === 0) throw new AppError('VALIDATION', 'Enter the IMEI/serial for each unit', { reason: 'serialsMissing', field: 'serials' })
      for (const serial of serials) {
        await tx.serialItem.create({ data: { variantId: created.id, serial, costPrice: v.costPrice ?? 0 } })
      }
    }
    if (product.trackStock && opening > 0) {
      await applyStockChange(tx, {
        variantId: created.id,
        type: 'OPENING',
        qty: opening,
        unitCost: v.costPrice ?? 0,
        refType: 'Product',
        refId: productId,
        reason: 'Opening stock',
        userId: actor?.userId ?? null
      })
    }
    return created.id
  }

  async createProduct(input: ProductSaveInput, actor: Actor | null): Promise<ProductDto> {
    const data = this.#normalizeProduct(input)
    const productId = await this.db.$transaction(async (tx) => {
      const product = await tx.product.create({ data })
      const ids: string[] = []
      const active = input.variants.filter((v) => !v.remove)
      if (active.length === 0) throw new AppError('VALIDATION', 'At least one variant is required', { reason: 'variantRequired' })
      for (const [i, v] of active.entries()) {
        ids.push(await this.#createVariant(tx, product.id, v, data, i === 0, actor))
      }
      await this.#reindexVariants(tx, ids)
      await this.audit.log(
        { userId: actor?.userId ?? null, action: 'product.created', entity: 'Product', entityId: product.id, metadata: { name: data.name } },
        tx
      )
      return product.id
    })
    return this.getProduct(productId, true)
  }

  async updateProduct(input: ProductSaveInput & { id: string }, actor: Actor): Promise<ProductDto> {
    const data = this.#normalizeProduct(input)
    await this.db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id: input.id }, include: { variants: { where: { deletedAt: null }, include: { barcodes: true } } } })
      if (!existing || existing.deletedAt) throw new AppError('NOT_FOUND', 'Product not found')
      // Switching IMEI tracking off with phones in stock is fine: they sell by quantity from now on
      // (registered IMEIs stay on record and count again if tracking is switched back on).
      await tx.product.update({ where: { id: input.id }, data })
      const touched: string[] = []
      for (const v of input.variants) {
        if (!v.id) {
          if (v.remove) continue
          touched.push(await this.#createVariant(tx, input.id, v, data, false, actor))
          continue
        }
        const current = existing.variants.find((x) => x.id === v.id)
        if (!current) throw new AppError('NOT_FOUND', 'Variant not found', { variantId: v.id })
        if (v.remove) {
          if (current.stockQty !== 0) throw new AppError('INVALID_STATE', 'Variant still has stock', { reason: 'variantHasStock', variantId: v.id, stock: current.stockQty })
          await tx.productVariant.update({ where: { id: v.id }, data: { deletedAt: new Date(), isDefault: false } })
          await tx.barcode.deleteMany({ where: { variantId: v.id } })
          continue
        }
        const vd = this.#variantData(v, data.trackStock)
        const changes: Record<string, { from: unknown; to: unknown }> = {}
        for (const k of ['sellPrice', 'costPrice', 'minPrice', 'wholesalePrice'] as const) {
          if (current[k] !== vd[k]) changes[k] = { from: current[k], to: vd[k] }
        }
        // Cost of stocked items is maintained by purchases (weighted average);
        // manual edits are allowed but audited.
        await tx.productVariant.update({ where: { id: v.id }, data: vd })
        const codes = v.barcodes ?? []
        await this.#assertBarcodesFree(tx, codes, v.id)
        const currentCodes = current.barcodes.map((b) => b.code)
        const toRemove = currentCodes.filter((c) => !codes.includes(c))
        const toAdd = codes.filter((c) => !currentCodes.includes(c))
        if (toRemove.length) await tx.barcode.deleteMany({ where: { variantId: v.id, code: { in: toRemove } } })
        for (const code of toAdd) await tx.barcode.create({ data: { code, variantId: v.id } })
        if (Object.keys(changes).length > 0) {
          await this.audit.log(
            { userId: actor.userId, action: 'product.price_changed', entity: 'ProductVariant', entityId: v.id, metadata: { product: data.name, changes } },
            tx
          )
        }
        touched.push(v.id)
      }
      const remaining = await tx.productVariant.findMany({ where: { productId: input.id, deletedAt: null }, orderBy: { createdAt: 'asc' } })
      if (remaining.length === 0) throw new AppError('VALIDATION', 'At least one variant is required', { reason: 'variantRequired' })
      if (!remaining.some((r) => r.isDefault)) await tx.productVariant.update({ where: { id: remaining[0]!.id }, data: { isDefault: true } })
      await this.#reindexVariants(tx, remaining.map((r) => r.id))
      await this.audit.log({ userId: actor.userId, action: 'product.updated', entity: 'Product', entityId: input.id, metadata: { name: data.name } }, tx)
    })
    return this.getProduct(input.id, actor.permissions.has('view_cost'))
  }

  async deleteProduct(id: string, actor: Actor): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id }, include: { variants: { where: { deletedAt: null } } } })
      if (!p || p.deletedAt) throw new AppError('NOT_FOUND')
      const stocked = p.variants.filter((v) => p.trackStock && v.stockQty > 0)
      if (stocked.length > 0) throw new AppError('INVALID_STATE', 'Product still has stock', { reason: 'productHasStock', stock: stocked.reduce((a, v) => a + v.stockQty, 0) })
      const now = new Date()
      await tx.product.update({ where: { id }, data: { deletedAt: now, isActive: false } })
      await tx.productVariant.updateMany({ where: { productId: id, deletedAt: null }, data: { deletedAt: now } })
      // Free barcodes so they can be reused; history keeps sale snapshots.
      await tx.barcode.deleteMany({ where: { variant: { productId: id } } })
      await this.audit.log({ userId: actor.userId, action: 'product.deleted', entity: 'Product', entityId: id, metadata: { name: p.name } }, tx)
    })
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    await this.db.product.update({ where: { id }, data: { isFavorite } })
  }

  async getProduct(id: string, canViewCost: boolean): Promise<ProductDto> {
    const p = await this.db.product.findUnique({
      where: { id },
      include: {
        variants: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { barcodes: { orderBy: { createdAt: 'asc' } }, _count: { select: { serials: { where: { status: 'IN_STOCK' } } } } }
        }
      }
    })
    if (!p || p.deletedAt) throw new AppError('NOT_FOUND', 'Product not found')
    return {
      id: p.id,
      type: p.type as ProductDto['type'],
      name: p.name,
      altName: p.altName,
      categoryId: p.categoryId,
      brandId: p.brandId,
      deviceModelId: p.deviceModelId,
      supplierId: p.supplierId,
      taxBp: p.taxBp,
      trackStock: p.trackStock,
      trackSerials: p.trackSerials,
      warrantyDays: p.warrantyDays,
      isFavorite: p.isFavorite,
      isActive: p.isActive,
      notes: p.notes,
      imagePath: p.imagePath,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        isDefault: v.isDefault,
        sku: v.sku,
        color: v.color,
        material: v.material,
        size: v.size,
        storage: v.storage,
        ram: v.ram,
        costPrice: canViewCost ? v.costPrice : null,
        sellPrice: v.sellPrice,
        minPrice: v.minPrice,
        wholesalePrice: v.wholesalePrice,
        stockQty: v.stockQty,
        minStock: v.minStock,
        maxStock: v.maxStock,
        barcodes: v.barcodes.map((b) => b.code),
        serialsInStock: v._count.serials
      }))
    }
  }

  /** Inventory list with filters (paged, server-side). */
  async listVariants(input: ProductQueryInput, canViewCost: boolean): Promise<Paged<VariantListItem>> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const where: string[] = ['v.deletedAt IS NULL', 'p.deletedAt IS NULL']
    const params: unknown[] = []
    if (!input.includeInactive) where.push('p.isActive = 1')
    for (const t of searchTokens(input.q ?? '')) {
      where.push(`v.searchText LIKE ? ESCAPE '\\'`)
      params.push(`%${likeEscape(t)}%`)
    }
    if (input.categoryId) {
      where.push('(p.categoryId = ? OR c.parentId = ?)')
      params.push(input.categoryId, input.categoryId)
    }
    if (input.brandId) {
      where.push('p.brandId = ?')
      params.push(input.brandId)
    }
    if (input.deviceModelId) {
      where.push('p.deviceModelId = ?')
      params.push(input.deviceModelId)
    }
    if (input.type) {
      where.push('p.type = ?')
      params.push(input.type)
    }
    if (input.favorites) where.push('p.isFavorite = 1')
    switch (input.stock) {
      case 'low':
        where.push('p.trackStock = 1 AND v.stockQty > 0 AND v.stockQty <= v.minStock')
        break
      case 'out':
        where.push('p.trackStock = 1 AND v.stockQty <= 0')
        break
      case 'over':
        where.push('p.trackStock = 1 AND v.maxStock IS NOT NULL AND v.stockQty > v.maxStock')
        break
      case 'dead': {
        where.push('p.trackStock = 1 AND v.stockQty > 0 AND COALESCE(v.lastSoldAt, v.createdAt) < ?')
        const days = this.settings.get('inventory').deadStockDays
        params.push(new Date(Date.now() - days * 86_400_000).toISOString())
        break
      }
      default:
        break
    }
    const order =
      input.sort === 'stock'
        ? 'v.stockQty ASC, p.name ASC'
        : input.sort === 'price'
          ? 'v.sellPrice DESC'
          : input.sort === 'recent'
            ? 'v.createdAt DESC'
            : 'p.name COLLATE NOCASE ASC, v.name ASC'
    const whereSql = where.join(' AND ')
    const [countRow] = await rawQuery<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM ProductVariant v JOIN Product p ON p.id = v.productId LEFT JOIN Category c ON c.id = p.categoryId WHERE ${whereSql}`,
      ...params
    )
    const rows = await rawQuery<VariantRow>(
      this.db,
      `${VARIANT_SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize
    )
    return { items: rows.map((r) => toListItem(r, canViewCost)), total: countRow?.n ?? 0, page, pageSize }
  }

  /**
   * POS search — optimized for "type a few letters / scan" with ranking:
   * exact barcode/SKU → token-prefix matches → favorites → recently sold.
   */
  async posSearch(input: PosSearchInput, canViewCost: boolean): Promise<VariantListItem[]> {
    const limit = input.limit ?? 40
    const base = 'v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.isActive = 1'
    if (input.mode === 'favorites') {
      const rows = await rawQuery<VariantRow>(this.db, `${VARIANT_SELECT} WHERE ${base} AND p.isFavorite = 1 ORDER BY p.name LIMIT ?`, limit)
      return rows.map((r) => toListItem(r, canViewCost))
    }
    if (input.mode === 'recent') {
      const rows = await rawQuery<VariantRow>(
        this.db,
        `${VARIANT_SELECT} WHERE ${base} AND v.lastSoldAt IS NOT NULL ORDER BY v.lastSoldAt DESC LIMIT ?`,
        limit
      )
      return rows.map((r) => toListItem(r, canViewCost))
    }
    if (input.mode === 'category' && input.categoryId) {
      const rows = await rawQuery<VariantRow>(
        this.db,
        `${VARIANT_SELECT} WHERE ${base} AND (p.categoryId = ? OR c.parentId = ?) ORDER BY p.isFavorite DESC, v.lastSoldAt DESC, p.name LIMIT ?`,
        input.categoryId,
        input.categoryId,
        limit
      )
      return rows.map((r) => toListItem(r, canViewCost))
    }
    const q = (input.q ?? '').trim()
    if (!q) return []
    const exact = await this.findByCode(q, canViewCost)
    const tokens = searchTokens(q)
    if (tokens.length === 0) return exact ? [exact] : []
    const where = tokens.map(() => `v.searchText LIKE ? ESCAPE '\\'`).join(' AND ')
    const params = tokens.map((t) => `%${likeEscape(t)}%`)
    const first = likeEscape(tokens[0]!)
    const rows = await rawQuery<VariantRow>(
      this.db,
      `${VARIANT_SELECT} WHERE ${base} AND ${where}
       ORDER BY (CASE WHEN v.searchText LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END), p.isFavorite DESC,
                (CASE WHEN v.stockQty > 0 OR p.trackStock = 0 THEN 0 ELSE 1 END), v.lastSoldAt DESC, p.name
       LIMIT ?`,
      ...params,
      `% ${first}%`,
      limit
    )
    const items = rows.map((r) => toListItem(r, canViewCost))
    if (exact) return [exact, ...items.filter((i) => i.variantId !== exact.variantId)]
    return items
  }

  /** Barcode, SKU or IMEI lookup — used by scanners. */
  async findByCode(code: string, canViewCost: boolean): Promise<VariantListItem | null> {
    const c = code.trim()
    if (!c) return null
    const rows = await rawQuery<VariantRow>(
      this.db,
      `${VARIANT_SELECT}
       WHERE v.deletedAt IS NULL AND p.deletedAt IS NULL AND p.isActive = 1
         AND (v.id IN (SELECT variantId FROM Barcode WHERE code = ?) OR v.sku = ?
              OR v.id IN (SELECT variantId FROM SerialItem WHERE serial = ? AND status = 'IN_STOCK'))
       LIMIT 1`,
      c,
      c,
      c
    )
    return rows[0] ? toListItem(rows[0], canViewCost) : null
  }

  async getVariantItem(variantId: string, canViewCost: boolean): Promise<VariantListItem> {
    const rows = await rawQuery<VariantRow>(this.db, `${VARIANT_SELECT} WHERE v.id = ?`, variantId)
    if (!rows[0]) throw new AppError('NOT_FOUND', 'Product not found')
    return toListItem(rows[0], canViewCost)
  }

  async serialsInStock(variantId: string, canViewCost: boolean): Promise<SerialDto[]> {
    const rows = await this.db.serialItem.findMany({ where: { variantId, status: 'IN_STOCK' }, orderBy: { createdAt: 'asc' } })
    return rows.map((s) => ({ id: s.id, serial: s.serial, status: s.status, costPrice: canViewCost ? s.costPrice : null }))
  }

  /** Generates an unused internal EAN-13 barcode (prefix from settings). */
  async generateBarcode(): Promise<string> {
    const prefix = this.settings.get('inventory').internalBarcodePrefix
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = await this.db.$transaction(async (tx) => {
        const n = await nextNumber(tx, 'barcode', '', 12 - prefix.length)
        const body = `${prefix}${n}`.slice(0, 12).padEnd(12, '0')
        return body + ean13CheckDigit(body)
      })
      const used = await this.db.barcode.findUnique({ where: { code } })
      if (!used) return code
    }
    throw new AppError('CONFLICT', 'Could not generate a unique barcode')
  }
}
