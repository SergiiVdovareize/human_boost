import { STUDENT_STATUS_LIST, STUDENT_STATUSES } from '@/constants/studentStatuses'
import useSettingsStore from '@/stores/useSettingsStore'
import useStudentStatusesStore from '@/stores/useStudentStatusesStore'
import { getLessonClassCandidates } from '@/utils/lesson'
import { disconnectLessonObserver, loadLessonStudents } from '@/utils/studentStatusApi'
import { initTooltipListeners } from '@/utils/tooltip'

export { getLessonClassCandidates } from '@/utils/lesson'

let lessonObserver: MutationObserver | null = null
let activeDropdown: HTMLElement | null = null
let isUpdating = false

const DOTS_BTN_CLASS = 'ha-status-dots-btn'
const LESSON_TAG_CLASS = 'ha-lesson-status-tag'
const CONFLICT_EMOJI_CLASS = 'ha-conflict-warning-emoji'

/**
 * Strips a trailing thematic/list grade (e.g. "Акіньшин Максим 8" → "Акіньшин Максим").
 */
function stripTrailingGrade(name: string): string {
  return name
    .replace(/\s+\d{1,2}$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts the student's full name from the student container element.
 * Prefers data-awesome-tooltip (which contains the full name like "Вдоварейзе Сергій")
 * and falls back to .bem-user__name text.
 * On thematic assessment lists, also parses `.user-item` text with a trailing grade.
 */
function getStudentName(userEl: HTMLElement): string {
  // 1. Prefer full name from data-awesome-tooltip (e.g. "Вдоварейзе Сергій" vs "Вдоварейзе С.")
  const tooltip = userEl.getAttribute('data-awesome-tooltip')?.trim()
  if (
    tooltip &&
    !tooltip.includes('<') &&
    tooltip !== 'Відсутній' &&
    tooltip !== 'Присутній' &&
    tooltip.length > 2
  ) {
    const cleanTooltip = stripTrailingGrade(tooltip.replace(/\s+/g, ' '))
    const words = cleanTooltip.split(' ')
    if (words.length >= 2 && !words[1].endsWith('.')) {
      return cleanTooltip
    }
  }

  // 2. Dedicated name element: .name or .bem-user__name
  const nameEl = userEl.querySelector('.name, .bem-user__name, [class*="user__name"]')
  if (nameEl) {
    const text = stripTrailingGrade(nameEl.textContent?.replace(/⚠️/g, '').trim() || '')
    if (text) {
      return text
    }
  }

  // 3. Fallback tooltip
  if (
    tooltip &&
    !tooltip.includes('<') &&
    tooltip !== 'Відсутній' &&
    tooltip !== 'Присутній' &&
    tooltip.length > 2
  ) {
    return stripTrailingGrade(tooltip.replace(/\s+/g, ' '))
  }

  // 4. Thematic / compact list rows: whole `.user-item` text is "Name Grade"
  if (userEl.classList.contains('user-item')) {
    const raw = stripTrailingGrade(
      (userEl.innerText || userEl.textContent || '').replace(/⚠️/g, '').replace(/\s+/g, ' ')
    )
    const words = raw.split(' ').filter(Boolean)
    if (words.length >= 2 && words.length <= 5) {
      return raw
    }
  }

  return ''
}

/**
 * Closes any currently open status dropdown popover.
 */
function closeActiveDropdown(): void {
  if (activeDropdown) {
    activeDropdown.remove()
    activeDropdown = null
  }
}

/**
 * Opens the status selection dropdown near the target button.
 */
function toggleDropdown(buttonEl: HTMLElement, studentId: string, classId: number): void {
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

      // Save status for this class and sync across storage
      await store.setStatusForClass(classId, studentId, option.value)

      // Instantly refresh badges on the lesson side panel
      refreshLessonStudentBadges()
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

/**
 * Updates a single student card element inside the lesson side panel.
 */
/**
 * Detects whether an attendance mark ('Н' / absent or 'запізнився' / late)
 * is present on a student card in the lesson side panel.
 */
export function detectAttendanceConflict(userEl: HTMLElement): {
  element: HTMLElement
  conflictType: 'absent' | 'late'
  tooltipText: string
} | null {
  // 1. Look for explicit tooltip on elements inside userEl
  const elementsWithTooltip = userEl.querySelectorAll<HTMLElement>(
    '[data-awesome-tooltip], [title]'
  )
  for (const el of Array.from(elementsWithTooltip)) {
    const tip = (el.getAttribute('data-awesome-tooltip') || el.getAttribute('title') || '').trim()
    if (/відсутн/i.test(tip)) {
      return {
        element:
          (el.closest(
            '.pseudo-button, ng-universal-rating-comments, [class*="action"]'
          ) as HTMLElement) || el,
        conflictType: 'absent',
        tooltipText: 'У неактивного учня стоїть «Н» (відсутній)',
      }
    }
    if (/запізн/i.test(tip)) {
      return {
        element:
          (el.closest(
            '.pseudo-button, ng-universal-rating-comments, [class*="action"]'
          ) as HTMLElement) || el,
        conflictType: 'late',
        tooltipText: 'У неактивного учня стоїть «Запізнився»',
      }
    }
  }

  // 2. Look for icon attributes or absence/late classes
  const absentIcon = userEl.querySelector<HTMLElement>(
    '[icon*="absent"], [icon*="i_absent"], [class*="pseudo-button--color-red"], [class*="icon2--color-lightred"], [class*="icon2--color-red"]'
  )
  if (absentIcon) {
    return {
      element:
        (absentIcon.closest(
          '.pseudo-button, ng-universal-rating-comments, [class*="action"]'
        ) as HTMLElement) || absentIcon,
      conflictType: 'absent',
      tooltipText: 'У неактивного учня стоїть «Н» (відсутній)',
    }
  }

  const lateIcon = userEl.querySelector<HTMLElement>(
    '[icon*="late"], [icon*="delay"], [class*="color-yellow"], [class*="color-orange"]'
  )
  if (lateIcon) {
    return {
      element:
        (lateIcon.closest(
          '.pseudo-button, ng-universal-rating-comments, [class*="action"]'
        ) as HTMLElement) || lateIcon,
      conflictType: 'late',
      tooltipText: 'У неактивного учня стоїть «Запізнився»',
    }
  }

  // 3. Fallback: check text "Н" or "H"
  const allChildEls = userEl.querySelectorAll<HTMLElement>('*')
  for (const el of Array.from(allChildEls)) {
    if (el.children.length === 0) {
      const text = el.textContent?.trim().toUpperCase()
      if (text === 'Н' || text === 'H') {
        return {
          element:
            (el.closest(
              '.pseudo-button, ng-universal-rating-comments, [class*="action"]'
            ) as HTMLElement) || el,
          conflictType: 'absent',
          tooltipText: 'У неактивного учня стоїть «Н» (відсутній)',
        }
      }
    }
  }

  return null
}

/**
 * Updates a single student card element inside the lesson side panel.
 */
function updateLessonStudentBadge(userEl: HTMLElement, candidateClassIds: number[]): void {
  const studentName = getStudentName(userEl)
  if (!studentName) return

  const store = useStudentStatusesStore.getState()
  const { status, studentId, classId } = store.findStatusByStudentName(
    studentName,
    candidateClassIds
  )

  const settings = useSettingsStore.getState().settings
  const showStatuses = settings.showStudentStatuses ?? true
  const highlightAbsent = settings.highlightAbsentForInactive ?? true

  if (!showStatuses) {
    userEl.querySelector(`.${LESSON_TAG_CLASS}`)?.remove()
    userEl.querySelector(`.${DOTS_BTN_CLASS}`)?.remove()
    userEl.querySelector(`.${CONFLICT_EMOJI_CLASS}`)?.remove()
    userEl.classList.remove('ha-user--withdrawn', 'ha-row--withdrawn')
    userEl.removeAttribute('data-ha-status')
    userEl.removeAttribute('data-ha-student-id')
    userEl.removeAttribute('data-ha-conflict')
    return
  }

  const isInactive = status !== 'standard'
  const conflict = isInactive && highlightAbsent ? detectAttendanceConflict(userEl) : null
  const conflictKey = conflict ? conflict.conflictType : 'none'

  // Fast check: if element already has this exact status and studentId and conflict state, skip DOM changes!
  if (
    userEl.dataset.haStatus === status &&
    userEl.dataset.haStudentId === studentId &&
    userEl.dataset.haConflict === conflictKey &&
    !userEl.querySelector(`.${DOTS_BTN_CLASS}`)
  ) {
    return
  }

  userEl.dataset.haStatus = status
  userEl.dataset.haStudentId = studentId
  userEl.dataset.haConflict = conflictKey

  const statusConfig = STUDENT_STATUSES[status] || STUDENT_STATUSES.standard

  // 1. Text strikethrough for withdrawn students
  if (status === 'withdrawn') {
    if (!userEl.classList.contains('ha-user--withdrawn')) {
      userEl.classList.add('ha-user--withdrawn', 'ha-row--withdrawn')
    }
  } else {
    if (userEl.classList.contains('ha-user--withdrawn')) {
      userEl.classList.remove('ha-user--withdrawn', 'ha-row--withdrawn')
    }
  }

  // Ensure userEl has relative positioning for the absolute bottom-right corner tag
  if (userEl.style.position !== 'relative') {
    userEl.style.position = 'relative'
  }

  // Remove any leftover dots button if present
  userEl.querySelector(`.${DOTS_BTN_CLASS}`)?.remove()

  // 2. Status badge (colored tag in bottom-right corner like in gradebook)
  let tag = userEl.querySelector(`.${LESSON_TAG_CLASS}`) as HTMLElement | null

  if (status === 'standard') {
    if (tag) {
      tag.remove()
    }
  } else {
    if (!tag) {
      tag = document.createElement('span')
      tag.className = LESSON_TAG_CLASS
      userEl.appendChild(tag)
    } else if (tag.parentNode !== userEl) {
      userEl.appendChild(tag)
    }

    tag.className = `${LESSON_TAG_CLASS} ha-corner--${status}`
    tag.textContent = statusConfig.cornerLabel
    tag.title = `Статус: ${statusConfig.label}. Натисніть, щоб змінити`

    tag.onclick = (e) => {
      e.stopPropagation()
      e.preventDefault()
      toggleDropdown(tag!, studentId, classId)
    }
  }

  // 3. Attendance conflict warning emoji ⚠️ next to the student name (do NOT touch the native icon)
  const nameEl = userEl.querySelector('.name, .bem-user__name, [class*="user__name"]')
  let warningEmoji = userEl.querySelector(`.${CONFLICT_EMOJI_CLASS}`) as HTMLElement | null

  // Clean up any legacy conflict classes on attendance elements or rows
  userEl.classList.remove('ha-row--attendance-conflict')
  userEl.querySelectorAll('.ha-cell--conflict').forEach((el) => {
    el.classList.remove('ha-cell--conflict')
    el.removeAttribute('data-ha-tooltip')
    el.removeAttribute('title')
  })

  if (conflict) {
    if (!warningEmoji) {
      warningEmoji = document.createElement('span')
      warningEmoji.textContent = '⚠️'
      if (nameEl?.parentNode) {
        nameEl.parentNode.insertBefore(warningEmoji, nameEl.nextSibling)
      } else {
        userEl.appendChild(warningEmoji)
      }
    }
    warningEmoji.className = CONFLICT_EMOJI_CLASS
    warningEmoji.style.boxShadow = 'none'
    warningEmoji.style.webkitBoxShadow = 'none'
    warningEmoji.style.border = 'none'
    warningEmoji.style.outline = 'none'
    warningEmoji.style.background = 'transparent'
    warningEmoji.style.backgroundColor = 'transparent'
    warningEmoji.style.textShadow = 'none'
    warningEmoji.style.filter = 'none'
    warningEmoji.setAttribute('data-ha-tooltip', conflict.tooltipText)
    warningEmoji.title = conflict.tooltipText
  } else if (warningEmoji) {
    warningEmoji.remove()
  }
}

let rafHandle: number | null = null

export function scheduleLessonUpdate(): void {
  if (rafHandle !== null) return
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null
    refreshLessonStudentBadges()
  })
}

/**
 * Finds all student cards in the lesson side panel (left-panel)
 * and updates their status indicators and 3-dots menus.
 */
export function refreshLessonStudentBadges(): void {
  if (isUpdating) return
  isUpdating = true

  try {
    const candidateClassIds = getLessonClassCandidates()

    // Find student elements in the left panel, user-item or drawer
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.user-item, .left-panel .user-item, [class*="left-panel"] .user-item, .left-panel .bem-user, [class*="left-panel"] .bem-user, .mat-drawer .bem-user, .flex-block__bem-user, .bem-user'
      )
    )

    // Filter only those that belong to a side panel, drawer or container with student items
    const studentElements = candidates.filter((el) => {
      if (el.classList.contains('user-item')) return true
      return Boolean(
        el.closest(
          '.left-panel, [class*="left-panel"], .mat-drawer, .mat-sidenav, [class*="panel"], [class*="drawer"]'
        )
      )
    })

    studentElements.forEach((el) => {
      updateLessonStudentBadge(el, candidateClassIds)
    })
  } finally {
    isUpdating = false
  }
}

/**
 * Initializes DOM observing for the lesson side panel.
 */
export async function initLessonStatusDOM(): Promise<void> {
  destroyLessonStatusDOM()
  initTooltipListeners()

  // 1. Observe DOM mutations safely via requestAnimationFrame debouncing
  lessonObserver = new MutationObserver((mutations) => {
    const isInternal = mutations.every((m) => {
      const t = m.target as HTMLElement
      return (
        t?.classList?.contains(DOTS_BTN_CLASS) ||
        t?.classList?.contains(LESSON_TAG_CLASS) ||
        t?.classList?.contains(CONFLICT_EMOJI_CLASS) ||
        t?.classList?.contains('ha-status-dropdown') ||
        Boolean(
          t?.closest?.(
            `.${DOTS_BTN_CLASS}, .${LESSON_TAG_CLASS}, .${CONFLICT_EMOJI_CLASS}, .ha-status-dropdown`
          )
        )
      )
    })
    if (isInternal) return

    scheduleLessonUpdate()
  })

  const targetContainer =
    document.querySelector('.left-panel, [class*="left-panel"], .mat-drawer, .mat-sidenav') ||
    document.body

  lessonObserver.observe(targetContainer, {
    childList: true,
    subtree: true,
  })

  // 2. Await loading stored statuses
  await useStudentStatusesStore.getState().loadStatuses()

  const candidateClassIds = getLessonClassCandidates()
  const primaryCandidate = candidateClassIds[0]
  if (primaryCandidate) {
    await useStudentStatusesStore.getState().loadStatuses(primaryCandidate)
  }

  // 3. Render badges immediately with stored data
  scheduleLessonUpdate()
  window.addEventListener('ha:students-updated', scheduleLessonUpdate)

  // 4. Fetch and map lesson students via background API
  const lessonMatch = window.location.href.match(/\/lesson\/(\d+)/i)
  const lessonId = lessonMatch ? Number(lessonMatch[1]) : undefined
  loadLessonStudents(lessonId, primaryCandidate)
}

/**
 * Cleans up listeners and observers for the lesson page.
 */
export function destroyLessonStatusDOM(): void {
  window.removeEventListener('ha:students-updated', scheduleLessonUpdate)
  if (lessonObserver) {
    lessonObserver.disconnect()
    lessonObserver = null
  }
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle)
    rafHandle = null
  }
  disconnectLessonObserver()
  closeActiveDropdown()
}
