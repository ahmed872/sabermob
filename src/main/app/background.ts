import type { ApiEventName, ApiEvents } from '@shared/ipc/contract'
import type { AppContext } from './context'

type Emit = <E extends ApiEventName>(event: E, payload: ApiEvents[E]) => void

const timers: NodeJS.Timeout[] = []
/** `gated: false` jobs take the database gate themselves (long-running work). */
export type BackgroundJob = { name: string; everyMs: number; gated?: boolean; run: (ctx: AppContext, emit: Emit) => Promise<void> }

/** Jobs registered by modules (auto-backup, affinity refresh, ...). */
export const backgroundJobs: BackgroundJob[] = [
  {
    name: 'idle-lock',
    everyMs: 15_000,
    run: async (ctx) => {
      ctx.auth.checkIdle()
    }
  },
  {
    name: 'license-heartbeat',
    everyMs: 30 * 60_000,
    run: async (ctx, emit) => {
      const before = ctx.license.state().operational
      await ctx.license.heartbeat()
      const state = ctx.license.state()
      if (state.operational !== before) emit('license:changed', state)
    }
  },
  {
    name: 'auto-backup',
    everyMs: 10 * 60_000,
    gated: false,
    run: async (ctx) => {
      await ctx.backup.runAutoIfDue()
    }
  }
]

export function startBackgroundJobs(ctx: AppContext, emit: Emit): void {
  for (const job of backgroundJobs) {
    let running = false
    const tick = async () => {
      if (running) return
      running = true
      try {
        await (job.gated === false ? job.run(ctx, emit) : ctx.gate.run(() => job.run(ctx, emit)))
      } catch (err) {
        ctx.log.app.error('Background job failed', { job: job.name, message: String(err) })
      } finally {
        running = false
      }
    }
    timers.push(setInterval(() => void tick(), job.everyMs))
  }
}

export function stopBackgroundJobs(): void {
  for (const t of timers.splice(0)) clearInterval(t)
}
