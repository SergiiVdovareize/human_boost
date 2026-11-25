import { isJuniorClass, isTaskIssued } from './rules'
import { calendarState } from './state'
import type { CalendarApiResponse, LessonEventStatus } from './types'

let syncCallback: (() => Promise<void> | void) | null = null

export function registerCalendarSyncCallback(cb: () => Promise<void> | void): void {
  syncCallback = cb
}

/**
 * Finds the latest calendar API URL from the browser's performance resource timing buffer.
 * If sinceTimestamp is specified, entries that started before sinceTimestamp - 100ms are ignored (stale).
 */
export function findCalendarApiUrl(sinceTimestamp = 0): string | null {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry.name.includes('/calendar?') || entry.name.includes('/calendar')) {
      if (sinceTimestamp > 0 && entry.startTime < sinceTimestamp - 100) {
        continue
      }
      return entry.name
    }
  }
  return null
}

/**
 * Fetches calendar data for a specific API URL and parses lesson events.
 */
export async function fetchCalendarEventsStatusForUrl(
  apiUrl: string,
  force = false
): Promise<LessonEventStatus[]> {
  if (!apiUrl) {
    return []
  }

  if (
    !force &&
    apiUrl === calendarState.lastFetchedUrl &&
    calendarState.cachedEventsStatus.length > 0
  ) {
    return calendarState.cachedEventsStatus
  }

  if (calendarState.isFetching) {
    if (force) {
      calendarState.pendingRefetch = true
    }
    return calendarState.cachedEventsStatus
  }

  try {
    calendarState.isFetching = true
    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    })

    if (!response.ok) {
      console.warn('[Human Boost] Calendar API returned non-OK status:', response.status)
      return calendarState.cachedEventsStatus
    }

    const data = (await response.json()) as CalendarApiResponse
    calendarState.lastFetchedUrl = apiUrl
    calendarState.lastKnownCalendarApiUrl = apiUrl
    calendarState.cachedEventsStatus = parseCalendarApiResponse(data)
    return calendarState.cachedEventsStatus
  } catch (err) {
    console.error('[Human Boost] Failed to fetch calendar API data:', err)
    return calendarState.cachedEventsStatus
  } finally {
    calendarState.isFetching = false
    if (calendarState.pendingRefetch) {
      calendarState.pendingRefetch = false
      setTimeout(() => {
        if (syncCallback) {
          syncCallback()
        }
      }, 100)
    }
  }
}

/**
 * Fetches calendar data from API and computes published status for every lesson event.
 */
export async function fetchCalendarEventsStatus(force = false): Promise<LessonEventStatus[]> {
  if (force) {
    calendarState.lastFetchedUrl = null
  }
  const apiUrl =
    findCalendarApiUrl(calendarState.isWeekLoading ? calendarState.lastNavTime : 0) ||
    calendarState.lastKnownCalendarApiUrl ||
    calendarState.lastFetchedUrl

  if (!apiUrl) {
    return calendarState.isWeekLoading ? [] : calendarState.cachedEventsStatus
  }
  calendarState.lastKnownCalendarApiUrl = apiUrl
  return fetchCalendarEventsStatusForUrl(apiUrl, force)
}

/**
 * Parses the raw API JSON into structured lesson events with lesson publish status.
 */
export function parseCalendarApiResponse(data: CalendarApiResponse): LessonEventStatus[] {
  // 1. Map theme titles: themeId -> title
  const themeMap = new Map<number, string>()
  if (Array.isArray(data.themes)) {
    for (const t of data.themes) {
      if (t.id && t.title) {
        themeMap.set(t.id, t.title.trim())
      }
    }
  }

  // 2. Map schedule helper period numbers: helperId -> period
  const scheduleHelperPeriodMap = new Map<number, number>()
  if (Array.isArray(data.scheduleHelpers)) {
    for (const sh of data.scheduleHelpers) {
      if (sh.id && typeof sh.period === 'number') {
        scheduleHelperPeriodMap.set(sh.id, sh.period)
      }
    }
  }

  // 3. Map tasks:
  // Lesson material ("Заняття"): type_id === 10 (or type.name === 'Заняття' or category === 3)
  const lessonTaskPublishMap = new Map<number, boolean>()
  // Tasks/assignments ("Завдання", "Домашнє завдання"): any other task attached to the theme or event
  const taskPublishMap = new Map<number, boolean>()
  const eventTaskPublishMap = new Map<number, boolean>()
  const hasTaskMap = new Map<number, boolean>()

  // A) Dedicated homeTasks array: each record represents homework/task
  if (Array.isArray(data.homeTasks)) {
    for (const ht of data.homeTasks) {
      if (!ht) continue
      const issued = isTaskIssued(ht)
      if (ht.theme_id) {
        hasTaskMap.set(ht.theme_id, true)
        if (issued) {
          taskPublishMap.set(ht.theme_id, true)
        }
      }
      const evId = ht.lesson_event_id || ht.event_id
      if (evId && issued) {
        eventTaskPublishMap.set(evId, true)
      }
    }
  }

  // B) userHomeTasks array (active homework instances)
  if (Array.isArray(data.userHomeTasks)) {
    for (const uht of data.userHomeTasks) {
      if (!uht) continue
      const issued = isTaskIssued(uht)
      if (uht.theme_id) {
        hasTaskMap.set(uht.theme_id, true)
        if (issued) {
          taskPublishMap.set(uht.theme_id, true)
        }
      }
    }
  }

  // C) Generic tasks array (if present in API)
  if (Array.isArray(data.tasks)) {
    for (const t of data.tasks) {
      if (!t) continue
      const issued = isTaskIssued(t)
      const themeId = (t.theme_id || t.themeId) as number | undefined
      if (themeId) {
        hasTaskMap.set(themeId, true)
        if (issued) {
          taskPublishMap.set(themeId, true)
        }
      }
      const evId = (t.lesson_event_id || t.event_id) as number | undefined
      if (evId && issued) {
        eventTaskPublishMap.set(evId, true)
      }
    }
  }

  // D) lessonTasks array: differentiates between lesson materials (type 10) and tasks (other types)
  if (Array.isArray(data.lessonTasks)) {
    for (const lt of data.lessonTasks) {
      if (!lt) continue

      const isLessonType =
        lt.type_id === 10 ||
        lt.type?.id === 10 ||
        lt.type?.name?.toLowerCase() === 'заняття' ||
        lt.type?.category === 3

      if (isLessonType) {
        if (lt.theme_id) {
          // published === 2 means published; 1 means draft/unpublished
          const isPub = lt.published === 2 || (Boolean(lt.published_at) && lt.published !== 1)
          const existing = lessonTaskPublishMap.get(lt.theme_id)
          if (existing === undefined) {
            lessonTaskPublishMap.set(lt.theme_id, isPub)
          } else if (!isPub) {
            lessonTaskPublishMap.set(lt.theme_id, false)
          }
        }
      } else {
        // It's a task/assignment inside lessonTasks
        const issued = isTaskIssued(lt)
        if (lt.theme_id) {
          hasTaskMap.set(lt.theme_id, true)
          if (issued) {
            taskPublishMap.set(lt.theme_id, true)
          }
        }
        const evId = lt.lesson_event_id || lt.event_id
        if (evId && issued) {
          eventTaskPublishMap.set(evId, true)
        }
      }
    }
  }

  calendarState.lastRawApiData = data

  console.groupCollapsed('🗓️ [Human Boost] Calendar API: дані розкладу')
  console.log('Ключі об’єкта API:', Object.keys(data))
  console.log(`Уроків (lessonEvents): ${data.lessonEvents?.length ?? 0}`)
  console.log(`Занять (lessonTasks): ${data.lessonTasks?.length ?? 0}`)
  console.log(`Домашніх завдань (homeTasks): ${data.homeTasks?.length ?? 0}`)
  console.groupEnd()

  // 4. Process lessonEvents
  const results: LessonEventStatus[] = []
  if (Array.isArray(data.lessonEvents)) {
    for (const ev of data.lessonEvents) {
      const themeId = ev.theme_id
      const themeTitle = themeMap.get(themeId) || ''
      const period = ev.schedule_helper_id
        ? scheduleHelperPeriodMap.get(ev.schedule_helper_id)
        : undefined
      const hasLessonTask = lessonTaskPublishMap.has(themeId)
      // In HUMAN, a lesson with a planned theme has a lessonTask.
      const isLessonPublished = hasLessonTask ? (lessonTaskPublishMap.get(themeId) ?? false) : true

      const dateStartStr = ev.date_start || ''
      const dateFinishStr = ev.date_finish || ''
      const dateStartTimestamp = ev.date
      const dateEndTimestamp = ev.date_end

      // Compute UTC date string YYYY-MM-DD and Day of week (0 = Mon, ..., 6 = Sun)
      let dateStr = ''
      let dayOfWeek = 0

      if (dateStartTimestamp) {
        const d = new Date(dateStartTimestamp * 1000)
        dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        dayOfWeek = (d.getUTCDay() + 6) % 7
      } else if (dateStartStr) {
        const utcStr = dateStartStr.includes('Z')
          ? dateStartStr
          : `${dateStartStr.replace(' ', 'T')}Z`
        const d = new Date(utcStr)
        if (!Number.isNaN(d.getTime())) {
          dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
          dayOfWeek = (d.getUTCDay() + 6) % 7
        } else {
          dateStr = dateStartStr.split(' ')[0] || ''
        }
      }

      // Group text description (e.g. "6Б (2 група)")
      const num = typeof ev.group?.number === 'number' ? ev.group.number : undefined
      const letterCode = ev.group?.letter ?? null
      const letterStr =
        letterCode === 0 ? 'А' : letterCode === 1 ? 'Б' : letterCode === 2 ? 'В' : ''
      const subgroupStr = ev.group?.subgroup ? ` (${ev.group.subgroup} група)` : ''
      const groupText = `${num ?? ''}${letterStr}${subgroupStr}`.trim()

      const subjectName = ev.group?.subject?.i18n?.name || ''
      const hasWebConference = Boolean(ev.webConference)

      // Direct task flags on lessonEvent in API — ONLY count issued/published tasks
      const evHasIssuedTask =
        (Array.isArray(ev.homeTasks) && ev.homeTasks.some(isTaskIssued)) ||
        (Array.isArray(ev.tasks) && ev.tasks.some(isTaskIssued)) ||
        (Array.isArray(ev.lessonTasks) &&
          ev.lessonTasks.some((t: any) => t.type_id !== 10 && t.type?.id !== 10 && isTaskIssued(t)))

      const hasPublishedTask =
        Boolean(taskPublishMap.get(themeId)) ||
        Boolean(eventTaskPublishMap.get(ev.id)) ||
        evHasIssuedTask

      const hasTaskInCurriculum = Boolean(hasTaskMap.get(themeId)) || evHasIssuedTask
      const isJunior = isJuniorClass(groupText, num)
      // In Ukrainian schools, any class from grade 5 upwards expects homework/tasks to be issued
      const isTaskExpected = !isJunior

      results.push({
        eventId: ev.id,
        themeId,
        themeTitle,
        subjectName,
        groupText,
        groupNumber: num,
        period,
        dateStart: dateStartStr,
        dateFinish: dateFinishStr,
        dateStartTimestamp,
        dateEndTimestamp,
        dateStr,
        dayOfWeek,
        isLessonPublished,
        hasLessonTask,
        hasPublishedTask,
        hasTask: hasTaskInCurriculum,
        isTaskExpected,
        hasWebConference,
      })
    }
  }

  return results
}
