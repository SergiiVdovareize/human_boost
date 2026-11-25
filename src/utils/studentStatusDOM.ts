import { HA_CLASSES } from '@/constants/selectors'
import { STUDENT_STATUS_LIST, STUDENT_STATUSES } from '@/constants/studentStatuses'
import useSettingsStore from '@/stores/useSettingsStore'
import useStudentStatusesStore from '@/stores/useStudentStatusesStore'
import type { StudentStatusType } from '@/types'
import { cellAbsent, rating } from '@/utils/gradebook'

let activeDropdown: HTMLElement | null = null
let observer: MutationObserver | null = null
let isUpdating = false
let rafHandle: number | null = null
let scrollHandlerAttached = false
let clickListenerAttached = false
let updateInterval: number | null = null

const DOTS_BTN_CLASS = 'ha-status-dots-btn'
const CORNER_TAG_CLASS = 'ha-status-corner-tag'

/**
 * Checks whether a cell contains only the history dot (indicator that an assessment was previously deleted).
 */
export function isCellHistoryDot(cell: HTMLElement): boolean {
  const text = (cell.textContent || '').trim()

  // If text contains any digit, it's an assessment, not a history dot
  if (/\d/.test(text)) {
    return false
  }

  // If text contains words/letters (e.g. "Н", "зар", "вивч"), it's not a history dot
  if (/[a-zA-Zа-яА-ЯіїєґІЇЄҐ]/.test(text)) {
    return false
  }

  // If it has indicator icon or opacity-03 dot element, and NO text/digits
  if (cell.querySelector('[icon="i_indicator"], .badge__item--opacity-03')) {
    return true
  }

  // If text is only dot/bullet
  if (text === '.' || text === '•' || text === '·' || text === '●') {
    return true
  }

  return false
}

/**
 * Checks whether a gradebook cell contains an absence ("Н") mark.
 */
export function isCellAbsentMark(cell: HTMLElement): boolean {
  // If cell is still loading, wait
  if (cell.querySelector('ng-spinner, .ng-spinner')) {
    return false
  }

  // If the cell contains only a history dot (indicator of deleted assessment), treat as empty
  if (isCellHistoryDot(cell)) {
    return false
  }

  // 1. Absence mark ('Н', red pseudo-button, red icon)
  if (
    cellAbsent(cell) ||
    cell.querySelector(
      '.pseudo-button--color-red, [class*="pseudo-button--color-red"], [class*="icon2--color-lightred"], [class*="icon2--color-red"], [icon="absent"], [icon="i_absent"], [icon*="absent"]'
    )
  ) {
    return true
  }

  const text = (cell.textContent || '').trim().toUpperCase()
  if (text === 'Н' || text === 'H') {
    return true
  }

  return false
}

/**
 * Checks whether a gradebook cell contains a "late" ("Запізнився") mark.
 */
export function isCellLateMark(cell: HTMLElement): boolean {
  if (cell.querySelector('ng-spinner, .ng-spinner')) {
    return false
  }

  if (isCellHistoryDot(cell)) {
    return false
  }

  // 1. Check tooltips inside cell
  const tooltippedEls = cell.querySelectorAll<HTMLElement>('[data-awesome-tooltip], [title]')
  for (const el of Array.from(tooltippedEls)) {
    const tip = (el.getAttribute('data-awesome-tooltip') || el.getAttribute('title') || '').trim()
    if (/запізн/i.test(tip)) {
      return true
    }
  }

  // 2. Late icon or yellow/orange pseudo-button / classes
  if (
    cell.querySelector(
      '.pseudo-button--color-yellow, .pseudo-button--color-orange, [class*="pseudo-button--color-yellow"], [class*="pseudo-button--color-orange"], [icon*="late"], [icon*="delay"], [class*="icon2--color-yellow"], [class*="icon2--color-orange"]'
    )
  ) {
    return true
  }

  return false
}

export interface CellAttendanceConflict {
  hasConflict: boolean
  type?: 'absent' | 'late'
}

/**
 * Returns whether a cell has an absence or late attendance mark.
 */
export function getCellAttendanceConflict(cell: HTMLElement): CellAttendanceConflict {
  if (isCellAbsentMark(cell)) {
    return { hasConflict: true, type: 'absent' }
  }
  if (isCellLateMark(cell)) {
    return { hasConflict: true, type: 'late' }
  }
  return { hasConflict: false }
}

/**
 * Checks whether a gradebook cell contains any assessment, grade, or absence ("Н") mark.
 * If the cell contains only a history indicator dot, it is considered empty (false).
 */
export function isCellFilledWithGradeOrAbsent(cell: HTMLElement): boolean {
  return isCellAbsentMark(cell) || isCellLateMark(cell) || hasActualGrade(cell)
}

/**
 * Strict regex for mandatory works:
 * Requires pairs of [Type] + [Form/Activity]:
 * - Type: контрольн-, практичн-, діагностичн-, лабораторн-, самостійн-
 * - Form: робот-, завдан-, тест-, тестуван-, дослідженн-
 * or abbreviations (п/р, к/р, л/р, д/р, с/р) or 'практикум'.
 * Prevents false positives like "контрольні точки відновлення" or "контрольні запитання".
 */
export const MANDATORY_ASSESSMENT_REGEX =
  /(?:(?:^|[^\p{L}\p{N}])(?:контрольн|практичн|діагностичн|лабораторн|самостійн)[\p{L}]*(?:\s+[^\s]+){0,2}\s+(?:робот|завдан|тест|тестуван|дослідженн)[\p{L}]*|(?:^|[^\p{L}\p{N}])(?:робот|завдан|тест|тестуван|дослідженн)[\p{L}]*(?:\s+[^\s]+){0,2}\s+(?:контрольн|практичн|діагностичн|лабораторн|самостійн)[\p{L}]*|(?:^|[^\p{L}\p{N}])(?:п\/р|к\/р|л\/р|д\/р|с\/р|п\.р\.|к\.р\.|л\.р\.|д\.р\.|с\.р\.)(?:$|[^\p{L}\p{N}])|(?:^|[^\p{L}\p{N}])практикум[\p{L}]*)/iu

/**
 * Checks whether a gradebook cell contains an actual grade/assessment
 * (i.e. not empty, not a history indicator dot, and not an absence "Н" or "Запізнився" mark).
 */
export function hasActualGrade(cell: HTMLElement): boolean {
  if (isCellHistoryDot(cell)) {
    return false
  }

  // 1. Absence mark ('Н', red pseudo-button, red icon)
  if (
    cellAbsent(cell) ||
    cell.querySelector(
      '.pseudo-button--color-red, [class*="pseudo-button--color-red"], [class*="icon2--color-lightred"], [class*="icon2--color-red"], [icon="absent"], [icon="i_absent"], [icon*="absent"]'
    )
  ) {
    return false
  }

  // 2. Late mark ('Запізнився')
  if (isCellLateMark(cell)) {
    return false
  }

  const text = (cell.textContent || '').trim()
  if (text.toUpperCase() === 'Н' || text.toUpperCase() === 'H') {
    return false
  }

  // 2. Any numeric grade (1-12, e.g. "8", "7", "4", "10", etc.)
  if (/\d+/.test(text)) {
    return true
  }

  // 3. Ukrainian assessment keywords (credit, exempted, studied)
  if (/(?:зар|зарах|вивч|звільн)/i.test(text)) {
    return true
  }

  // 4. Primary school icons or non-indicator icons in universal assessment
  if (cell.querySelector('ng-universal-assessment .icon2:not([icon="i_indicator"])')) {
    return true
  }

  return false
}

function resolveLessonYear(lessonMonth: number): number {
  let baseYear = new Date().getFullYear()
  let baseMonth = new Date().getMonth()

  try {
    const params = new URLSearchParams(window.location.search)
    const dateParam = params.get('date')
    if (dateParam) {
      const parts = dateParam.split('-')
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10)
        const m = parseInt(parts[1], 10) - 1
        if (!isNaN(y) && y > 2000) baseYear = y
        if (!isNaN(m) && m >= 0 && m <= 11) baseMonth = m
      }
    }
  } catch (e) {
    void e
  }

  let resultYear = baseYear
  if (baseMonth >= 8 && lessonMonth < 8) {
    resultYear = baseYear + 1
  } else if (baseMonth < 8 && lessonMonth >= 8) {
    resultYear = baseYear - 1
  }

  return resultYear
}

export function parseLessonDate(lessonBlock: HTMLElement | null): Date | null {
  if (!lessonBlock) return null

  const dateEl = lessonBlock.querySelector('.gradebook-narrow__header-date, .g-main-header__date')
  const tooltip = dateEl?.getAttribute('data-awesome-tooltip') || ''
  const cleanTooltip = tooltip.replace(/^Урок:\s*/i, '').trim()

  const ukMonths = [
    /січ/i,
    /лют/i,
    /бер/i,
    /квіт/i,
    /трав/i,
    /черв/i,
    /лип/i,
    /серп/i,
    /вер/i,
    /жов/i,
    /лист/i,
    /груд/i,
  ]

  let day: number | null = null
  let month: number | null = null

  // Matches "1-го жовтня", "1 жовтня", "01-го жовтня" etc.
  const match = cleanTooltip.match(/(\d{1,2})(?:-[а-яіїєґ]+)?\s+([а-яіїєґ]+)/i)
  if (match) {
    day = parseInt(match[1], 10)
    const mIndex = ukMonths.findIndex((rx) => rx.test(match[2]))
    if (mIndex !== -1) month = mIndex
  }

  if (day === null || month === null) {
    const dayText = lessonBlock.querySelector('.date__day-number')?.textContent?.trim()
    const monthText = lessonBlock.querySelector('.date__day-text')?.textContent?.trim()
    if (dayText && monthText) {
      const d = parseInt(dayText, 10)
      if (!isNaN(d)) day = d
      const mIndex = ukMonths.findIndex((rx) => rx.test(monthText))
      if (mIndex !== -1) month = mIndex
    }
  }

  if (day === null || month === null) return null

  const year = resolveLessonYear(month)
  return new Date(year, month, day)
}

export interface HeaderColumnInfo {
  colIndex: number
  lessonIndex: number
  isMandatoryWork: boolean
  matchedPattern: string | null
  isPast: boolean
  isLessonOrTask: boolean
  subColumnTitle: string
  lessonTopic: string
  rawDateTooltip: string
  rawDateText: string
  parsedDate: string | null
}

export function getHeaderColumnsInfo(): HeaderColumnInfo[] {
  const subColEls = Array.from(
    document.querySelectorAll<HTMLElement>('.gradebook-narrow__header-item')
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lessonMap = new Map<HTMLElement, number>()
  let lessonCounter = 0

  return subColEls.map((subColEl, colIndex) => {
    const lessonBlock = subColEl.closest<HTMLElement>(
      '.g-main-header__item.gradebook-narrow__main-header__item, .gradebook-narrow__main-header__item, .g-main-header__item'
    )

    let lessonIndex = 0
    if (lessonBlock) {
      if (!lessonMap.has(lessonBlock)) {
        lessonMap.set(lessonBlock, lessonCounter++)
      }
      lessonIndex = lessonMap.get(lessonBlock)!
    }

    // Lesson topic
    const titleEl = lessonBlock?.querySelector<HTMLElement>(
      '.gradebook-narrow__header-title-text, .g-main-header__head-title, a'
    )
    const lessonTopic = (
      titleEl?.getAttribute('data-awesome-tooltip') ||
      titleEl?.getAttribute('title') ||
      titleEl?.textContent ||
      lessonBlock?.getAttribute('data-awesome-tooltip') ||
      ''
    ).trim()

    const match = lessonTopic.match(MANDATORY_ASSESSMENT_REGEX)
    const isMandatoryWork = Boolean(match)
    const matchedPattern = match ? match[0].trim() : null

    // Lesson date & check if in past
    const dateEl = lessonBlock?.querySelector(
      '.gradebook-narrow__header-date, .g-main-header__date'
    )
    const rawDateTooltip = dateEl?.getAttribute('data-awesome-tooltip') || ''
    const dayNumber = lessonBlock?.querySelector('.date__day-number')?.textContent?.trim() || ''
    const dayText = lessonBlock?.querySelector('.date__day-text')?.textContent?.trim() || ''
    const rawDateText = `${dayNumber} ${dayText}`.trim()

    const lessonDate = parseLessonDate(lessonBlock)
    const isPast = lessonDate ? lessonDate.getTime() < today.getTime() : false
    const parsedDate = lessonDate ? lessonDate.toISOString().slice(0, 10) : null

    // Subcolumn type: "Заняття", "Завдання", etc.
    const subColText = (
      subColEl.querySelector('.gradebook-narrow__header-item_text, .gradebook-narrow__clamp-2')
        ?.textContent ||
      subColEl.textContent ||
      ''
    ).trim()

    const isLessonOrTask = /заняття|завдання/i.test(subColText)

    return {
      colIndex,
      lessonIndex,
      isMandatoryWork,
      matchedPattern,
      isPast,
      isLessonOrTask,
      subColumnTitle: subColText,
      lessonTopic,
      rawDateTooltip,
      rawDateText,
      parsedDate,
    }
  })
}

/**
 * Comparable grade value for mismatch checks (numeric preferred, else normalized text).
 */
function getCellComparableGrade(cell: HTMLElement): string | null {
  if (!hasActualGrade(cell)) return null

  const numeric = rating(cell)
  if (numeric !== null && !Number.isNaN(numeric) && numeric > 0) {
    return String(numeric)
  }

  const match = (cell.textContent || '').match(/\b(\d{1,2})\b/)
  if (match) {
    const val = Number(match[1])
    if (val >= 1 && val <= 12) return String(val)
  }

  const text = (cell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return text || null
}

/**
 * Checks all grade cells in the student's row:
 * 1. If the student is inactive and any cell has 'Н', highlight in orange.
 * 2. If a lesson has a mandatory work (control, practical, diagnostic) in the past:
 *    If the student does NOT have a grade anywhere in that lesson (neither in "Заняття" nor in "Завдання"),
 *    highlight those empty cells in orange with styled tooltip "Обовʼязкова робота".
 *    If the student ALREADY has a grade in either column, do NOT highlight either cell!
 * 3. If both "Заняття" and "Завдання" have grades and they differ — highlight both cells.
 */
function updateRowGradeCellsConflict(
  row: HTMLElement,
  currentStatus: StudentStatusType,
  columnsInfo: HeaderColumnInfo[]
): void {
  const settings = useSettingsStore.getState().settings
  const showStatuses = settings.showStudentStatuses ?? true
  const highlightAbsent = settings.highlightAbsentForInactive ?? true
  const highlightMandatory = settings.highlightMandatoryWorks ?? true
  const highlightGradeMismatch = settings.highlightGradeMismatch ?? true

  const isInactive = showStatuses && currentStatus !== 'standard'
  const isEligibleForMandatory = !showStatuses || currentStatus !== 'withdrawn'

  let gradeCells = Array.from(row.querySelectorAll<HTMLElement>('.gradebook-narrow__cell'))
  if (gradeCells.length === 0) {
    gradeCells = Array.from(row.querySelectorAll<HTMLElement>('.smart-cell')).filter(
      (cell) =>
        !cell.classList.contains('smart-cell--width-270') && !cell.querySelector('.bem-user')
    )
  }

  // 1. Group mandatory lessons: check whether the student has ANY grade in each mandatory lesson
  const mandatoryLessonsWithGrade = new Set<number>()

  if (highlightMandatory && isEligibleForMandatory && columnsInfo.length > 0) {
    columnsInfo.forEach((col) => {
      if (col.isMandatoryWork && col.isPast && col.isLessonOrTask) {
        if (!mandatoryLessonsWithGrade.has(col.lessonIndex)) {
          const cell = gradeCells[col.colIndex]
          if (cell && hasActualGrade(cell)) {
            mandatoryLessonsWithGrade.add(col.lessonIndex)
          }
        }
      }
    })
  }

  // 2. Find Заняття/Завдання pairs with different grades in the same lesson
  const mismatchColIndexes = new Set<number>()
  if (highlightGradeMismatch && columnsInfo.length > 0) {
    const pairs = new Map<number, { lessonCol?: number; taskCol?: number }>()

    columnsInfo.forEach((col) => {
      const title = col.subColumnTitle
      const pair = pairs.get(col.lessonIndex) || {}
      if (/заняття/i.test(title)) {
        pair.lessonCol = col.colIndex
      }
      if (/завдання/i.test(title)) {
        pair.taskCol = col.colIndex
      }
      pairs.set(col.lessonIndex, pair)
    })

    pairs.forEach((pair) => {
      if (pair.lessonCol == null || pair.taskCol == null) return
      const lessonCell = gradeCells[pair.lessonCol]
      const taskCell = gradeCells[pair.taskCol]
      if (!lessonCell || !taskCell) return

      const lessonGrade = getCellComparableGrade(lessonCell)
      const taskGrade = getCellComparableGrade(taskCell)
      if (lessonGrade !== null && taskGrade !== null && lessonGrade !== taskGrade) {
        mismatchColIndexes.add(pair.lessonCol)
        mismatchColIndexes.add(pair.taskCol)
      }
    })
  }

  gradeCells.forEach((cell, colIndex) => {
    const colInfo = columnsInfo[colIndex]

    const attendanceConflict = isInactive ? getCellAttendanceConflict(cell) : { hasConflict: false }
    const hasInactiveConflict = isInactive && highlightAbsent && attendanceConflict.hasConflict

    // A cell is missing a mandatory grade if:
    // - mandatory work highlight setting is enabled
    // - student has not withdrawn
    // - column is in a mandatory lesson in the past
    // - column is "Заняття" or "Завдання"
    // - student has NO grade anywhere in this lesson (neither in Заняття nor in Завдання)
    // - this specific cell doesn't have a grade
    const isMissingMandatoryGrade =
      highlightMandatory &&
      isEligibleForMandatory &&
      Boolean(
        colInfo?.isMandatoryWork &&
          colInfo.isPast &&
          colInfo.isLessonOrTask &&
          !mandatoryLessonsWithGrade.has(colInfo.lessonIndex) &&
          !hasActualGrade(cell)
      )

    const isGradeMismatch = mismatchColIndexes.has(colIndex)

    // 1. Inactive attendance conflict (.ha-cell--conflict)
    if (hasInactiveConflict) {
      cell.classList.add(HA_CLASSES.CONFLICT_CELL)
      cell.removeAttribute('title')
      if (attendanceConflict.type === 'late') {
        cell.setAttribute('data-ha-tooltip', 'У неактивного учня стоїть «Запізнився»')
      } else {
        cell.setAttribute('data-ha-tooltip', 'У неактивного учня стоїть «Н»')
      }
    } else {
      cell.classList.remove(HA_CLASSES.CONFLICT_CELL)
      if (cell.getAttribute('data-ha-tooltip')?.includes('неактивного учня')) {
        cell.removeAttribute('data-ha-tooltip')
      }
    }

    // 2. Mandatory work missing grade (.ha-cell--mandatory-missing)
    if (isMissingMandatoryGrade) {
      cell.classList.add(HA_CLASSES.MANDATORY_MISSING_CELL)
      cell.removeAttribute('title')
      cell.setAttribute('data-ha-tooltip', 'Обовʼязкова робота')
    } else {
      cell.classList.remove(HA_CLASSES.MANDATORY_MISSING_CELL)
      if (cell.getAttribute('data-ha-tooltip') === 'Обовʼязкова робота') {
        cell.removeAttribute('data-ha-tooltip')
      }
    }

    // 3. Заняття vs Завдання grade mismatch (.ha-cell--grade-mismatch)
    if (isGradeMismatch) {
      cell.classList.add(HA_CLASSES.GRADE_MISMATCH_CELL)
      cell.removeAttribute('title')
      cell.setAttribute('data-ha-tooltip', 'Оцінки в «Заняття» та «Завдання» відрізняються')
    } else {
      cell.classList.remove(HA_CLASSES.GRADE_MISMATCH_CELL)
      if (
        cell.getAttribute('data-ha-tooltip') === 'Оцінки в «Заняття» та «Завдання» відрізняються'
      ) {
        cell.removeAttribute('data-ha-tooltip')
      }
    }
  })
}

/**
 * Updates the student card cell: adds/updates the 3-dots button and corner status tag.
 */
function updateStudentCellBadge(
  row: HTMLElement,
  smartCell: HTMLElement,
  bemUser: HTMLElement,
  studentId: string,
  currentStatus: StudentStatusType
): void {
  // Ensure cell has relative positioning for the bottom-right corner tag
  if (smartCell.style.position !== 'relative') {
    smartCell.style.position = 'relative'
  }

  // Fast check: if cell already has this exact status and studentId, skip DOM touches
  if (
    smartCell.dataset.haStatus === currentStatus &&
    smartCell.dataset.haStudentId === studentId &&
    smartCell.querySelector(`.${DOTS_BTN_CLASS}`)
  ) {
    return
  }

  smartCell.dataset.haStatus = currentStatus
  smartCell.dataset.haStudentId = studentId

  // Clean up any old button from bemUser if present
  bemUser.querySelector(`.${DOTS_BTN_CLASS}`)?.remove()

  // 1. Update 3-dots button directly in smartCell (pinned to absolute right edge)
  let dotsBtn = smartCell.querySelector(`.${DOTS_BTN_CLASS}`) as HTMLButtonElement | null
  if (!dotsBtn) {
    dotsBtn = document.createElement('button')
    dotsBtn.type = 'button'
    dotsBtn.className = DOTS_BTN_CLASS
    dotsBtn.title = 'Налаштування статусу учня'
    dotsBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <circle cx="8" cy="3" r="1.5"/>
        <circle cx="8" cy="8" r="1.5"/>
        <circle cx="8" cy="13" r="1.5"/>
      </svg>
    `
    smartCell.appendChild(dotsBtn)
  }

  dotsBtn.onclick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    toggleDropdown(dotsBtn!, studentId)
  }

  // 2. Update corner status tag in bottom-right corner of the cell (only if non-standard)
  let cornerTag = smartCell.querySelector(`.${CORNER_TAG_CLASS}`) as HTMLElement | null
  const statusConfig = STUDENT_STATUSES[currentStatus] || STUDENT_STATUSES.standard

  if (currentStatus === 'standard') {
    if (cornerTag) {
      cornerTag.remove()
    }
    row.classList.remove('ha-row--withdrawn', 'ha-row--family', 'ha-row--abroad')
  } else {
    row.classList.remove('ha-row--withdrawn', 'ha-row--family', 'ha-row--abroad')
    row.classList.add(`ha-row--${currentStatus}`)

    if (!cornerTag) {
      cornerTag = document.createElement('div')
      cornerTag.className = CORNER_TAG_CLASS
      smartCell.appendChild(cornerTag)
    }

    cornerTag.className = `${CORNER_TAG_CLASS} ha-corner--${currentStatus}`
    cornerTag.title = `Статус: ${statusConfig.label}. Натисніть, щоб змінити`
    cornerTag.textContent = statusConfig.cornerLabel

    cornerTag.onclick = (e) => {
      e.stopPropagation()
      e.preventDefault()
      toggleDropdown(cornerTag!, studentId)
    }
  }
}

export function getStudentIdFromRow(row: HTMLElement): string {
  const nameEl = row.querySelector('.bem-user__name') as HTMLElement | null
  const studentName = nameEl?.innerText?.trim() || ''
  if (!studentName) return ''
  return useStudentStatusesStore.getState().getStudentIdByName(studentName)
}

/**
 * Creates or updates the status tag, 3-dots button, and conflict highlights for a single row.
 */
function updateRowStatusBadge(row: HTMLElement, columnsInfo: HeaderColumnInfo[] = []): void {
  const smartCell = (row.querySelector('.smart-cell.smart-cell--width-270') ||
    row.querySelector('.smart-cell')) as HTMLElement | null
  const bemUser = row.querySelector('.bem-user') as HTMLElement | null
  const nameEl = row.querySelector('.bem-user__name') as HTMLElement | null
  if (!smartCell || !bemUser || !nameEl) return

  const studentId = getStudentIdFromRow(row)
  const store = useStudentStatusesStore.getState()
  const currentStatus: StudentStatusType = store.getStatus(studentId)

  const showStatuses = useSettingsStore.getState().settings.showStudentStatuses ?? true
  if (!showStatuses) {
    smartCell.querySelector(`.${CORNER_TAG_CLASS}`)?.remove()
    smartCell.querySelector(`.${DOTS_BTN_CLASS}`)?.remove()
    row.classList.remove('ha-row--withdrawn', 'ha-row--family', 'ha-row--abroad')
    row.querySelectorAll(`.${HA_CLASSES.CONFLICT_CELL}`).forEach((cell) => {
      cell.classList.remove(HA_CLASSES.CONFLICT_CELL)
      if (cell.getAttribute('data-ha-tooltip')?.includes('неактивного учня')) {
        cell.removeAttribute('data-ha-tooltip')
      }
      cell.removeAttribute('title')
    })
  } else {
    // 1. Update student card cell badge & 3-dots button
    updateStudentCellBadge(row, smartCell, bemUser, studentId, currentStatus)
  }

  // 2. Update conflict highlights on grade cells (both inactive conflicts and mandatory missing grades)
  updateRowGradeCellsConflict(row, currentStatus, columnsInfo)
}

/**
 * Toggles or opens the status selection dropdown menu.
 */
function toggleDropdown(buttonEl: HTMLElement, studentId: string): void {
  closeActiveDropdown()

  const rect = buttonEl.getBoundingClientRect()
  const store = useStudentStatusesStore.getState()
  const currentStatus = store.getStatus(studentId)

  const dropdown = document.createElement('div')
  dropdown.className = 'ha-status-dropdown'
  dropdown.style.position = 'fixed'
  dropdown.style.zIndex = '999999'

  const header = document.createElement('div')
  header.className = 'ha-status-dropdown-header'
  header.textContent = 'Статус учня:'
  dropdown.appendChild(header)

  STUDENT_STATUS_LIST.forEach((option) => {
    const item = document.createElement('div')
    item.className = `ha-status-dropdown-item ${
      option.value === currentStatus ? 'ha-status-dropdown-item--active' : ''
    }`
    item.innerHTML = `
      <span class="ha-status-dot ha-status-dot--${option.value}"></span>
      <span class="ha-status-dropdown-text">${option.label}</span>
      ${
        option.value === currentStatus
          ? '<svg class="ha-status-check" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.5 8.5L6.5 11.5L12.5 4.5"/></svg>'
          : ''
      }
    `

    item.onclick = async (e) => {
      e.stopPropagation()
      e.preventDefault()
      closeActiveDropdown()

      // Save status in store and chrome.storage.local
      await store.setStatus(studentId, option.value)

      // Instantly refresh DOM badges
      refreshStudentStatusBadges()
    }

    dropdown.appendChild(item)
  })

  document.body.appendChild(dropdown)
  activeDropdown = dropdown

  // Measure dropdown dimensions and position safely relative to viewport
  const dropdownHeight = dropdown.offsetHeight || 180
  const dropdownWidth = dropdown.offsetWidth || 170

  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const openUpwards = spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow

  let top = openUpwards ? rect.top - dropdownHeight - 4 : rect.bottom + 4
  top = Math.max(8, Math.min(top, window.innerHeight - dropdownHeight - 8))

  let left = rect.left
  left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8))

  dropdown.style.top = `${top}px`
  dropdown.style.left = `${left}px`

  if (openUpwards) {
    dropdown.classList.add('ha-status-dropdown--upwards')
  }

  const onDocClick = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node) && e.target !== buttonEl) {
      closeActiveDropdown()
      document.removeEventListener('click', onDocClick, true)
    }
  }
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true)
  }, 0)
}

function closeActiveDropdown(): void {
  if (activeDropdown) {
    activeDropdown.remove()
    activeDropdown = null
  }
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const TODAY_DATE_DOT_CLASS = 'ha-today-date-dot'

/**
 * Marks today's lesson date with a small dot inserted before `.date__day-number`.
 * Does not restyle or reposition the native date elements.
 */
export function updateTodayDateHighlights(): void {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Remove previously injected dots (virtual scroll / month switch)
  document.querySelectorAll(`.${TODAY_DATE_DOT_CLASS}`).forEach((el) => {
    el.remove()
  })

  const lessonBlocks = document.querySelectorAll<HTMLElement>(
    '.g-main-header__item.gradebook-narrow__main-header__item, .gradebook-narrow__main-header__item, .g-main-header__item'
  )

  lessonBlocks.forEach((lessonBlock) => {
    const lessonDate = parseLessonDate(lessonBlock)
    if (!lessonDate || !isSameCalendarDay(lessonDate, today)) return

    const dayNumberEl = lessonBlock.querySelector<HTMLElement>('.date__day-number')
    if (
      !dayNumberEl ||
      dayNumberEl.previousElementSibling?.classList.contains(TODAY_DATE_DOT_CLASS)
    ) {
      return
    }

    const dot = document.createElement('span')
    dot.className = TODAY_DATE_DOT_CLASS
    dot.setAttribute('aria-hidden', 'true')
    dayNumberEl.insertAdjacentElement('beforebegin', dot)
  })
}

/**
 * Highlights lesson header containers in bluish color for lessons that have mandatory works (practical, control, diagnostic).
 */
export function updateLessonHeaderHighlights(): void {
  const highlightMandatory = useSettingsStore.getState().settings.highlightMandatoryWorks ?? true

  const lessonBlocks = document.querySelectorAll<HTMLElement>(
    '.g-main-header__item.gradebook-narrow__main-header__item, .gradebook-narrow__main-header__item, .g-main-header__item'
  )

  if (!highlightMandatory) {
    lessonBlocks.forEach((lessonBlock) => {
      const headerContainer = lessonBlock.querySelector<HTMLElement>(
        '.gradebook-narrow__header-container, .g-main-header__head'
      )
      headerContainer?.classList.remove('ha-header-mandatory-lesson')
    })
    updateTodayDateHighlights()
    return
  }

  lessonBlocks.forEach((lessonBlock) => {
    const titleEl = lessonBlock.querySelector<HTMLElement>(
      '.gradebook-narrow__header-title-text, .g-main-header__head-title, a'
    )
    const lessonTopic = (
      titleEl?.getAttribute('data-awesome-tooltip') ||
      titleEl?.getAttribute('title') ||
      titleEl?.textContent ||
      lessonBlock.getAttribute('data-awesome-tooltip') ||
      ''
    ).trim()

    const isMandatoryWork = MANDATORY_ASSESSMENT_REGEX.test(lessonTopic)

    const headerContainer = lessonBlock.querySelector<HTMLElement>(
      '.gradebook-narrow__header-container, .g-main-header__head'
    )

    if (isMandatoryWork) {
      if (headerContainer && !headerContainer.classList.contains('ha-header-mandatory-lesson')) {
        headerContainer.classList.add('ha-header-mandatory-lesson')
      }
    } else {
      headerContainer?.classList.remove('ha-header-mandatory-lesson')
    }
  })

  updateTodayDateHighlights()
}

let lastObservedUrl = ''
let monthSwitchListenersAttached = false

export function attachMonthSwitchListener(): void {
  if (monthSwitchListenersAttached || typeof window === 'undefined') return
  monthSwitchListenersAttached = true

  const handleMonthOrUrlChange = () => {
    const currentUrl = window.location.href
    if (currentUrl !== lastObservedUrl) {
      lastObservedUrl = currentUrl

      // Refresh on next tick and after DOM settles
      setTimeout(scheduleUpdate, 50)
      setTimeout(scheduleUpdate, 300)
      setTimeout(scheduleUpdate, 1000)
    }
  }

  window.addEventListener('ha:locationchange', handleMonthOrUrlChange)
  window.addEventListener('popstate', handleMonthOrUrlChange)

  // Catch clicks on date navigation arrows and calendar pickers
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement
      const dateNavEl = target?.closest(
        '.period-switcher, .date-switcher, .g-date-switcher, [class*="calendar"], [class*="datepicker"], button[class*="prev"], button[class*="next"], .icon--arrow-left, .icon--arrow-right, a[href*="date="]'
      )
      if (dateNavEl) {
        setTimeout(scheduleUpdate, 150)
        setTimeout(scheduleUpdate, 500)
        setTimeout(scheduleUpdate, 1200)
      }
    },
    { passive: true }
  )
}

let lastLoggedSignature = ''

export function checkAndLogGradebookDiagnostics(
  columnsInfo: HeaderColumnInfo[] = getHeaderColumnsInfo(),
  rows: HTMLElement[] = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.gradebook-container__table2-outlet .gradebook-container__table2-row'
    )
  ),
  force = false
): void {
  if (columnsInfo.length === 0) return

  const signature = columnsInfo
    .map((c) => `${c.colIndex}:${c.lessonTopic}:${c.matchedPattern}`)
    .join('|')
  if (!force && signature === lastLoggedSignature) return
  lastLoggedSignature = signature

  logGradebookDiagnostics(columnsInfo, rows)
}

export function logGradebookDiagnostics(
  columnsInfo: HeaderColumnInfo[] = getHeaderColumnsInfo(),
  rows: HTMLElement[] = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.gradebook-container__table2-outlet .gradebook-container__table2-row'
    )
  )
): void {
  const mandatoryCols = columnsInfo.filter((c) => c.isMandatoryWork)

  console.log(
    `%c[Human Boost] 🔍 ДІАГНОСТИКА ЖУРНАЛУ: виявлено ${mandatoryCols.length} обовʼязкових колонок`,
    'background: #1e40af; color: #ffffff; font-weight: bold; padding: 2px 8px; border-radius: 4px;'
  )
  console.log('📌 Всього колонок у журналі:', columnsInfo.length)
  console.log('📌 Знайдено колонок обовʼязкових робіт:', mandatoryCols.length)
  console.log('📌 Кількість рядків учнів:', rows.length)

  if (mandatoryCols.length > 0) {
    console.log(
      '%c📋 Знайдені обовʼязкові роботи та ЧОМУ вони спрацювали (regex match):',
      'font-weight: bold; color: #1e40af;'
    )
    mandatoryCols.forEach((c) => {
      console.log(
        `🔹 [Колонка #${c.colIndex}, Урок #${c.lessonIndex}]:\n` +
          `   • Тема: "${c.lessonTopic}"\n` +
          `   • 🎯 Збіг з regex (чому спрацювало): "${c.matchedPattern}"\n` +
          `   • Підколонка: "${c.subColumnTitle}" (isLessonOrTask = ${c.isLessonOrTask})\n` +
          `   • Тултіп дати: "${c.rawDateTooltip}" | Текст дати: "${c.rawDateText}"\n` +
          `   • Розпарсена дата: ${c.parsedDate} (isPast = ${c.isPast})`
      )
    })
  }

  if (columnsInfo.length > 0) {
    console.table(
      columnsInfo.map((c) => ({
        '#': c.colIndex,
        'Урок #': c.lessonIndex,
        Тема: c.lessonTopic,
        'Обовʼязкова?': c.isMandatoryWork ? '✅ ТАК' : '—',
        'Збіг (regex)': c.matchedPattern || '—',
        Підколонка: c.subColumnTitle || '(порожньо)',
        'Заняття/Завдання?': c.isLessonOrTask ? '✅' : '❌ НІ',
        'Тултіп дати': c.rawDateTooltip || '—',
        'Текст дати': c.rawDateText || '—',
        'Розпарсена дата': c.parsedDate || '⚠️ NULL',
        'В минулому (isPast)?': c.isPast ? '✅ ТАК' : '❌ НІ',
      }))
    )
  }

  console.log(
    '💡 Для повторного виклику діагностики введіть у консолі: window.__haLogGradebookDiagnostics()'
  )
}

/**
 * Iterates through all visible gradebook rows and updates the corner tags & 3-dots buttons.
 */
export function refreshStudentStatusBadges(): void {
  if (isUpdating) return
  isUpdating = true

  try {
    updateLessonHeaderHighlights()

    const rows = document.querySelectorAll<HTMLElement>(
      '.gradebook-container__table2-outlet .gradebook-container__table2-row'
    )
    if (rows && rows.length > 0) {
      const columnsInfo = getHeaderColumnsInfo()
      const rowsArray = Array.from(rows)
      rowsArray.forEach((row) => {
        updateRowStatusBadge(row, columnsInfo)
      })
    }
  } finally {
    isUpdating = false
  }
}

function scheduleUpdate(): void {
  if (rafHandle !== null) return
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null
    refreshStudentStatusBadges()
  })
}

import { hideStyledTooltip, initTooltipListeners, showStyledTooltip } from '@/utils/tooltip'

export { hideStyledTooltip, initTooltipListeners, showStyledTooltip }

/**
 * Initializes the DOM observer safely without mutation loops.
 */
export function initStudentStatusDOM(): void {
  destroyStudentStatusDOM()
  initTooltipListeners()
  attachMonthSwitchListener()

  const outlet = document.querySelector('.gradebook-container__table2-outlet')
  if (!outlet) {
    setTimeout(() => {
      const retryOutlet = document.querySelector('.gradebook-container__table2-outlet')
      if (retryOutlet && !observer) {
        initStudentStatusDOM()
      }
    }, 1000)
    return
  }

  // Observe ONLY direct children (rows added/removed by CDK virtual scroll)
  observer = new MutationObserver(() => {
    scheduleUpdate()
  })

  observer.observe(outlet, {
    childList: true,
    subtree: false,
  })

  if (!scrollHandlerAttached) {
    window.addEventListener('scroll', closeActiveDropdown, true)
    scrollHandlerAttached = true
  }

  if (!clickListenerAttached) {
    document.addEventListener('click', scheduleUpdate, { passive: true })
    document.addEventListener('keyup', scheduleUpdate, { passive: true })
    window.addEventListener('ha:students-updated', scheduleUpdate)
    clickListenerAttached = true
  }

  if (updateInterval === null) {
    updateInterval = window.setInterval(scheduleUpdate, 2000)
  }

  if (typeof window !== 'undefined') {
    ;(
      window as unknown as { __haLogGradebookDiagnostics?: () => void }
    ).__haLogGradebookDiagnostics = () =>
      checkAndLogGradebookDiagnostics(undefined, undefined, true)
  }

  scheduleUpdate()
}

/**
 * Cleans up DOM listeners and observer.
 */
export function destroyStudentStatusDOM(): void {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle)
    rafHandle = null
  }
  if (updateInterval !== null) {
    clearInterval(updateInterval)
    updateInterval = null
  }
  if (scrollHandlerAttached) {
    window.removeEventListener('scroll', closeActiveDropdown, true)
    scrollHandlerAttached = false
  }
  if (clickListenerAttached) {
    document.removeEventListener('click', scheduleUpdate)
    document.removeEventListener('keyup', scheduleUpdate)
    window.removeEventListener('ha:students-updated', scheduleUpdate)
    clickListenerAttached = false
  }
  hideStyledTooltip()
  closeActiveDropdown()
}
