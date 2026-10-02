import type { ReactNode } from 'react'
import { DropdownMenu as DM } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface MenuItem {
  label: ReactNode
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
}

export function Dropdown({ trigger, items, align = 'end' }: { trigger: ReactNode; items: Array<MenuItem | 'separator'>; align?: 'start' | 'end' }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={6} className="z-50 min-w-48 rounded-xl border border-line bg-raised p-1 shadow-[var(--shadow-pop)] data-[state=open]:animate-in">
          {items.map((item, i) =>
            item === 'separator' ? (
              <DM.Separator key={`s${i}`} className="my-1 h-px bg-line" />
            ) : item.hidden ? null : (
              <DM.Item
                key={i}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-sunken',
                  item.danger && 'text-danger'
                )}
              >
                {item.icon ? <item.icon className="size-4 opacity-80" /> : null}
                {item.label}
              </DM.Item>
            )
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
