import { cn } from '../lib/utils'

/** Central Pro mark: a phone outline with a signal arc. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-9', className)} aria-hidden>
      <defs>
        <linearGradient id="cp-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#cp-g)" />
      <rect x="15" y="10" width="18" height="28" rx="4" fill="none" stroke="white" strokeWidth="3" />
      <circle cx="24" cy="33" r="1.8" fill="white" />
      <path d="M36 14a10 10 0 0 1 0 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />
    </svg>
  )
}
