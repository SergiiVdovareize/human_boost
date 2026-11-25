/**
 * Universal styled tooltip utility for Human Boost.
 * Positions a floating tooltip nicely aligned to any element with [data-ha-tooltip].
 */

let sharedTooltipEl: HTMLElement | null = null
let tooltipListenersAttached = false

export function getOrCreateTooltip(): HTMLElement {
  if (!sharedTooltipEl || !document.body.contains(sharedTooltipEl)) {
    sharedTooltipEl = document.createElement('div')
    sharedTooltipEl.className = 'ha-styled-tooltip'
    document.body.appendChild(sharedTooltipEl)
  }
  return sharedTooltipEl
}

export function showStyledTooltip(targetEl: HTMLElement, text: string): void {
  if (!text) return
  const tooltip = getOrCreateTooltip()

  // Format multi-line text safely using text nodes and <br> elements (prevents XSS)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  tooltip.textContent = ''
  lines.forEach((line, index) => {
    if (index > 0) {
      tooltip.appendChild(document.createElement('br'))
    }
    tooltip.appendChild(document.createTextNode(line))
  })
  tooltip.className = 'ha-styled-tooltip ha-styled-tooltip--visible'

  const rect = targetEl.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()

  let left = rect.left + rect.width / 2 - tooltipRect.width / 2
  let top = rect.top - tooltipRect.height - 6

  if (top < 10) {
    top = rect.bottom + 6
    tooltip.classList.add('ha-styled-tooltip--bottom')
  } else {
    tooltip.classList.remove('ha-styled-tooltip--bottom')
  }

  left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8))

  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

export function hideStyledTooltip(): void {
  if (sharedTooltipEl) {
    sharedTooltipEl.classList.remove('ha-styled-tooltip--visible')
  }
}

function handleMouseOver(e: MouseEvent): void {
  const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-ha-tooltip]')
  if (target) {
    // If unpublished highlight is disabled and target is an unpublished card, skip
    if (
      document.body.classList.contains('ha-disable-unpublished-highlight') &&
      (target.classList.contains('ha-lesson-unpublished') ||
        target.classList.contains('ha-task-missing'))
    ) {
      return
    }

    const text = target.getAttribute('data-ha-tooltip')
    if (text) {
      showStyledTooltip(target, text)
    }
  }
}

function handleMouseOut(e: MouseEvent): void {
  const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-ha-tooltip]')
  const related = (e.relatedTarget as HTMLElement)?.closest<HTMLElement>('[data-ha-tooltip]')
  if (target && target !== related) {
    hideStyledTooltip()
  }
}

export function initTooltipListeners(): void {
  if (tooltipListenersAttached) return
  tooltipListenersAttached = true

  document.addEventListener('mouseover', handleMouseOver, { passive: true })
  document.addEventListener('mouseout', handleMouseOut, { passive: true })
  window.addEventListener('scroll', hideStyledTooltip, { passive: true })
}

export function destroyTooltipListeners(): void {
  if (!tooltipListenersAttached) return
  tooltipListenersAttached = false

  document.removeEventListener('mouseover', handleMouseOver)
  document.removeEventListener('mouseout', handleMouseOut)
  window.removeEventListener('scroll', hideStyledTooltip)
  hideStyledTooltip()
}
