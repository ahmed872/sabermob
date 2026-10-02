import type { AppErrorShape, ErrorCode, Result } from '@shared/errors'
import type { ApiInput, ApiMethod, ApiOutput } from '@shared/ipc/contract'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>
  constructor(shape: AppErrorShape) {
    super(shape.message)
    this.code = shape.code
    this.details = shape.details
  }
}

type OverrideHandler = (permissions: string[], details?: Record<string, unknown>) => Promise<string | null>
let overrideHandler: OverrideHandler | null = null

/** Registered by <OverrideProvider/>: asks a manager to approve an action. */
export function setOverrideHandler(h: OverrideHandler | null): void {
  overrideHandler = h
}

export async function call<K extends ApiMethod>(method: K, input?: ApiInput<K>): Promise<ApiOutput<K>> {
  const res = (await window.central.invoke(method, input)) as Result<ApiOutput<K>>
  if (res && res.ok) return res.data
  throw new ApiError(res?.error ?? { code: 'INTERNAL', message: 'No response' })
}

/**
 * Calls a method that may need manager approval. On OVERRIDE_REQUIRED the
 * approval dialog is shown and the call retried once with the token.
 */
export async function callWithOverride<K extends ApiMethod>(method: K, input: ApiInput<K>): Promise<ApiOutput<K>> {
  try {
    return await call(method, input)
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'OVERRIDE_REQUIRED' || !overrideHandler) throw err
    const list = Array.isArray(err.details?.permissions) ? (err.details.permissions as string[]) : [String(err.details?.permission ?? '')]
    const token = await overrideHandler(list, err.details)
    if (!token) throw err
    return call(method, { ...(input as object), overrideToken: token } as ApiInput<K>)
  }
}

export function onEvent<T = unknown>(event: string, listener: (payload: T) => void): () => void {
  return window.central.on(event, listener as (p: unknown) => void)
}
