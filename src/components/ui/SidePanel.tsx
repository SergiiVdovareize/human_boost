import clsx from 'clsx'
import {
  createContext,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { CloseButton } from './CloseButton'

/** Keep in sync with `.ha-side-panel` transition duration in `_sidepanel.scss` */
const SIDE_PANEL_ANIM_MS = 200

interface SidePanelContextType {
  onClose?: () => void
}

const SidePanelContext = createContext<SidePanelContextType>({})

export interface SidePanelProps extends HTMLAttributes<HTMLDivElement> {
  show?: boolean
  onClose?: () => void
  width?: string
  children?: ReactNode
}

export function SidePanel({
  show = false,
  onClose,
  width,
  className,
  children,
  style,
  ...props
}: SidePanelProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const mountedRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (show) {
      mountedRef.current = true
      setIsMounted(true)
      // Double rAF: paint closed state first, then enable --open for transition
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setIsOpen(true)
          rafRef.current = null
        })
      })
      return
    }

    setIsOpen(false)
    if (!mountedRef.current) return

    closeTimerRef.current = setTimeout(() => {
      mountedRef.current = false
      setIsMounted(false)
      closeTimerRef.current = null
    }, SIDE_PANEL_ANIM_MS)
  }, [show])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    if (!show || !isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [show, isOpen, onClose])

  if (!isMounted) return null

  return (
    <SidePanelContext.Provider value={{ onClose }}>
      <div
        className={clsx('ha-side-panel', isOpen && 'ha-side-panel--open', className)}
        style={{ width: width || undefined, ...style }}
        role="complementary"
        aria-label="Human Boost Panel"
        {...props}
      >
        <div className="ha-side-panel__inner">{children}</div>
      </div>
    </SidePanelContext.Provider>
  )
}

export interface SidePanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  closeButton?: boolean
  children?: ReactNode
}

export function SidePanelHeader({
  closeButton = true,
  className,
  children,
  ...props
}: SidePanelHeaderProps) {
  const { onClose } = useContext(SidePanelContext)

  return (
    <div className={clsx('ha-side-panel__header', className)} {...props}>
      <div className="ha-side-panel__header-content">{children}</div>
      {closeButton && (
        <CloseButton
          className="ha-side-panel__close-btn"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose?.()
          }}
        />
      )}
    </div>
  )
}

export interface SidePanelTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: ElementType
  children?: ReactNode
}

export function SidePanelTitle({
  as: Component = 'h5',
  className,
  children,
  ...props
}: SidePanelTitleProps) {
  return (
    <Component className={clsx('ha-side-panel__title', className)} {...props}>
      {children}
    </Component>
  )
}

export function SidePanelBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-side-panel__body', className)} {...props}>
      {children}
    </div>
  )
}

export function SidePanelFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ha-side-panel__footer', className)} {...props}>
      {children}
    </div>
  )
}

SidePanel.Header = SidePanelHeader
SidePanel.Title = SidePanelTitle
SidePanel.Body = SidePanelBody
SidePanel.Footer = SidePanelFooter

export default SidePanel
