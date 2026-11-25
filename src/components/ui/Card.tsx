import { cva, type VariantProps } from 'class-variance-authority'
import clsx from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

export const cardVariants = cva('ha-card', {
  variants: {
    variant: {
      default: '',
      bordered: 'ha-card--bordered',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  children?: ReactNode
}

export function Card({ className, variant, children, ...props }: CardProps) {
  return (
    <div className={clsx(cardVariants({ variant }), className)} {...props}>
      {children}
    </div>
  )
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-card-body card-body', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-card-header card-header', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5 className={clsx('ha-card-title card-title', className)} {...props}>
      {children}
    </h5>
  )
}

Card.Body = CardBody
Card.Header = CardHeader
Card.Title = CardTitle

export default Card
