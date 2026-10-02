import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | undefined
  const d = (...args: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
  d.cancel = () => clearTimeout(t)
  return d
}

export function uuid(): string {
  return crypto.randomUUID()
}
