import type { LessonEventStatus } from './types'

/**
 * Normalizes text for lenient fuzzy matching.
 */
export function cleanText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[«»""''`\s\u00A0]+/g, ' ')
    .trim()
}

/**
 * Helper to check whether a task/homework object is actually issued/assigned to students.
 * Drafts (published === 1) and template syllabus objects (_recipients === "a:0:{}") are NOT issued.
 */
export function isTaskIssued(task: any): boolean {
  if (!task) return false

  // Explicit draft status (published === 1) is NEVER issued/published
  if (task.published === 1) {
    return false
  }

  // 1. Explicitly published status (published === 2) or has published_at timestamp
  if (task.published === 2 || (Boolean(task.published_at) && task.published !== 1)) {
    return true
  }

  // 2. Check _recipients string (serialized PHP array, e.g. "a:11:{...}" vs "a:0:{}")
  const rec = task._recipients
  if (typeof rec === 'string') {
    const trimmed = rec.trim()
    if (trimmed && trimmed !== 'a:0:{}' && !trimmed.startsWith('a:0:')) {
      return true
    }
  } else if (Array.isArray(rec) && rec.length > 0) {
    return true
  } else if (rec && typeof rec === 'object' && Object.keys(rec).length > 0) {
    return true
  }

  // 3. Check recipients array or recipients_count
  if (Array.isArray(task.recipients) && task.recipients.length > 0) {
    return true
  }
  if (typeof task.recipients_count === 'number' && task.recipients_count > 0) {
    return true
  }

  return false
}

/**
 * Checks if the lesson date is in the past, today, or tomorrow (inclusive).
 * Lessons scheduled for the day after tomorrow or later return false.
 */
export function isPastTodayOrTomorrow(
  dateStr: string,
  dateStartStr?: string,
  dateStartTimestamp?: number
): boolean {
  const now = new Date()
  // End of tomorrow in local time: 23:59:59.999
  const tomorrowEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    23,
    59,
    59,
    999
  )

  if (dateStartTimestamp && dateStartTimestamp > 0) {
    const startMs = dateStartTimestamp < 1e11 ? dateStartTimestamp * 1000 : dateStartTimestamp
    return startMs <= tomorrowEnd.getTime()
  }

  if (dateStr) {
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      const lessonDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0)
      return lessonDate.getTime() <= tomorrowEnd.getTime()
    }
  }

  if (dateStartStr) {
    const utcStr = dateStartStr.includes('Z') ? dateStartStr : `${dateStartStr.replace(' ', 'T')}Z`
    const lessonDate = new Date(utcStr)
    if (!Number.isNaN(lessonDate.getTime())) {
      return lessonDate.getTime() <= tomorrowEnd.getTime()
    }
  }

  return true
}

/**
 * Checks if the lesson ended (hours ago or on a past calendar day).
 * Uses exact unix timestamps, human.ua UTC date strings, or calendar day dateStr.
 */
export function isLessonEndedHoursAgo(
  dateFinish?: string,
  dateStart?: string,
  hours = 0,
  dateEndTimestamp?: number,
  dateStartTimestamp?: number,
  dateStr?: string
): boolean {
  // If the lesson date is before today in calendar dates, it definitely ended on a past day
  if (dateStr) {
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      const now = new Date()
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      ).getTime()
      const lessonDayEnd = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime()
      if (lessonDayEnd < todayStart) {
        return true
      }
    }
  }

  let finishMs: number | null = null

  if (dateEndTimestamp && dateEndTimestamp > 0) {
    finishMs = dateEndTimestamp < 1e11 ? dateEndTimestamp * 1000 : dateEndTimestamp
  } else if (dateStartTimestamp && dateStartTimestamp > 0) {
    const startMs = dateStartTimestamp < 1e11 ? dateStartTimestamp * 1000 : dateStartTimestamp
    finishMs = startMs + 45 * 60 * 1000
  } else if (dateFinish) {
    // human.ua date strings are in UTC!
    const utcStr = dateFinish.includes('Z') ? dateFinish : `${dateFinish.replace(' ', 'T')}Z`
    const parsed = new Date(utcStr)
    if (!Number.isNaN(parsed.getTime())) {
      finishMs = parsed.getTime()
    }
  } else if (dateStart) {
    const utcStr = dateStart.includes('Z') ? dateStart : `${dateStart.replace(' ', 'T')}Z`
    const parsed = new Date(utcStr)
    if (!Number.isNaN(parsed.getTime())) {
      finishMs = parsed.getTime() + 45 * 60 * 1000
    }
  }

  if (!finishMs) return false

  const diffMs = Date.now() - finishMs
  return diffMs >= hours * 60 * 60 * 1000
}

/**
 * Detects whether a class is a junior/elementary school class (grades 1–4).
 * In Ukrainian schools and human.ua, grades 1-4 do not have a "Завдання" section and homework is not assigned.
 */
export function isJuniorClass(groupText?: string, groupNumber?: number): boolean {
  if (typeof groupNumber === 'number' && groupNumber > 0) {
    return groupNumber <= 4
  }
  if (!groupText) return false
  const match = groupText.match(/\b([1-9]|1[0-2])\s*[-–—]?[А-Яа-яA-Za-z]?\b/)
  if (match) {
    const num = Number.parseInt(match[1], 10)
    return num >= 1 && num <= 4
  }
  return false
}

/**
 * Detects whether a lesson event is created (has a theme / content assigned)
 * and is not an empty slot (which displays "+ Додати тему").
 */
export function isLessonCreated(card: HTMLElement, match?: LessonEventStatus): boolean {
  // If the card has "+ Додати тему" button or class, it is definitely empty
  if (
    card.querySelector('.calendar-event-add-theme, [class*="add-theme"], [class*="create-theme"]')
  ) {
    return false
  }

  // 1. Primary check: theme title in DOM
  const themeEl = card.querySelector('.calendar-event-theme-title')
  const themeText = themeEl?.textContent?.trim() || ''
  if (themeText) {
    return true
  }

  // 2. Fallback to API event theme title or themeId
  if (match && (match.themeTitle || (match.themeId && match.themeId > 0))) {
    return true
  }

  return false
}
