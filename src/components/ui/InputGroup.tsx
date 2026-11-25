import clsx from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

export interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function InputGroup({ className, children, ...props }: InputGroupProps) {
  return (
    <div className={clsx('ha-input-group input-group', className)} {...props}>
      {children}
    </div>
  )
}

export function InputGroupText({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx('ha-input-group-text input-group-text', className)} {...props}>
      {children}
    </span>
  )
}

InputGroup.Text = InputGroupText

export default InputGroup
