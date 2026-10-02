import { cn } from '../../lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80', className)} aria-hidden />
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted">
      <Spinner className="size-7" />
    </div>
  )
}
