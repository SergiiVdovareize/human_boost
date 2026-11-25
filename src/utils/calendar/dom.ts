import {
  cleanText,
  isJuniorClass,
  isLessonCreated,
  isLessonEndedHoursAgo,
  isPastTodayOrTomorrow,
} from './rules'
import { calendarState, setCalendarLoadingState } from './state'
import type { LessonEventStatus } from './types'

/**
 * Detects whether a calendar event card currently has a video conference icon/indicator in the DOM.
 */
export function cardHasVideoConference(card: HTMLElement): boolean {
  return Boolean(
    card.querySelector(
      "img[src*='video'], img[alt*='video'], [style*='video'], [data-awesome-tooltip*='конференц'], [data-awesome-tooltip*='конференція'], [data-awesome-tooltip*='conference'], svg path[d^='M18.7072']"
    )
  )
}

/**
 * Detects whether a calendar event card has hints of unpublished materials or tasks in the DOM
 * (e.g. tooltip "Є не опублiкований матеріал" or yellow badge dot).
 */
export function cardHasUnpublishedHint(card: HTMLElement): boolean {
  const tooltips = Array.from(
    card.querySelectorAll<HTMLElement>(
      '[data-awesome-tooltip], [title], [mattooltip], [aria-label]'
    )
  )
  for (const el of tooltips) {
    const tip = (
      el.getAttribute('data-awesome-tooltip') ||
      el.getAttribute('title') ||
      el.getAttribute('mattooltip') ||
      el.getAttribute('aria-label') ||
      ''
    ).toLowerCase()

    // Matches both Cyrillic "і" and Latin "i" in "не опублiкований" / "не опублікований"
    if (/не\s*опубл[іi]/i.test(tip) || tip.includes('чернетк') || tip.includes('draft')) {
      return true
    }
  }

  // Also check if card has yellow badge dot (human.ua unpublished indicator)
  if (card.querySelector('.badge-dot--color-yellow, [class*="badge-dot"][class*="yellow"]')) {
    return true
  }

  return false
}

/**
 * Detects whether a calendar event card currently has a task / homework indicator in the DOM
 * (e.g. task tooltip, homework icon, or non-video footer indicator).
 */
export function cardHasTask(card: HTMLElement): boolean {
  // If card has an explicit unpublished hint, it does NOT have a published task
  if (cardHasUnpublishedHint(card)) {
    return false
  }

  // 1. Tooltips mentioning tasks or homework
  const tooltips = Array.from(
    card.querySelectorAll<HTMLElement>(
      '[data-awesome-tooltip], [title], [mattooltip], [aria-label]'
    )
  )
  for (const el of tooltips) {
    // Avoid matching lesson topic title
    if (el.classList.contains('calendar-event-theme-title')) continue

    const tip = (
      el.getAttribute('data-awesome-tooltip') ||
      el.getAttribute('title') ||
      el.getAttribute('mattooltip') ||
      el.getAttribute('aria-label') ||
      ''
    ).toLowerCase()

    if (
      tip.includes('завдан') ||
      tip.includes('домашн') ||
      tip.includes('homework') ||
      tip.includes('task')
    ) {
      return true
    }
  }

  // 2. Dedicated task / homework icons, attributes, or classes
  const taskElements = card.querySelectorAll(
    'icon2[icon*="task"], icon2[icon*="home"], icon2[name*="task"], icon2[name*="home"], ' +
      '[class*="homework"], [class*="task-icon"], [class*="home-task"], ' +
      'img[src*="task"], img[alt*="task"], img[src*="homework"], img[alt*="homework"], ' +
      '[data-icon*="task"], [data-icon*="home"]'
  )
  if (taskElements.length > 0) {
    return true
  }

  return false
}

/**
 * Immediately clears all calendar highlights, classes, and self-study markers.
 * Used during week transitions so cards default to an unhighlighted state until API data loads.
 */
export function clearAllCalendarHighlights(): void {
  // Clear day column header highlights
  document.querySelectorAll('.ha-day-has-unpublished').forEach((el) => {
    el.classList.remove('ha-day-has-unpublished')
  })

  // Clear lesson card highlights, missing task markers, and tooltips
  document.querySelectorAll('.ha-lesson-unpublished').forEach((el) => {
    el.classList.remove('ha-lesson-unpublished')
  })
  document.querySelectorAll('.ha-lesson-uncreated').forEach((el) => {
    el.classList.remove('ha-lesson-uncreated')
  })
  document.querySelectorAll('.ha-task-missing').forEach((el) => {
    el.classList.remove('ha-task-missing')
  })
  document.querySelectorAll('.ha-card-notes-container, .ha-card-note').forEach((el) => {
    el.remove()
  })
  document.querySelectorAll('.calendar-event[data-ha-tooltip]').forEach((el) => {
    el.removeAttribute('data-ha-tooltip')
  })

  document.querySelectorAll('.ha-self-study-lesson').forEach((el) => {
    el.classList.remove('ha-self-study-lesson')
    const footerLeft = el.querySelector<HTMLElement>('.calendar-event__footer-left')
    if (footerLeft?.getAttribute('title') === 'Самостійний урок (відеоконференція відсутня)') {
      footerLeft.removeAttribute('title')
    }
  })

  // Clear data attributes
  document.querySelectorAll('[data-ha-lesson-published]').forEach((el) => {
    el.removeAttribute('data-ha-lesson-published')
    el.removeAttribute('data-ha-task-published')
    el.removeAttribute('data-ha-task-expected')
    el.removeAttribute('data-ha-event-id')
    el.removeAttribute('data-ha-event-date')
    el.removeAttribute('data-ha-is-due')
  })

  // Clear legacy badges if any
  document.querySelectorAll('.ha-self-study-badge').forEach((el) => {
    el.remove()
  })
}

/**
 * Extracts visible day numbers from the calendar headers in the DOM.
 */
export function getVisibleCalendarDayNumbers(): number[] {
  const dayTitles = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.calendar-day-title, [class*="calendar-day"] [class*="title"], [class*="calendar-day"] [class*="header"]'
    )
  )
  const dayNumbers: number[] = []

  for (const el of dayTitles) {
    const text = el.textContent?.trim() || ''
    // Look for day number in text like "Пн, 14", "14 жовтня", "14.10", "14"
    const match = text.match(/\b([0-3]?[0-9])\b/)
    if (match) {
      const num = Number.parseInt(match[1], 10)
      if (num >= 1 && num <= 31 && !dayNumbers.includes(num)) {
        dayNumbers.push(num)
      }
    }
  }

  return dayNumbers
}

/**
 * Verifies whether the parsed API events status matches the currently visible week in the calendar.
 * Prevents stale responses from previous weeks from being falsely applied.
 */
export function doesStatusMatchVisibleWeek(eventsStatus: LessonEventStatus[]): boolean {
  if (!eventsStatus || eventsStatus.length === 0) return true

  const visibleDays = getVisibleCalendarDayNumbers()
  if (visibleDays.length === 0) {
    return true
  }

  const eventDays = eventsStatus
    .map((ev) => {
      if (ev.dateStr) {
        const parts = ev.dateStr.split('-')
        if (parts.length === 3) return Number.parseInt(parts[2], 10)
      }
      return null
    })
    .filter((n): n is number => n !== null && !Number.isNaN(n))

  if (eventDays.length === 0) return true

  return eventDays.some((day) => visibleDays.includes(day))
}

/**
 * Applies CSS classes `.ha-lesson-unpublished` and `.ha-day-has-unpublished`
 * based on verified API status, and adds self-study indicators.
 * By default, clears all highlights immediately until verified data is ready.
 */
export function applyUnpublishedHighlights(eventsStatus: LessonEventStatus[]): void {
  // 1. Only apply highlights AFTER data has successfully loaded and matches the visible week
  if (!eventsStatus || eventsStatus.length === 0) {
    if (calendarState.isWeekLoading) {
      clearAllCalendarHighlights()
    }
    return
  }

  if (!doesStatusMatchVisibleWeek(eventsStatus)) {
    return
  }

  // 2. Once verified data is ready, reset existing markings before applying fresh ones
  clearAllCalendarHighlights()

  // Once data matches and is being applied, ensure loading suppression state is deactivated
  setCalendarLoadingState(false)

  // Find all day columns in the calendar
  const dayColumns = Array.from(document.querySelectorAll<HTMLElement>('.calendar-day-of-week'))
  if (dayColumns.length === 0) return

  // Group events by day of week (0 = Monday, ..., 6 = Sunday)
  const eventsByDay = new Map<number, LessonEventStatus[]>()
  for (const ev of eventsStatus) {
    const list = eventsByDay.get(ev.dayOfWeek) || []
    list.push(ev)
    eventsByDay.set(ev.dayOfWeek, list)
  }

  const debugRows: Array<Record<string, unknown>> = []

  dayColumns.forEach((col, colIndex) => {
    // 1. Determine day number of this column from header (e.g. "20" from "Вт, 20")
    const colHeader =
      col.querySelector(
        '.calendar-day-title, [class*="calendar-day"] [class*="title"], [class*="calendar-day"] [class*="header"]'
      )?.textContent || ''
    const dayNumMatch = colHeader.match(/\b([0-3]?[0-9])\b/)
    const colDayNum = dayNumMatch ? Number.parseInt(dayNumMatch[1], 10) : null

    // 2. Filter events matching this day
    let dayEvents: LessonEventStatus[] = []
    if (colDayNum !== null) {
      dayEvents = eventsStatus.filter((ev) => {
        if (!ev.dateStr) return false
        const parts = ev.dateStr.split('-')
        return parts.length === 3 && Number.parseInt(parts[2], 10) === colDayNum
      })
    }
    if (dayEvents.length === 0) {
      // Fallback by dayOfWeek index
      dayEvents = eventsByDay.get(colIndex) || []
    }

    // 3. Determine the date string (YYYY-MM-DD) for this column
    let columnDateStr = ''
    if (dayEvents.length > 0 && dayEvents[0].dateStr) {
      columnDateStr = dayEvents[0].dateStr
    } else if (colDayNum !== null && eventsStatus.length > 0) {
      const sample = eventsStatus.find((e) => e.dateStr)
      if (sample) {
        const [y, m] = sample.dateStr.split('-')
        columnDateStr = `${y}-${m}-${String(colDayNum).padStart(2, '0')}`
      }
    }

    const cards = Array.from(col.querySelectorAll<HTMLElement>('.calendar-event'))
    const usedEventIds = new Set<number>()

    cards.forEach((card) => {
      const cardLessonNumText =
        card.querySelector('.calendar-event-lesson-number')?.textContent || ''
      const cardLessonNumMatch = cardLessonNumText.match(/\b(\d+)\b/)
      const cardPeriod = cardLessonNumMatch ? Number.parseInt(cardLessonNumMatch[1], 10) : null

      const cardThemeTitle = cleanText(
        card.querySelector('.calendar-event-theme-title')?.textContent || ''
      )
      const cardSubject = cleanText(
        card.querySelector('.calendar-event-subject')?.textContent || ''
      )
      const cardGroup = cleanText(card.querySelector('.calendar-event-group')?.textContent || '')

      // Find best matching event from API data for this day
      let bestMatch: LessonEventStatus | null = null
      let bestScore = 0

      for (const ev of dayEvents) {
        if (usedEventIds.has(ev.eventId)) continue

        let score = 0
        const evTheme = cleanText(ev.themeTitle)
        const evSubject = cleanText(ev.subjectName)
        const evGroup = cleanText(ev.groupText)

        // Period match (+10)
        if (cardPeriod !== null && ev.period !== undefined && cardPeriod === ev.period) {
          score += 10
        }

        // Group match (+10 exact, +6 partial)
        if (cardGroup && evGroup) {
          if (cardGroup === evGroup) {
            score += 10
          } else if (cardGroup.includes(evGroup) || evGroup.includes(cardGroup)) {
            score += 6
          }
        }

        // Theme title match (+8 exact/prefix, +5 contains)
        if (cardThemeTitle && evTheme) {
          if (cardThemeTitle === evTheme) {
            score += 8
          } else if (evTheme.startsWith(cardThemeTitle) || cardThemeTitle.startsWith(evTheme)) {
            score += 7
          } else if (evTheme.includes(cardThemeTitle) || cardThemeTitle.includes(evTheme)) {
            score += 5
          }
        }

        // Subject match (+4)
        if (cardSubject && evSubject && cardSubject === evSubject) {
          score += 4
        }

        if (score > bestScore) {
          bestScore = score
          bestMatch = ev
        }
      }

      // Minimum score to confirm a match (prevents matching unrelated empty slots)
      const match = bestScore >= 6 ? bestMatch : null
      if (match) {
        usedEventIds.add(match.eventId)
      }

      if (match) {
        const domHasUnpublished = cardHasUnpublishedHint(card)
        const domHasTask = cardHasTask(card)
        // If DOM has explicit unpublished hint, task/material is definitely not published
        const hasPublishedTask = !domHasUnpublished && (match.hasPublishedTask || domHasTask)

        // Tag card with event ID and date for inspection / debugging
        card.setAttribute('data-ha-event-id', String(match.eventId))
        card.setAttribute('data-ha-lesson-published', String(match.isLessonPublished))
        card.setAttribute('data-ha-task-published', String(hasPublishedTask))
        card.setAttribute('data-ha-dom-has-task', String(domHasTask))
        card.setAttribute('data-ha-dom-has-unpublished', String(domHasUnpublished))
        card.setAttribute('data-ha-event-date', match.dateStr || columnDateStr)

        const isCreated = isLessonCreated(card, match)
        const isJunior = isJuniorClass(cardGroup, match.groupNumber)
        // Task is expected for all secondary classes (grades 5-11)
        const isTaskExpected = !isJunior
        card.setAttribute('data-ha-task-expected', String(isTaskExpected))

        // 1. Unpublished / Uncreated lesson (заняття) check: past, today, or tomorrow
        const isDue = isPastTodayOrTomorrow(
          match.dateStr || columnDateStr,
          match.dateStart,
          match.dateStartTimestamp
        )
        card.setAttribute('data-ha-is-due', String(isDue))
        // Lesson slot exists without created theme
        const isLessonUncreated = !isCreated && isDue
        // Created lesson where material is not published (published !== 2 or DOM has unpublished hint)
        const isLessonUnpublished =
          isCreated &&
          (!match.isLessonPublished || (domHasUnpublished && !match.hasLessonTask)) &&
          isDue

        // 2. Missing task (завдання) check: lesson ended 3+ hours ago and task is not published
        const isLessonEnded = isLessonEndedHoursAgo(
          match.dateFinish,
          match.dateStart,
          3,
          match.dateEndTimestamp,
          match.dateStartTimestamp,
          match.dateStr || columnDateStr
        )
        const isTaskMissing = isCreated && isTaskExpected && !hasPublishedTask && isLessonEnded

        debugRows.push({
          Урок: (cardThemeTitle || cardSubject).slice(0, 32),
          Клас: cardGroup,
          День: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'][colIndex] || colIndex,
          'API Event': match.eventId,
          Створено: isCreated,
          'Опубл (урок)': match.isLessonPublished ? 'ТАК' : 'НІ',
          'Передбач завд': isTaskExpected ? 'ТАК' : 'НІ',
          'Завдання (API)': match.hasPublishedTask ? 'ТАК' : 'НІ',
          'Завдання (DOM)': domHasTask ? 'ТАК' : 'НІ',
          'Неопубл (DOM)': domHasUnpublished ? 'ТАК' : 'НІ',
          'Разом завдання': hasPublishedTask ? 'ТАК' : 'НІ',
          '>3 год тому': isLessonEnded ? 'ТАК' : 'НІ',
          'Час заверш': match.dateFinish || match.dateStart || '—',
          '🔴 УРОК': isLessonUncreated ? 'НЕ СТВОРЕНО' : isLessonUnpublished ? 'НЕ ОПУБЛ' : 'OK',
          '🟠 ЗАВДАННЯ': isTaskMissing ? 'НЕ ВИДАНО' : isTaskExpected ? 'OK' : 'НЕ ПЕРЕДБАЧЕНО',
        })

        // Inscriptions (приписки) positioned absolute in the bottom-right corner of the card
        card.removeAttribute('data-ha-tooltip')

        // Clear existing notes in this card before updating
        card.querySelectorAll('.ha-card-notes-container, .ha-card-note').forEach((el) => {
          el.remove()
        })

        if (isLessonUncreated || isLessonUnpublished || isTaskMissing) {
          if (window.getComputedStyle(card).position === 'static') {
            card.style.position = 'relative'
          }
          const notesContainer = document.createElement('div')
          notesContainer.className = 'ha-card-notes-container'

          if (isLessonUncreated) {
            const uncreatedNote = document.createElement('span')
            uncreatedNote.className = 'ha-card-note ha-card-note--uncreated'
            uncreatedNote.textContent = 'урок не створено'
            notesContainer.appendChild(uncreatedNote)
          } else if (isLessonUnpublished) {
            const lessonNote = document.createElement('span')
            lessonNote.className = 'ha-card-note ha-card-note--lesson'
            lessonNote.textContent = 'урок не опубліковано'
            notesContainer.appendChild(lessonNote)
          }

          if (isTaskMissing) {
            const taskNote = document.createElement('span')
            taskNote.className = 'ha-card-note ha-card-note--task'
            taskNote.textContent = 'завдання не видано'
            notesContainer.appendChild(taskNote)
          }

          card.appendChild(notesContainer)
        }

        // Background highlight: only for unpublished lessons (do NOT add background for uncreated lessons)
        if (isLessonUnpublished) {
          card.classList.add('ha-lesson-unpublished')
        } else {
          card.classList.remove('ha-lesson-unpublished')
        }

        if (isLessonUncreated) {
          card.classList.add('ha-lesson-uncreated')
        } else {
          card.classList.remove('ha-lesson-uncreated')
        }

        if (isTaskMissing) {
          card.classList.add('ha-task-missing')
        } else {
          card.classList.remove('ha-task-missing')
        }

        // Self-study icon logic: ONLY when lesson is created AND has no video conference (confirmed by API and DOM)
        const hasVideo = Boolean(match.hasWebConference || cardHasVideoConference(card))
        if (isCreated && !hasVideo) {
          if (!card.classList.contains('ha-self-study-lesson')) {
            card.classList.add('ha-self-study-lesson')
          }
          let footerLeft = card.querySelector<HTMLElement>('.calendar-event__footer-left')
          if (!footerLeft) {
            let footer = card.querySelector<HTMLElement>('.calendar-event__footer')
            if (!footer) {
              footer = document.createElement('div')
              footer.className = 'calendar-event__footer'
              card.appendChild(footer)
            }
            footerLeft = document.createElement('div')
            footerLeft.className = 'calendar-event__footer-left'
            footer.prepend(footerLeft)
          }
          if (footerLeft && !footerLeft.getAttribute('title')) {
            footerLeft.setAttribute('title', 'Самостійний урок (відеоконференція відсутня)')
          }
        } else {
          card.classList.remove('ha-self-study-lesson')
          const footerLeft = card.querySelector<HTMLElement>('.calendar-event__footer-left')
          if (
            footerLeft?.getAttribute('title') === 'Самостійний урок (відеоконференція відсутня)'
          ) {
            footerLeft.removeAttribute('title')
          }
        }
      } else {
        // No match found in API data (lesson event was not found or not matched)
        const isCreated = isLessonCreated(card)
        const hasAddTheme = Boolean(
          card.querySelector(
            '.calendar-event-add-theme, [class*="add-theme"], [class*="create-theme"]'
          ) || card.classList.contains('calendar-event--dummy')
        )
        const isScheduledSlot = Boolean(cardGroup || cardSubject || hasAddTheme)

        // Scheduled lesson slot in the timetable without created theme is uncreated!
        const isDue = columnDateStr ? isPastTodayOrTomorrow(columnDateStr) : false
        card.setAttribute('data-ha-is-due', String(isDue))
        const isLessonUncreated = !isCreated && isScheduledSlot && isDue

        debugRows.push({
          Урок: (cardThemeTitle || cardSubject || 'Додати тему').slice(0, 32),
          Клас: cardGroup || '—',
          День: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'][colIndex] || colIndex,
          'API Event': 'НЕ СТВОРЕНО',
          Створено: isCreated,
          'Опубл (урок)': isLessonUncreated ? 'НЕ СТВОРЕНО' : isCreated ? 'СТВОРЕНО' : '—',
          'Передбач завд': '—',
          'Завдання (API)': '—',
          'Завдання (DOM)': false,
          'Разом завдання': '—',
          '>3 год тому': '—',
          'Час заверш': '—',
          '🔴 УРОК': isLessonUncreated ? 'НЕ СТВОРЕНО' : 'OK',
          '🟠 ЗАВДАННЯ': 'OK',
        })

        card.removeAttribute('data-ha-tooltip')

        // Clear existing notes in this card before updating
        card.querySelectorAll('.ha-card-notes-container, .ha-card-note').forEach((el) => {
          el.remove()
        })

        if (isLessonUncreated) {
          if (window.getComputedStyle(card).position === 'static') {
            card.style.position = 'relative'
          }
          const notesContainer = document.createElement('div')
          notesContainer.className = 'ha-card-notes-container'

          const lessonNote = document.createElement('span')
          lessonNote.className = 'ha-card-note ha-card-note--uncreated'
          lessonNote.textContent = 'урок не створено'
          notesContainer.appendChild(lessonNote)

          card.appendChild(notesContainer)
          card.classList.add('ha-lesson-uncreated')
        } else {
          card.classList.remove('ha-lesson-uncreated')
        }

        // Ensure background is NOT added for uncreated lessons
        card.classList.remove('ha-lesson-unpublished')
        card.classList.remove('ha-task-missing')

        // Self-study icon logic: ONLY when lesson is created AND has no video conference (DOM check)
        const hasVideo = cardHasVideoConference(card)
        if (isCreated && !hasVideo) {
          if (!card.classList.contains('ha-self-study-lesson')) {
            card.classList.add('ha-self-study-lesson')
          }
          let footerLeft = card.querySelector<HTMLElement>('.calendar-event__footer-left')
          if (!footerLeft) {
            let footer = card.querySelector<HTMLElement>('.calendar-event__footer')
            if (!footer) {
              footer = document.createElement('div')
              footer.className = 'calendar-event__footer'
              card.appendChild(footer)
            }
            footerLeft = document.createElement('div')
            footerLeft.className = 'calendar-event__footer-left'
            footer.prepend(footerLeft)
          }
          if (footerLeft && !footerLeft.getAttribute('title')) {
            footerLeft.setAttribute('title', 'Самостійний урок (відеоконференція відсутня)')
          }
        } else {
          card.classList.remove('ha-self-study-lesson')
          const footerLeft = card.querySelector<HTMLElement>('.calendar-event__footer-left')
          if (
            footerLeft?.getAttribute('title') === 'Самостійний урок (відеоконференція відсутня)'
          ) {
            footerLeft.removeAttribute('title')
          }
        }
      }

      // Cleanup legacy DOM badges if any exist
      card.querySelectorAll('.ha-self-study-badge').forEach((el) => {
        el.remove()
      })
    })

    // Clear day column highlight if any residue exists
    if (col.classList.contains('ha-day-has-unpublished')) {
      col.classList.remove('ha-day-has-unpublished')
    }
  })

  if (debugRows.length > 0) {
    console.groupCollapsed('📋 [Human Boost] Дебаг карток розкладу (статуси уроків і завдань)')
    console.table(debugRows)
    console.log('💡 Для примусового оновлення викличте у консолі: haDebugCalendar()')
    console.groupEnd()
  }
}
