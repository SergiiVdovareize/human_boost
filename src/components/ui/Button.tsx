import { cva, type VariantProps } from 'class-variance-authority'
import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const buttonVariants = cva('ha-btn', {
  variants: {
    variant: {
      primary: 'ha-btn--primary',
      secondary: 'ha-btn--secondary',
      success: 'ha-btn--success',
      danger: 'ha-btn--danger',
      warning: 'ha-btn--warning',
      info: 'ha-btn--info',
      'outline-primary': 'ha-btn--outline-primary',
      'outline-danger': 'ha-btn--outline-danger',
      'outline-secondary': 'ha-btn--outline-secondary',
      close: 'ha-btn-close',
    },
    size: {
      sm: 'ha-btn--sm',
      md: 'ha-btn--md',
      lg: 'ha-btn--lg',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
})

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  children?: ReactNode
}

export function Button({
  className,
  variant,
  size,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={clsx(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  )
}

export default Button
