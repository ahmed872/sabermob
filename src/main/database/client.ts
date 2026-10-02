import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './generated/client'

/** Models that carry a `version` column (optimistic concurrency / sync). */
const VERSIONED = new Set([
  'Role', 'User', 'Customer', 'Brand', 'DeviceModel', 'Category', 'Product', 'ProductVariant', 'SerialItem',
  'Supplier', 'PurchaseOrder', 'Sale', 'Quotation', 'Repair', 'Offer'
])

/** Models that carry a `deviceId` column (origin installation, for sync). */
const DEVICE_STAMPED = new Set([
  ...VERSIONED, 'Session', 'AuditLog', 'CustomerLedger', 'StockMovement', 'StockAdjustment', 'SupplierLedger',
  'SupplierPayment', 'Shift', 'Payment', 'Refund'
])

function stampCreate(model: string, data: unknown, deviceId: string): void {
  if (!DEVICE_STAMPED.has(model) || !data || typeof data !== 'object') return
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) if (row && typeof row === 'object' && !('deviceId' in row)) (row as Record<string, unknown>).deviceId = deviceId
}

function bumpVersion(model: string, data: unknown): void {
  if (!VERSIONED.has(model) || !data || typeof data !== 'object') return
  const d = data as Record<string, unknown>
  if (!('version' in d)) d.version = { increment: 1 }
}

export function createPrisma(dbPath: string, deviceId: string) {
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}`, timeout: 5000 })
  const base = new PrismaClient({ adapter })
  return base.$extends({
    name: 'sync-metadata',
    query: {
      $allModels: {
        create({ model, args, query }) {
          stampCreate(model, args.data, deviceId)
          return query(args)
        },
        createMany({ model, args, query }) {
          stampCreate(model, args.data, deviceId)
          return query(args)
        },
        update({ model, args, query }) {
          bumpVersion(model, args.data)
          return query(args)
        },
        updateMany({ model, args, query }) {
          bumpVersion(model, args.data)
          return query(args)
        },
        upsert({ model, args, query }) {
          stampCreate(model, args.create, deviceId)
          bumpVersion(model, args.update)
          return query(args)
        }
      }
    }
  })
}

export type Db = ReturnType<typeof createPrisma>
/** Client usable both at top level and inside an interactive transaction. */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/** Applies per-connection pragmas. Must run before any other query. */
export async function configureConnection(db: Db): Promise<void> {
  await db.$queryRawUnsafe('PRAGMA journal_mode = WAL')
  await db.$queryRawUnsafe('PRAGMA synchronous = NORMAL')
  await db.$queryRawUnsafe('PRAGMA foreign_keys = ON')
  await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
  await db.$queryRawUnsafe('PRAGMA temp_store = MEMORY')
}

/** Converts BigInt values returned by raw queries into numbers. */
export function normalizeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v
  return out as T
}

export async function rawQuery<T>(db: Tx, sql: string, ...params: unknown[]): Promise<T[]> {
  const rows = (await db.$queryRawUnsafe(sql, ...params)) as Record<string, unknown>[]
  return rows.map((r) => normalizeRow<T>(r))
}
