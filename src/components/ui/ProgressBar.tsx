import { cva, type VariantProps } from 'class-variance-authority'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'

export const progressBarVariants = cva('ha-progress-bar progress-bar', {
  variants: {
    variant: {
      success: 'ha-progress-bar--success bg-success',
      primary: 'ha-progress-bar--primary bg-primary',
      danger: 'ha-progress-bar--danger bg-danger',
      warning: 'ha-progress-bar--warning bg-warning',
      info: 'ha-progress-bar--info bg-info',
    },
    animated: {
      true: 'ha-progress-bar--animated progress-bar-animated progress-bar-striped',
    },
  },
  defaultVariants: {
    variant: 'primary',
    animated: false,
  },
})

export interface ProgressBarProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressBarVariants> {
  now?: number
  min?: number
  max?: number
  label?: string
}

export function ProgressBar({
  now = 0,
  min = 0,
  max = 100,
  label,
  variant,
  animated,
  className,
  ...props
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, max > min ? ((now - min) / (max - min)) * 100 : 0))

  return (
    <div
      className={clsx('ha-progress progress', className)}
      role="progressbar"
      aria-valuenow={now}
      aria-valuemin={min}
      aria-valuemax={max}
      {...props}
    >
      <div
        className={clsx(progressBarVariants({ variant, animated }))}
        style={{ width: `${percentage}%` }}
      >
        {label ?? (percentage > 0 ? `${Math.round(percentage)}%` : '')}
      </div>
    </div>
  )
}

export default ProgressBar
