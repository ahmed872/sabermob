import type { Logger } from 'winston'
import { AppError } from '@shared/errors'

interface DbErrorLike {
  code?: string
  message?: string
  meta?: { target?: unknown; modelName?: string; driverAdapterError?: { cause?: { kind?: string; constraint?: { fields?: string[] } } } }
}

function uniqueFields(err: DbErrorLike): string[] {
  const t = err.meta?.target
  if (Array.isArray(t)) return t.map(String)
  if (typeof t === 'string') return [t]
  const fields = err.meta?.driverAdapterError?.cause?.constraint?.fields
  if (Array.isArray(fields)) return fields
  const m = /UNIQUE constraint failed: ([\w.,\s]+)/.exec(err.message ?? '')
  return m ? m[1]!.split(',').map((s) => s.trim().split('.').pop()!) : []
}

/**
 * Converts any thrown value into an AppError with a stable code.
 * Raw driver/ORM messages are logged but never sent to the renderer.
 */
export function toAppError(err: unknown, log: Logger, context?: string): AppError {
  if (err instanceof AppError) {
    if (err.code === 'INTERNAL') log.error('Internal error', { context, message: err.message, stack: err.stack })
    return err
  }
  const e = (err ?? {}) as DbErrorLike & Error
  const msg = e.message ?? String(err)
  if (e.code === 'P2002' || /UNIQUE constraint failed/.test(msg)) {
    const fields = uniqueFields(e)
    const model = e.meta?.modelName
    if (fields.includes('code') || model === 'Barcode') return new AppError('DUPLICATE_BARCODE', 'Duplicate barcode', { fields })
    if (fields.includes('sku')) return new AppError('DUPLICATE_SKU', 'Duplicate SKU', { fields })
    if (fields.includes('username')) return new AppError('DUPLICATE_USERNAME', 'Duplicate username', { fields })
    if (fields.includes('serial')) return new AppError('DUPLICATE_SERIAL', 'Duplicate serial', { fields })
    return new AppError('DUPLICATE', 'Duplicate value', { fields })
  }
  if (e.code === 'P2025') return new AppError('NOT_FOUND')
  if (e.code === 'P2003' || /FOREIGN KEY constraint failed/.test(msg)) {
    return new AppError('CONFLICT', 'Referenced record missing or in use')
  }
  if (/SQLITE_BUSY|database is locked/i.test(msg) || e.code === 'P1008' || e.code === 'P2034') {
    log.warn('Database busy', { context })
    return new AppError('DATABASE_BUSY')
  }
  if (/SQLITE_FULL|database or disk is full|ENOSPC/i.test(msg) || e.code === 'ENOSPC') {
    log.error('Disk full', { context })
    return new AppError('DISK_FULL')
  }
  if (e.name === 'ZodError') return new AppError('VALIDATION')
  log.error('Unhandled error', { context, message: msg, code: e.code, stack: e.stack })
  return new AppError('INTERNAL', 'Unexpected error')
}
