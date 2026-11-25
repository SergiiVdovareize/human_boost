import type { CalendarApiResponse, LessonEventStatus } from './types'

export const calendarState = {
  lastFetchedUrl: null as string | null,
  lastKnownCalendarApiUrl: null as string | null,
  lastRawApiData: null as CalendarApiResponse | null,
  cachedEventsStatus: [] as LessonEventStatus[],
  isFetching: false,
  pendingRefetch: false,
  isWeekLoading: false,
  lastNavTime: 0,
  loadingTimeout: null as ReturnType<typeof setTimeout> | null,
  lastWeekSignature: '',
  performanceObserver: null as PerformanceObserver | null,
  domMutationObserver: null as MutationObserver | null,
  navClickListener: null as ((e: MouseEvent) => void) | null,
  visibilityListener: null as (() => void) | null,
  calendarPollInterval: null as ReturnType<typeof setInterval> | null,
  syncTimers: [] as Array<ReturnType<typeof setTimeout>>,
  taskSyncTimers: [] as Array<ReturnType<typeof setTimeout>>,
}

/**
 * Toggles the calendar loading state and manages body.ha-calendar-week-loading class.
 */
export function setCalendarLoadingState(loading: boolean): void {
  calendarState.isWeekLoading = loading
  if (loading) {
    document.body.classList.add('ha-calendar-week-loading')
    if (calendarState.loadingTimeout) clearTimeout(calendarState.loadingTimeout)
    calendarState.loadingTimeout = setTimeout(() => {
      setCalendarLoadingState(false)
    }, 4000)
  } else {
    document.body.classList.remove('ha-calendar-week-loading')
    if (calendarState.loadingTimeout) {
      clearTimeout(calendarState.loadingTimeout)
      calendarState.loadingTimeout = null
    }
  }
}
