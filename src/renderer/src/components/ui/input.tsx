import { createContext, forwardRef, useContext, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { parseMoney, toDecimalString } from '@shared/money'
import { cn } from '../../lib/utils'
import { useApp } from '../../stores/app'

export const inputClass =
  'h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/15 disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger/15'

/** Links a <Field> label to the input rendered inside it (accessibility). */
const FieldIdContext = createContext<string | undefined>(undefined)
function useFieldId(id?: string): string | undefined {
  const fromField = useContext(FieldIdContext)
  return id ?? fromField
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, id, ...props }, ref) => (
  <input ref={ref} id={useFieldId(id)} className={cn(inputClass, className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, id, ...props }, ref) => (
  <textarea ref={ref} id={useFieldId(id)} className={cn(inputClass, 'h-auto min-h-20 py-2 leading-relaxed', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export function Label({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-[13px] font-semibold text-fg', className)}>
      {children}
    </label>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
  optional?: boolean
}) {
  const id = useId()
  const optionalText = useOptionalText()
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {optional ? <span className="ms-1 font-normal text-subtle">({optionalText})</span> : null}
        </Label>
      ) : null}
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
      {error ? <p className="mt-1 text-xs font-medium text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

function useOptionalText(): string {
  const lang = useApp((s) => s.settings?.general.language)
  return lang === 'en' ? 'optional' : 'اختياري'
}

export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { onClear?: () => void; size?: 'md' | 'lg' }
>(({ className, onClear, value, size = 'md', ...props }, ref) => (
  <div className="relative">
    <Search className={cn('pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-subtle', size === 'lg' ? 'size-5' : 'size-4')} />
    <input
      ref={ref}
      value={value}
      className={cn(inputClass, 'ps-9', size === 'lg' && 'h-12 rounded-2xl ps-11 text-base', onClear && value ? 'pe-9' : '', className)}
      {...props}
    />
    {onClear && value ? (
      <button type="button" onClick={onClear} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-subtle hover:bg-sunken hover:text-fg" tabIndex={-1}>
        <X className="size-4" />
      </button>
    ) : null}
  </div>
))
SearchInput.displayName = 'SearchInput'

/**
 * Money input: user types major units ("12.5"), value is minor units (1250).
 * Never uses floating point for the stored value.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  allowEmpty,
  autoFocus,
  placeholder,
  disabled,
  onEnter,
  invalid,
  id
}: {
  value: number | null
  onChange: (v: number | null) => void
  className?: string
  allowEmpty?: boolean
  autoFocus?: boolean
  placeholder?: string
  disabled?: boolean
  onEnter?: () => void
  invalid?: boolean
  id?: string
}) {
  const fieldId = useFieldId(id)
  const decimals = useApp((s) => s.settings?.company.currencyDecimals ?? 2)
  const currency = useApp((s) => s.settings?.company.currency ?? 'EGP')
  const toText = (v: number | null) => (v === null ? '' : toDecimalString(v, decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'))
  const [text, setText] = useState(toText(value))
  useEffect(() => {
    const parsed = parseMoney(text, decimals)
    if (parsed !== value) setText(toText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals])
  return (
    <div className="relative">
      <input
        id={fieldId}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? '0'}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, 'tabular pe-12', className)}
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter()
        }}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          if (t.trim() === '') onChange(allowEmpty ? null : 0)
          else {
            const p = parseMoney(t, decimals)
            if (p !== null && p >= 0) onChange(p)
          }
        }}
      />
      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-subtle">{currency}</span>
    </div>
  )
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  className,
  allowEmpty,
  id,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  className?: string
  allowEmpty?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'>) {
  return (
    <input
      id={useFieldId(id)}
      type="text"
      inputMode="numeric"
      className={cn(inputClass, 'tabular', className)}
      value={value ?? ''}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d-]/g, '')
        if (t === '' || t === '-') return onChange(allowEmpty ? null : min)
        let n = Number.parseInt(t, 10)
        if (Number.isNaN(n)) return
        if (max !== undefined) n = Math.min(n, max)
        onChange(Math.max(min, n))
      }}
      {...rest}
    />
  )
}

export function Select({ className, children, id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select id={useFieldId(id)} className={cn(inputClass, 'cursor-pointer appearance-none bg-[length:16px] bg-no-repeat pe-8', 'select-chevron', className)} {...props}>
      {children}
    </select>
  )
}
