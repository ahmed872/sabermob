import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { Spinner } from './spinner'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-sm hover:brightness-110',
        secondary: 'bg-sunken text-fg hover:bg-line',
        outline: 'border border-line-strong bg-surface text-fg hover:bg-sunken',
        ghost: 'text-muted hover:bg-sunken hover:text-fg',
        danger: 'bg-danger text-white shadow-sm hover:brightness-110',
        success: 'bg-success text-white shadow-sm hover:brightness-110',
        soft: 'bg-primary-soft text-primary hover:brightness-95',
        link: 'text-primary underline-offset-4 hover:underline px-0'
      },
      size: {
        xs: 'h-7 px-2 text-xs rounded-lg',
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        xl: 'h-14 px-6 text-lg rounded-2xl',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-lg'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, type, ...props }, ref) => (
  <button ref={ref} type={type ?? 'button'} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading ? <Spinner className="size-4" /> : null}
    {children}
  </button>
))
Button.displayName = 'Button'
