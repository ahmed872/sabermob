/**
 * Error codes shared by main and renderer. The renderer translates
 * `errors.<code>` keys; raw database/driver messages never reach the UI.
 */
export const ERROR_CODES = [
  'VALIDATION',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'SESSION_LOCKED',
  'FORBIDDEN',
  'OVERRIDE_REQUIRED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'CONFLICT',
  'DUPLICATE',
  'DUPLICATE_BARCODE',
  'DUPLICATE_SKU',
  'DUPLICATE_USERNAME',
  'DUPLICATE_SERIAL',
  'INSUFFICIENT_STOCK',
  'BELOW_MIN_PRICE',
  'DISCOUNT_LIMIT',
  'SHIFT_REQUIRED',
  'SHIFT_ALREADY_OPEN',
  'INVALID_STATE',
  'PAYMENT_MISMATCH',
  'CREDIT_REQUIRES_CUSTOMER',
  'CREDIT_LIMIT',
  'LICENSE_REQUIRED',
  'LICENSE_INVALID',
  'DATABASE_BUSY',
  'DISK_FULL',
  'BACKUP_INVALID',
  'BACKUP_PASSWORD',
  'PRINTER_UNAVAILABLE',
  'QR_INVALID',
  'QR_DISABLED',
  'FILE_ERROR',
  'IMPORT_INVALID',
  'INTERNAL'
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface AppErrorShape {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>
  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
  toJSON(): AppErrorShape {
    return { code: this.code, message: this.message, details: this.details }
  }
}

export function isAppErrorShape(v: unknown): v is AppErrorShape {
  return typeof v === 'object' && v !== null && 'code' in v && typeof (v as { code: unknown }).code === 'string'
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorShape }
