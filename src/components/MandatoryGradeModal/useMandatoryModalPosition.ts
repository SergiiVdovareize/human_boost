import { type RefObject, useEffect, useState } from 'react'

import { clearColumnHighlight, highlightWideColumn } from '@/utils/columnContourHighlight'

interface UseMandatoryModalPositionProps {
  isOpen: boolean
  lessonBlock: HTMLElement | null
  popupRef: RefObject<HTMLDivElement | null>
  colIndexStart: number | null
  colIndexEnd: number | null
  isProcessing: boolean
  onClose: () => void
}

export function useMandatoryModalPosition({
  isOpen,
  lessonBlock,
  popupRef,
  colIndexStart,
  colIndexEnd,
  isProcessing,
  onClose,
}: UseMandatoryModalPositionProps) {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 120, left: 100 })

  // Calculate position and highlight wide column background
  useEffect(() => {
    if (!isOpen || !lessonBlock) {
      clearColumnHighlight()
      return
    }

    highlightWideColumn(colIndexStart, colIndexEnd, lessonBlock)

    const updatePosition = () => {
      if (!lessonBlock) return
      const rect = lessonBlock.getBoundingClientRect()
      const popupWidth = 370
      const popupHeight = popupRef.current?.offsetHeight || 440

      // If in first 60% of viewport width -> position to the right, else to the left
      const isFirst60 = rect.left + rect.width / 2 < window.innerWidth * 0.6
      let left = 0

      if (isFirst60) {
        left = rect.right + 12
        if (left + popupWidth > window.innerWidth - 12) {
          left = window.innerWidth - popupWidth - 12
        }
      } else {
        left = rect.left - popupWidth - 12
        if (left < 12) {
          left = 12
        }
      }

      let top = rect.top
      if (top + popupHeight > window.innerHeight - 16) {
        top = window.innerHeight - popupHeight - 16
      }
      if (top < 16) {
        top = 16
      }

      setPos({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      clearColumnHighlight()
    }
  }, [isOpen, lessonBlock, colIndexStart, colIndexEnd, popupRef])

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (isProcessing) return
      const target = e.target as HTMLElement
      if (
        popupRef.current &&
        !popupRef.current.contains(target) &&
        !target.closest('.ha-mandatory-grades-menu-item')
      ) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [isOpen, isProcessing, onClose, popupRef])

  return pos
}
