import type { ReactNode } from 'react'
import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[min(1400px,96vw)]' }

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  hideClose,
  dismissable = true
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizes
  className?: string
  hideClose?: boolean
  dismissable?: boolean
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content
          onPointerDownOutside={(e) => !dismissable && e.preventDefault()}
          onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-raised shadow-[var(--shadow-pop)] outline-none data-[state=open]:animate-in',
            sizes[size],
            className
          )}
        >
          {title ? (
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <D.Title className="text-base font-bold">{title}</D.Title>
                {description ? <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description> : null}
              </div>
              {!hideClose ? (
                <D.Close className="-m-1 rounded-lg p-1.5 text-subtle hover:bg-sunken hover:text-fg">
                  <X className="size-5" />
                </D.Close>
              ) : null}
            </div>
          ) : (
            <D.Title className="sr-only">dialog</D.Title>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-surface/60 px-5 py-3 rounded-b-2xl">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
