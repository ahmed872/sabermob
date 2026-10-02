import type { ReactNode } from 'react'
import { Switch as RSwitch, Tabs as RTabs, Tooltip as RTooltip, Checkbox as RCheckbox } from 'radix-ui'
import { Check, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

const badgeTones = {
  neutral: 'bg-sunken text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info'
}
export type Tone = keyof typeof badgeTones

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]', padded && 'p-4', className)}>{children}</div>
}

export function CardHeader({ title, action, icon: Icon, subtitle }: { title: ReactNode; action?: ReactNode; icon?: LucideIcon; subtitle?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="size-[18px] text-muted" /> : null}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-sunken px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">{children}</kbd>
}

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? (
        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-sunken text-subtle">
          <Icon className="size-7" />
        </div>
      ) : null}
      <p className="text-[15px] font-bold">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Switch({ checked, onCheckedChange, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-line-strong transition-colors data-[state=checked]:bg-primary disabled:opacity-50"
    >
      <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[22px]" />
    </RSwitch.Root>
  )
}

export function SwitchRow({ label, hint, checked, onCheckedChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-1 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  )
}

export function Checkbox({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <RCheckbox.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex size-5 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <RCheckbox.Indicator>
          <Check className="size-3.5 text-primary-fg" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  )
}

export function Tabs({ value, onValueChange, items, className }: { value: string; onValueChange: (v: string) => void; items: Array<{ value: string; label: ReactNode; count?: number }>; className?: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List className="inline-flex gap-1 rounded-xl bg-sunken p-1">
        {items.map((i) => (
          <RTabs.Trigger
            key={i.value}
            value={i.value}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted transition data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm"
          >
            {i.label}
            {i.count !== undefined ? <span className="rounded-full bg-line px-1.5 text-[11px] tabular">{i.count}</span> : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
    </RTabs.Root>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; icon?: LucideIcon }>; className?: string; size?: 'md' | 'lg' }) {
  return (
    <div className={cn('inline-flex gap-1 rounded-xl bg-sunken p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 font-semibold transition',
            size === 'lg' ? 'h-11 text-sm' : 'h-8 text-[13px]',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
          )}
        >
          {o.icon ? <o.icon className="size-4" /> : null}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={300}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content sideOffset={6} className="z-[60] rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
            {content}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  )
}

export function Stat({ label, value, icon: Icon, tone = 'primary', hint, onClick }: { label: ReactNode; value: ReactNode; icon?: LucideIcon; tone?: Tone; hint?: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'group flex min-w-0 items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-start shadow-[var(--shadow-card)]',
        onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:border-line-strong'
      )}
    >
      {Icon ? (
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', badgeTones[tone])}>
          <Icon className="size-5" />
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-muted">{label}</p>
        <p className="mt-0.5 truncate text-xl font-extrabold tabular">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted">{hint}</p> : null}
      </div>
    </Comp>
  )
}

export function PageHeader({ title, subtitle, actions, icon: Icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{title}</h1>
          {subtitle ? <p className="truncate text-[13px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-sunken', className)} />
}
