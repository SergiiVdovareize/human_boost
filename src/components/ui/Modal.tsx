import clsx from 'clsx'
import {
  createContext,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
} from 'react'
import { CloseButton } from './CloseButton'

interface ModalContextType {
  onHide?: () => void
}

const ModalContext = createContext<ModalContextType>({})

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  show?: boolean
  onHide?: () => void
  centered?: boolean
  animation?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children?: ReactNode
}

export function Modal({
  show = false,
  onHide,
  centered = true,
  size,
  className,
  children,
  ...props
}: ModalProps) {
  useEffect(() => {
    if (!show) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onHide?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [show, onHide])

  if (!show) return null

  return (
    <ModalContext.Provider value={{ onHide }}>
      <div
        className={clsx('ha-modal-root modal-open', className)}
        role="dialog"
        aria-modal="true"
        {...props}
      >
        <div className="ha-modal-backdrop modal-backdrop" onClick={onHide} aria-hidden="true" />
        <div
          className={clsx(
            'ha-modal-dialog modal-dialog',
            centered && 'ha-modal-dialog--centered modal-dialog-centered',
            size && `ha-modal-dialog--${size} modal-${size}`
          )}
        >
          <div className="ha-modal-content modal-content">{children}</div>
        </div>
      </div>
    </ModalContext.Provider>
  )
}

export interface ModalHeaderProps extends HTMLAttributes<HTMLDivElement> {
  closeButton?: boolean
  children?: ReactNode
}

export function ModalHeader({
  closeButton = false,
  className,
  children,
  ...props
}: ModalHeaderProps) {
  const { onHide } = useContext(ModalContext)

  return (
    <div className={clsx('ha-modal-header modal-header', className)} {...props}>
      {children}
      {closeButton && <CloseButton className="ha-btn-close btn-close" onClick={onHide} />}
    </div>
  )
}

export interface ModalTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: ElementType
  children?: ReactNode
}

export function ModalTitle({
  as: Component = 'h5',
  className,
  children,
  ...props
}: ModalTitleProps) {
  return (
    <Component className={clsx('ha-modal-title modal-title', className)} {...props}>
      {children}
    </Component>
  )
}

export function ModalBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-modal-body modal-body', className)} {...props}>
      {children}
    </div>
  )
}

export function ModalFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-modal-footer modal-footer', className)} {...props}>
      {children}
    </div>
  )
}

Modal.Header = ModalHeader
Modal.Title = ModalTitle
Modal.Body = ModalBody
Modal.Footer = ModalFooter

export default Modal
