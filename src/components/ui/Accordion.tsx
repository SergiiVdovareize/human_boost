import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { createContext, type HTMLAttributes, type ReactNode, useContext, useState } from 'react'

interface AccordionContextType {
  activeKey: string | null
  toggleKey: (key: string) => void
}

const AccordionContext = createContext<AccordionContextType>({
  activeKey: null,
  toggleKey: () => {},
})

interface AccordionItemContextType {
  eventKey: string
  isOpen: boolean
}

const AccordionItemContext = createContext<AccordionItemContextType>({
  eventKey: '',
  isOpen: false,
})

export interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  defaultActiveKey?: string
  children?: ReactNode
}

export function Accordion({
  defaultActiveKey = '',
  className,
  children,
  ...props
}: AccordionProps) {
  const [activeKey, setActiveKey] = useState<string | null>(defaultActiveKey || null)

  const toggleKey = (key: string) => {
    setActiveKey((prev) => (prev === key ? null : key))
  }

  return (
    <AccordionContext.Provider value={{ activeKey, toggleKey }}>
      <div className={clsx('ha-accordion accordion', className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

export interface AccordionItemProps extends HTMLAttributes<HTMLDivElement> {
  eventKey: string
  children?: ReactNode
}

export function AccordionItem({ eventKey, className, children, ...props }: AccordionItemProps) {
  const { activeKey } = useContext(AccordionContext)
  const isOpen = activeKey === eventKey

  return (
    <AccordionItemContext.Provider value={{ eventKey, isOpen }}>
      <div
        className={clsx(
          'ha-accordion-item accordion-item',
          isOpen && 'ha-accordion-item--open',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
}

export interface AccordionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function AccordionHeader({ className, children, ...props }: AccordionHeaderProps) {
  const { toggleKey } = useContext(AccordionContext)
  const { eventKey, isOpen } = useContext(AccordionItemContext)

  return (
    <div className={clsx('ha-accordion-header accordion-header', className)} {...props}>
      <button
        type="button"
        className={clsx('ha-accordion-button accordion-button', !isOpen && 'collapsed')}
        onClick={() => toggleKey(eventKey)}
        aria-expanded={isOpen}
      >
        <span className="ha-accordion-title">{children}</span>
        <ChevronDown
          size={16}
          className={clsx('ha-accordion-icon', isOpen && 'ha-accordion-icon--rotated')}
        />
      </button>
    </div>
  )
}

export interface AccordionBodyProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function AccordionBody({ className, children, ...props }: AccordionBodyProps) {
  const { isOpen } = useContext(AccordionItemContext)

  if (!isOpen) return null

  return (
    <div className={clsx('ha-accordion-body accordion-body', className)} {...props}>
      {children}
    </div>
  )
}

Accordion.Item = AccordionItem
Accordion.Header = AccordionHeader
Accordion.Body = AccordionBody

export default Accordion
