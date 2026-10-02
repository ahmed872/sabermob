import { Delete } from 'lucide-react'
import { cn } from '../../lib/utils'

/** Large touch-friendly PIN pad (also accepts the physical keyboard). */
export function PinPad({ value, onChange, onSubmit, length = 8 }: { value: string; onChange: (v: string) => void; onSubmit: () => void; length?: number }) {
  const press = (d: string) => value.length < length && onChange(value + d)
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="mb-5 flex h-12 items-center justify-center gap-2.5" dir="ltr">
        {Array.from({ length: Math.max(4, value.length) }, (_, i) => (
          <span key={i} className={cn('size-3.5 rounded-full border-2 transition', i < value.length ? 'border-primary bg-primary' : 'border-line-strong')} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PadKey key={d} onClick={() => press(d)}>
            {d}
          </PadKey>
        ))}
        <PadKey onClick={() => onChange(value.slice(0, -1))} aria-label="delete">
          <Delete className="size-6" />
        </PadKey>
        <PadKey onClick={() => press('0')}>0</PadKey>
        <PadKey onClick={onSubmit} primary aria-label="submit">
          ✓
        </PadKey>
      </div>
    </div>
  )
}

function PadKey({ children, onClick, primary, ...rest }: { children: React.ReactNode; onClick: () => void; primary?: boolean; 'aria-label'?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-16 items-center justify-center rounded-2xl text-2xl font-bold transition active:scale-95',
        primary ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg hover:bg-line'
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
