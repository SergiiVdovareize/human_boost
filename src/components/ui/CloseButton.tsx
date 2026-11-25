import { clsx } from 'clsx'
import { X } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export interface CloseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  iconSize?: number
  variant?: 'default' | 'white'
}

/**
 * Standardized close cross button used across all modals, drawers, panels and alert blocks.
 */
export function CloseButton({
  size = 'md',
  iconSize,
  variant = 'default',
  className,
  ...props
}: CloseButtonProps) {
  const defaultIconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16
  const finalIconSize = iconSize ?? defaultIconSize

  return (
    <button
      type="button"
      className={clsx(
        'ha-close-btn',
        size !== 'md' && `ha-close-btn--${size}`,
        variant === 'white' && 'ha-close-btn--white',
        className
      )}
      aria-label="Закрити"
      {...props}
    >
      <X size={finalIconSize} strokeWidth={2} />
    </button>
  )
}
