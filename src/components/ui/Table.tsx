import { cva, type VariantProps } from 'class-variance-authority'
import clsx from 'clsx'
import type { ReactNode, TableHTMLAttributes } from 'react'

export const tableVariants = cva('ha-table table', {
  variants: {
    bordered: {
      true: 'ha-table--bordered table-bordered',
    },
    hover: {
      true: 'ha-table--hover table-hover',
    },
    striped: {
      true: 'ha-table--striped table-striped',
    },
    size: {
      sm: 'ha-table--sm table-sm',
      md: '',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export interface TableProps
  extends TableHTMLAttributes<HTMLTableElement>,
    VariantProps<typeof tableVariants> {
  responsive?: boolean
  children?: ReactNode
}

export function Table({
  responsive = false,
  bordered,
  hover,
  striped,
  size,
  className,
  children,
  ...props
}: TableProps) {
  const table = (
    <table
      className={clsx(tableVariants({ bordered, hover, striped, size }), className)}
      {...props}
    >
      {children}
    </table>
  )

  if (responsive) {
    return <div className="ha-table-responsive table-responsive">{table}</div>
  }

  return table
}

export default Table
