import {
  fetchCalendarEventsStatus,
  fetchCalendarEventsStatusForUrl,
  findCalendarApiUrl,
  registerCalendarSyncCallback,
} from './client'
import {
  applyUnpublishedHighlights,
  clearAllCalendarHighlights,
  doesStatusMatchVisibleWeek,
} from './dom'
import { calendarState, setCalendarLoadingState } from './state'

/**
 * Computes a unique signature for the currently rendered calendar week / dates.
 */
export function getCalendarWeekSignature(): string {
  const dayTitles = Array.from(document.querySelectorAll('.calendar-day-title'))
    .map((el) => el.textContent?.trim().replace(/\s+/g, ' ') || '')
    .filter(Boolean)
  const headerPeriod =
    document
      .querySelector(
        '[class*="calendar"] [class*="period"], [class*="calendar"] [class*="date"], .calendar-header'
      )
      ?.textContent?.trim()
      .replace(/\s+/g, ' ') || ''
  return `${headerPeriod}::${dayTitles.join('|')}`
}

/**
 * Clears any pending scheduled sync timers.
 */
export function clearScheduledSyncTimers(): void {
  for (const t of calendarState.syncTimers) {
    clearTimeout(t)
  }
  calendarState.syncTimers = []
}

/**
 * Clears any pending debounced task sync timers.
 */
export function clearTaskSyncTimers(): void {
  for (const t of calendarState.taskSyncTimers) {
    clearTimeout(t)
  }
  calendarState.taskSyncTimers = []
}

/**
 * Schedules debounced re-sync passes to pick up newly issued or published tasks/lessons
 * after user actions (form submissions, dialog closes, API requests).
 */
export function scheduleTaskSyncDebounced(): void {
  clearTaskSyncTimers()

  const delays = [300, 1000, 2500]
  for (const delay of delays) {
    const timer = setTimeout(async () => {
      if (!calendarState.isWeekLoading) {
        await syncAndHighlightCalendar(true)
      }
    }, delay)
    calendarState.taskSyncTimers.push(timer)
  }
}

/**
 * Schedules multiple sync passes (with increasing delays) to catch
 * the asynchronous network response and subsequent Angular DOM render
 * after switching the week or date.
 */
export function scheduleWeekSyncCycle(): void {
  clearScheduledSyncTimers()

  const delays = [50, 150, 300, 600, 1000, 1600, 2500]
  for (const delay of delays) {
    const timer = setTimeout(async () => {
      // Check if visible week signature changed
      checkWeekChangeAndSync()

      const currentApiUrl =
        findCalendarApiUrl(calendarState.isWeekLoading ? calendarState.lastNavTime : 0) ||
        calendarState.lastKnownCalendarApiUrl

      if (currentApiUrl) {
        const isNewApiUrl = currentApiUrl !== calendarState.lastFetchedUrl
        if (
          isNewApiUrl ||
          calendarState.isWeekLoading ||
          calendarState.cachedEventsStatus.length === 0
        ) {
          const status = await fetchCalendarEventsStatusForUrl(currentApiUrl)
          if (status.length > 0 && doesStatusMatchVisibleWeek(status)) {
            setCalendarLoadingState(false)
            applyUnpublishedHighlights(status)
          }
        } else if (
          calendarState.cachedEventsStatus.length > 0 &&
          doesStatusMatchVisibleWeek(calendarState.cachedEventsStatus)
        ) {
          applyUnpublishedHighlights(calendarState.cachedEventsStatus)
        }
      }
    }, delay)
    calendarState.syncTimers.push(timer)
  }
}

/**
 * Checks if the visible calendar week or dates have changed.
 * If changed, immediately turns off all highlights and schedules a sync cycle.
 */
export function checkWeekChangeAndSync(): boolean {
  const currentSig = getCalendarWeekSignature()
  if (currentSig && currentSig !== calendarState.lastWeekSignature) {
    calendarState.lastWeekSignature = currentSig
    // Immediately clear all highlights and self-study icons by default upon week change
    clearAllCalendarHighlights()
    setCalendarLoadingState(true)
    calendarState.lastNavTime = performance.now()
    calendarState.lastFetchedUrl = null
    calendarState.cachedEventsStatus = []
    scheduleWeekSyncCycle()
    return true
  }
  return false
}

/**
 * Runs full update cycle: fetches API data (or uses cache) and highlights cards.
 */
export async function syncAndHighlightCalendar(force = false): Promise<void> {
  const status = await fetchCalendarEventsStatus(force)
  applyUnpublishedHighlights(status)
}

// Wire pending refetches in client to syncAndHighlightCalendar
registerCalendarSyncCallback(() => syncAndHighlightCalendar(true))

/**
 * Initializes automatic observation of calendar page changes:
 * - Detects date and week navigation changes
 * - Listens for new calendar API requests
 * - Re-applies highlighting when Angular re-renders cards
 */
export function initCalendarAutomation(): void {
  destroyCalendarAutomation()

  calendarState.lastWeekSignature = getCalendarWeekSignature()

  // Initial sync attempt
  scheduleWeekSyncCycle()

  // 1. Performance observer for completed API requests
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      calendarState.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const name = entry.name

          // A) Calendar API response finished
          if (name.includes('/calendar?') || name.includes('/calendar')) {
            if (
              calendarState.lastNavTime > 0 &&
              entry.startTime < calendarState.lastNavTime - 100
            ) {
              continue
            }
            const apiUrl = name
            calendarState.lastKnownCalendarApiUrl = apiUrl
            setTimeout(async () => {
              const status = await fetchCalendarEventsStatusForUrl(apiUrl, true)
              if (status.length > 0 && doesStatusMatchVisibleWeek(status)) {
                setCalendarLoadingState(false)
                applyUnpublishedHighlights(status)
              }
            }, 50)
            break
          }

          // B) Task API request finished (e.g. creating/updating/publishing tasks)
          const isTaskApi =
            (name.includes('/task') ||
              name.includes('/lesson-task') ||
              name.includes('/homework')) &&
            !name.match(/\.(js|css|svg|png|jpg|webp|woff2?|ico|html)($|\?)/i)

          if (isTaskApi) {
            scheduleTaskSyncDebounced()
            break
          }
        }
      })
      calendarState.performanceObserver.observe({ entryTypes: ['resource'] })
    } catch (e) {
      console.debug('[Human Boost] PerformanceObserver not supported for resource timings:', e)
    }
  }

  // 2. Click listener on navigation elements and action buttons
  calendarState.navClickListener = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return

    // Detect clicks on action buttons inside modals/drawers that save or issue tasks/lessons
    const isTaskActionClick = Boolean(
      target.closest(
        '.mat-dialog-actions, [class*="dialog-actions"], .cdk-overlay-pane button, mat-dialog-container button, [role="dialog"] button, .mat-drawer button'
      ) && target.closest('button')?.textContent?.match(/(видати|опублікува|зберег|створит)/i)
    )

    if (isTaskActionClick) {
      scheduleTaskSyncDebounced()
    }

    // Never trigger week reset on lesson cards, calendar event containers, schedule days, dialogs, or extension UI
    if (
      target.closest(
        '.calendar-event, [class*="calendar-event"], .calendar-events-container, .calendar-day-of-week, .calendar-events-day, #human-automator, #human-automator-app, .ha-side-panel, .ha-modal-root, [class*="dialog"], [role="dialog"], [class*="dropdown"], [class*="menu"], [class*="popover"]'
      )
    ) {
      return
    }

    // Strictly check for week/date navigation controls in the calendar header or datepicker popup
    const isNav = Boolean(
      target.closest(
        '.calendar-header, [class*="calendar-header"], [class*="calendar-controls"], [class*="calendar-week__header"], .mat-calendar, [class*="mat-calendar"]'
      )
    )

    if (isNav) {
      // Immediately turn off all highlights and self-study icons by default on week navigation click
      clearAllCalendarHighlights()
      setCalendarLoadingState(true)
      calendarState.lastNavTime = performance.now()
      calendarState.lastFetchedUrl = null
      calendarState.cachedEventsStatus = []
      scheduleWeekSyncCycle()
    }
  }
  document.addEventListener('click', calendarState.navClickListener, true)

  // 3. Tab visibility listener to re-sync when switching back to the tab
  calendarState.visibilityListener = () => {
    if (document.visibilityState === 'visible' && !calendarState.isWeekLoading) {
      scheduleTaskSyncDebounced()
    }
  }
  document.addEventListener('visibilitychange', calendarState.visibilityListener)

  // 4. Periodic polling every 30 seconds while active and visible
  calendarState.calendarPollInterval = setInterval(() => {
    if (
      document.visibilityState === 'visible' &&
      !calendarState.isWeekLoading &&
      !calendarState.isFetching
    ) {
      syncAndHighlightCalendar(true)
    }
  }, 30000)

  // 5. DOM mutation observer for Angular card, week, and modal changes
  let renderDebounce: ReturnType<typeof setTimeout> | null = null
  calendarState.domMutationObserver = new MutationObserver((mutations) => {
    // Check if week header changed
    const weekChanged = checkWeekChangeAndSync()
    if (weekChanged) return

    // If currently loading a new week, keep all highlights cleared
    if (calendarState.isWeekLoading) {
      clearAllCalendarHighlights()
      return
    }

    // Check if a modal/dialog/drawer overlay was closed
    const hadOverlayClosed = mutations.some((m) => {
      if (m.type === 'childList') {
        return Array.from(m.removedNodes).some((node) => {
          if (node instanceof HTMLElement) {
            return (
              node.classList.contains('mat-dialog-container') ||
              (node.classList.contains('cdk-overlay-pane') &&
                Boolean(node.querySelector?.('mat-dialog-container, [role="dialog"], form'))) ||
              node.getAttribute('role') === 'dialog'
            )
          }
          return false
        })
      }
      return false
    })

    if (hadOverlayClosed) {
      scheduleTaskSyncDebounced()
    }

    // Only react to real calendar card insertion or removal
    const hasCardChanges = mutations.some((m) => {
      if (m.type === 'childList') {
        const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]
        return nodes.some((node) => {
          if (node instanceof HTMLElement) {
            return (
              node.classList.contains('calendar-event') ||
              node.classList.contains('calendar-events-container') ||
              node.classList.contains('calendar-day-of-week') ||
              Boolean(node.querySelector?.('.calendar-event'))
            )
          }
          return false
        })
      }
      return false
    })

    if (!hasCardChanges) return

    if (renderDebounce) clearTimeout(renderDebounce)
    renderDebounce = setTimeout(() => {
      if (calendarState.isWeekLoading) return

      if (
        calendarState.cachedEventsStatus.length > 0 &&
        doesStatusMatchVisibleWeek(calendarState.cachedEventsStatus)
      ) {
        applyUnpublishedHighlights(calendarState.cachedEventsStatus)
      } else {
        scheduleWeekSyncCycle()
      }
    }, 200)
  })

  const target = document.querySelector('.calendar-container, [class*="calendar"]') || document.body
  calendarState.domMutationObserver.observe(target, { childList: true, subtree: true })
}

/**
 * Destroys calendar observers and listeners.
 */
export function destroyCalendarAutomation(): void {
  clearScheduledSyncTimers()
  clearTaskSyncTimers()
  if (calendarState.navClickListener) {
    document.removeEventListener('click', calendarState.navClickListener, true)
    calendarState.navClickListener = null
  }
  if (calendarState.visibilityListener) {
    document.removeEventListener('visibilitychange', calendarState.visibilityListener)
    calendarState.visibilityListener = null
  }
  if (calendarState.calendarPollInterval) {
    clearInterval(calendarState.calendarPollInterval)
    calendarState.calendarPollInterval = null
  }
  if (calendarState.performanceObserver) {
    calendarState.performanceObserver.disconnect()
    calendarState.performanceObserver = null
  }
  if (calendarState.domMutationObserver) {
    calendarState.domMutationObserver.disconnect()
    calendarState.domMutationObserver = null
  }
  setCalendarLoadingState(false)
  clearAllCalendarHighlights()
  calendarState.lastFetchedUrl = null
  calendarState.cachedEventsStatus = []
  calendarState.lastNavTime = 0
  calendarState.lastWeekSignature = ''
}

// Global debug helpers accessible from browser DevTools console
if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>
  win.haDebugCalendar = () => {
    console.log('🔄 [Human Boost] Примусова синхронізація розкладу...')
    syncAndHighlightCalendar(true)
  }
  win.haCalendarStatus = () => calendarState.cachedEventsStatus
  win.haRawCalendarData = () => calendarState.lastRawApiData

  // Allow invoking from DevTools console even when context is "top"
  window.addEventListener('message', (event) => {
    if (event.data === 'ha:debug-calendar') {
      console.log('🔄 [Human Boost] Отримано команду ha:debug-calendar...')
      syncAndHighlightCalendar(true)
    }
  })
  document.addEventListener('ha:debug-calendar', () => {
    console.log('🔄 [Human Boost] Отримано подію ha:debug-calendar...')
    syncAndHighlightCalendar(true)
  })
}
