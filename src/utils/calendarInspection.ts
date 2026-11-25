/**
 * Inspection and diagnostics for the human.ua calendar / schedule page.
 * Gathers DOM structure, classes, tooltips, attributes and icons of lessons
 * and date columns to help identify unpublished lessons.
 */

let calendarObserver: MutationObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export interface LessonCardInspection {
  index: number
  element: HTMLElement
  classes: string[]
  dayColumnText: string
  title: string
  footerText: string
  tooltips: string[]
  icons: string[]
  attributes: Record<string, string>
  computedOpacity: string
  computedBackground: string
  computedBorder: string
  possibleHints: string[]
}

/**
 * Performs full inspection of the current calendar page and logs findings to the console.
 */
export function inspectCalendar(): LessonCardInspection[] {
  console.group('🗓️ [Human Boost] Аналіз календаря уроків (Calendar Inspection)')

  const container = document.querySelector(
    '.calendar-events-container, .calendar-container, [class*="calendar"]'
  )
  console.log('📍 Контейнер календаря:', container)

  // Find cards starting from .calendar-event__footer or .calendar-event / .calendar-event-overlay
  const footers = Array.from(document.querySelectorAll<HTMLElement>('.calendar-event__footer'))
  let cards: HTMLElement[] = []

  if (footers.length > 0) {
    cards = footers
      .map((f) => {
        return (f.closest<HTMLElement>('.calendar-event-overlay, .calendar-event') ||
          f.closest<HTMLElement>('[class*="calendar-event"]:not(.calendar-events-container)') ||
          f.parentElement) as HTMLElement
      })
      .filter((el): el is HTMLElement => Boolean(el))
  }

  if (cards.length === 0) {
    cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.calendar-event, .calendar-event-overlay, [class*="calendar-event"]:not(.calendar-events-container):not(.calendar-event__footer)'
      )
    )
  }

  // Remove duplicates
  cards = Array.from(new Set(cards))

  console.log(`🔎 Знайдено карток уроків: ${cards.length}`)

  // Find date / day columns or headers
  const dayHeaders = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.calendar-header, [class*="calendar-header"], [class*="day-header"], [class*="day-name"], [class*="date-header"], th[class*="date"], .calendar-week__header'
    )
  ).map((el) => el.textContent?.trim().replace(/\s+/g, ' ') || '')

  if (dayHeaders.length > 0) {
    console.log('📅 Заголовки днів/дат у календарі:', dayHeaders)
  }

  const inspections: LessonCardInspection[] = []

  cards.forEach((card, index) => {
    const classes = Array.from(card.classList)

    // Try to find enclosing day / column
    const columnEl = card.closest(
      '[class*="day"], [class*="column"], [class*="col"], .calendar-events-day, td, [class*="calendar-events__day"]'
    ) as HTMLElement | null

    // Extract day/date text from column or nearby headers
    const dayColumnText =
      columnEl
        ?.querySelector('[class*="header"], [class*="title"], [class*="date"], [class*="day"]')
        ?.textContent?.trim()
        .replace(/\s+/g, ' ') ||
      columnEl?.getAttribute('data-date') ||
      columnEl?.id ||
      'Невідома дата'

    // Extract title / subject
    const titleEl = card.querySelector(
      '[class*="title"], [class*="subject"], [class*="name"], h3, h4, h5, p'
    )
    const title = (titleEl?.textContent || card.textContent?.slice(0, 40) || '')
      .trim()
      .replace(/\s+/g, ' ')

    // Extract footer text
    const footerEl = card.querySelector('.calendar-event__footer, [class*="footer"]')
    const footerText = (footerEl?.textContent || '').trim().replace(/\s+/g, ' ')

    // Extract tooltips
    const tooltips: string[] = []
    card
      .querySelectorAll<HTMLElement>('[data-awesome-tooltip], [title], [mattooltip]')
      .forEach((el) => {
        const tip =
          el.getAttribute('data-awesome-tooltip') ||
          el.getAttribute('title') ||
          el.getAttribute('mattooltip')
        if (tip && !tooltips.includes(tip)) {
          tooltips.push(tip.trim())
        }
      })

    // Extract icons and images
    const icons: string[] = []
    card.querySelectorAll<HTMLElement>('icon2, img, svg').forEach((el) => {
      const iconName =
        el.getAttribute('icon') ||
        el.getAttribute('alt') ||
        el.getAttribute('src')?.split('/').pop() ||
        el.querySelector('use')?.getAttribute('xlink:href') ||
        el.tagName.toLowerCase()
      if (iconName && !icons.includes(iconName)) {
        icons.push(iconName)
      }
    })

    // Extract all attributes of the card
    const attributes: Record<string, string> = {}
    for (const attr of Array.from(card.attributes)) {
      if (!attr.name.startsWith('_ngcontent') && !attr.name.startsWith('_nghost')) {
        attributes[attr.name] = attr.value
      }
    }

    // Computed styles (opacity, background, border)
    const style = window.getComputedStyle(card)
    const computedOpacity = style.opacity
    const computedBackground = style.backgroundColor
    const computedBorder = style.border

    // Check for suspicious unpublished hints
    const possibleHints: string[] = []
    const allText = (card.textContent || '').toLowerCase()
    const allTooltipsText = tooltips.join(' ').toLowerCase()
    const classStr = classes.join(' ').toLowerCase()

    if (
      allText.includes('не опублік') ||
      allTooltipsText.includes('не опублік') ||
      classStr.includes('unpublish')
    ) {
      possibleHints.push('⚠️ Текст/тултіп: не опубліковано')
    }
    if (
      allText.includes('чернетк') ||
      allTooltipsText.includes('чернетк') ||
      classStr.includes('draft')
    ) {
      possibleHints.push('📝 Чернетка / draft')
    }
    if (
      allText.includes('прихован') ||
      allTooltipsText.includes('прихован') ||
      classStr.includes('hidden') ||
      classStr.includes('hide')
    ) {
      possibleHints.push('👁️ Приховано')
    }
    if (Number(computedOpacity) < 0.95) {
      possibleHints.push(`🌫️ Знижена прозорість: ${computedOpacity}`)
    }
    if (
      classStr.includes('disabled') ||
      classStr.includes('inactive') ||
      classStr.includes('mute')
    ) {
      possibleHints.push('🔇 Клас disabled/inactive')
    }

    inspections.push({
      index: index + 1,
      element: card,
      classes,
      dayColumnText,
      title: title.slice(0, 50),
      footerText: footerText.slice(0, 40),
      tooltips,
      icons,
      attributes,
      computedOpacity,
      computedBackground,
      computedBorder,
      possibleHints,
    })
  })

  // Pretty table in console
  if (inspections.length > 0) {
    console.table(
      inspections.map((item) => ({
        '#': item.index,
        Урок: item.title,
        Дата: item.dayColumnText,
        Класи: item.classes.join(', '),
        Тултіпи: item.tooltips.join(' | '),
        Іконки: item.icons.join(', '),
        Opacity: item.computedOpacity,
        'Можливі ознаки': item.possibleHints.join('; ') || '—',
      }))
    )
  } else {
    console.warn(
      '⚠️ Картки уроків не знайдено за стандартними селекторами. Перевірте контейнери у DOM.'
    )
  }

  console.log(
    '💡 Підказка: Ви можете вручну перезапустити цей лог через Alt+C або: document.dispatchEvent(new Event("ha:inspect"))'
  )
  console.groupEnd()

  return inspections
}

// Global listener in content script (CSP-safe, no inline scripts)
if (typeof window !== 'undefined') {
  ;(window as unknown as { haInspectCalendar: typeof inspectCalendar }).haInspectCalendar =
    inspectCalendar

  const onInspectTrigger = () => {
    inspectCalendar()
  }

  window.addEventListener('ha:inspect', onInspectTrigger)
  document.addEventListener('ha:inspect', onInspectTrigger)
  window.addEventListener('ha:inspect-calendar', onInspectTrigger)
  document.addEventListener('ha:inspect-calendar', onInspectTrigger)

  // postMessage bridge — works reliably across isolated worlds without CSP issues
  window.addEventListener('message', (event) => {
    if (
      event.data === 'ha:inspect' ||
      event.data === 'ha:inspect-calendar' ||
      event.data?.type === 'ha:inspect' ||
      event.data?.type === 'ha:inspect-calendar'
    ) {
      inspectCalendar()
    }
  })

  // Shortcut: Alt + C (or Option + C on Mac)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.code === 'KeyC' || e.key === 'c' || e.key === 'с')) {
      inspectCalendar()
    }
  })
}

let inspectTimers: Array<ReturnType<typeof setTimeout>> = []

/**
 * Initializes observation on the calendar page so inspection runs
 * automatically when lesson cards are rendered by Angular.
 */
export function initCalendarInspection(): void {
  destroyCalendarInspection()

  let hasLogged = false

  function tryInspect() {
    const cards = document.querySelectorAll(
      '.calendar-event, [class*="calendar-event"]:not(.calendar-events-container)'
    )
    if (cards.length > 0 && !hasLogged) {
      hasLogged = true
      inspectCalendar()
    }
  }

  // Initial trigger attempts to catch Angular after render
  tryInspect()
  inspectTimers.push(setTimeout(tryInspect, 1000))
  inspectTimers.push(setTimeout(tryInspect, 2500))

  console.debug(
    '[Human Boost] Calendar inspection listener initialized (run on demand via Alt+C or postMessage).'
  )
}

/**
 * Cleans up calendar inspection listeners and observers.
 */
export function destroyCalendarInspection(): void {
  for (const t of inspectTimers) {
    clearTimeout(t)
  }
  inspectTimers = []
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (calendarObserver) {
    calendarObserver.disconnect()
    calendarObserver = null
  }
}
