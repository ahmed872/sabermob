import type { z } from 'zod'
import { AppError, type AppErrorShape, type Result } from '@shared/errors'
import type { ApiContract, ApiMethod } from '@shared/ipc/contract'
import type { PermissionKey } from '@shared/permissions'
import type { AppContext } from '../app/context'
import type { Actor } from '../services/auth-service'
import { toAppError } from '../core/error-mapper'

export interface HandlerOptions<I extends z.ZodType> {
  input: I
  /** permission required; null = any logged-in user */
  permission?: PermissionKey | PermissionKey[] | null
  /** callable without a session (login, onboarding, bootstrap) */
  public?: boolean
  /** allowed while the session is locked */
  allowLocked?: boolean
  /** allowed when the license/trial has expired (activation, backup) */
  allowUnlicensed?: boolean
  /** run without the database gate (no DB access / long-running file IO) */
  skipGate?: boolean
}

export interface HandlerCtx {
  app: AppContext
  /** null only for public handlers */
  actor: Actor | null
}

type Handler<K extends ApiMethod, I extends z.ZodType> = (
  input: z.output<I>,
  ctx: HandlerCtx
) => Promise<ApiContract[K]['out']> | ApiContract[K]['out']

interface Registered {
  opts: HandlerOptions<z.ZodType>
  fn: (input: unknown, ctx: HandlerCtx) => Promise<unknown> | unknown
}

export class ApiRouter {
  readonly #handlers = new Map<string, Registered>()

  constructor(private readonly app: AppContext) {}

  handle<K extends ApiMethod, I extends z.ZodType<unknown, ApiContract[K]['in']>>(
    method: K,
    opts: HandlerOptions<I>,
    fn: Handler<K, I>
  ): void {
    if (this.#handlers.has(method)) throw new Error(`Duplicate IPC handler: ${method}`)
    this.#handlers.set(method, { opts: opts as HandlerOptions<z.ZodType>, fn: fn as Registered['fn'] })
  }

  has(method: string): boolean {
    return this.#handlers.has(method)
  }

  methods(): string[] {
    return [...this.#handlers.keys()]
  }

  /** Entry point for every renderer request. Never throws. */
  async dispatch(method: string, rawInput: unknown): Promise<Result<unknown>> {
    const started = performance.now()
    try {
      const reg = this.#handlers.get(method)
      if (!reg) throw new AppError('NOT_FOUND', `Unknown method ${method}`)
      const { opts } = reg

      const run = async (): Promise<unknown> => {
        let actor: Actor | null = null
        if (!opts.public) {
          actor = this.app.auth.currentActor()
          if (!actor) throw new AppError('UNAUTHENTICATED')
          if (this.app.auth.isLocked() && !opts.allowLocked) throw new AppError('SESSION_LOCKED')
          const perms = opts.permission == null ? [] : Array.isArray(opts.permission) ? opts.permission : [opts.permission]
          if (perms.length > 0 && !perms.some((p) => actor!.permissions.has(p))) {
            this.app.log.security.warn('Permission denied', { method, userId: actor.userId, required: perms })
            throw new AppError('FORBIDDEN', 'Permission denied', { permission: perms[0] })
          }
          this.app.auth.touch()
        }
        if (!opts.allowUnlicensed && !opts.public && !this.app.license.isOperational()) {
          throw new AppError('LICENSE_REQUIRED')
        }
        const parsed = opts.input.safeParse(rawInput ?? {})
        if (!parsed.success) {
          throw new AppError('VALIDATION', 'Invalid input', {
            issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message }))
          })
        }
        return reg.fn(parsed.data, { app: this.app, actor })
      }

      const data = opts.skipGate ? await run() : await this.app.gate.run(run)
      const ms = performance.now() - started
      if (ms > 250) this.app.log.app.warn('Slow IPC call', { method, ms: Math.round(ms) })
      return { ok: true, data }
    } catch (err) {
      const appErr = toAppError(err, this.app.log.app, method)
      return { ok: false, error: appErr.toJSON() as AppErrorShape }
    }
  }
}
