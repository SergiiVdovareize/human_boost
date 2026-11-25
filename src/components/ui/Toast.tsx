import clsx from 'clsx'
import { createContext, type HTMLAttributes, type ReactNode, useContext, useEffect } from 'react'
import { CloseButton } from './CloseButton'

interface ToastContextType {
  onClose?: () => void
}

const ToastContext = createContext<ToastContextType>({})

export interface ToastContainerProps extends HTMLAttributes<HTMLDivElement> {
  position?:
    | 'top-start'
    | 'top-center'
    | 'top-end'
    | 'middle-start'
    | 'middle-center'
    | 'middle-end'
    | 'bottom-start'
    | 'bottom-center'
    | 'bottom-end'
  children?: ReactNode
}

export function ToastContainer({
  position = 'top-end',
  className,
  children,
  ...props
}: ToastContainerProps) {
  return (
    <div
      className={clsx(
        'ha-toast-container toast-container',
        `ha-toast-container--${position}`,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  show?: boolean
  autohide?: boolean
  delay?: number
  onClose?: () => void
  bg?: string
  children?: ReactNode
}

export function Toast({
  show = true,
  autohide = true,
  delay = 3000,
  onClose,
  bg,
  className,
  children,
  ...props
}: ToastProps) {
  useEffect(() => {
    if (!show || !autohide || !onClose) return

    const timer = setTimeout(() => {
      onClose()
    }, delay)

    return () => clearTimeout(timer)
  }, [show, autohide, delay, onClose])

  if (!show) return null

  return (
    <ToastContext.Provider value={{ onClose }}>
      <div
        className={clsx('ha-toast toast show', bg && `ha-toast--${bg} bg-${bg}`, className)}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        {...props}
      >
        {children}
      </div>
    </ToastContext.Provider>
  )
}

export interface ToastHeaderProps extends HTMLAttributes<HTMLDivElement> {
  closeButton?: boolean
  children?: ReactNode
}

export function ToastHeader({
  closeButton = true,
  className,
  children,
  ...props
}: ToastHeaderProps) {
  const { onClose } = useContext(ToastContext)

  return (
    <div className={clsx('ha-toast-header toast-header', className)} {...props}>
      {children}
      {closeButton && <CloseButton variant="white" onClick={onClose} />}
    </div>
  )
}

export function ToastBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-toast-body toast-body', className)} {...props}>
      {children}
    </div>
  )
}

Toast.Header = ToastHeader
Toast.Body = ToastBody

export default Toast
