import { useMandatoryGradeModalStore } from '@/stores/useMandatoryGradeModalStore'
import useModalStore from '@/stores/useModalStore'
import { getEligibleMandatoryGradeItems } from '@/utils/mandatoryGradeAutomation'
import { MANDATORY_ASSESSMENT_REGEX, parseLessonDate } from '@/utils/studentStatusDOM'

let lastClickedLessonBlock: HTMLElement | null = null
let lastClickedTime = 0
let menuObserver: MutationObserver | null = null
let clickListenersAttached = false

export function initMandatoryGradeMenu(): void {
  if (typeof document === 'undefined') return

  if (!clickListenersAttached) {
    clickListenersAttached = true

    // Track clicks on lesson header elements (especially the 3-dots button)
    const handleLessonHeaderClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const headerItem = target.closest<HTMLElement>(
        '.gradebook-narrow__main-header__item, .g-main-header__item'
      )
      if (headerItem) {
        lastClickedLessonBlock = headerItem
        lastClickedTime = Date.now()
      }
    }

    document.addEventListener('mousedown', handleLessonHeaderClick, true)
    document.addEventListener('click', handleLessonHeaderClick, true)
  }

  if (menuObserver) return

  // Watch for Angular dropdowns attached to document.body
  menuObserver = new MutationObserver(() => {
    const dropdowns = document.querySelectorAll<HTMLElement>(
      '.dropdown.dropdown--default, .dropdown--default, [class*="dropdown--default"]'
    )
    dropdowns.forEach((dropdown) => {
      tryInjectMandatoryMenuItem(dropdown)
    })
  })

  menuObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

export function destroyMandatoryGradeMenu(): void {
  if (menuObserver) {
    menuObserver.disconnect()
    menuObserver = null
  }
}

function tryInjectMandatoryMenuItem(dropdown: HTMLElement): void {
  if (dropdown.querySelector('.ha-mandatory-grades-menu-item')) return
  if (!lastClickedLessonBlock || !document.body.contains(lastClickedLessonBlock)) return
  if (Date.now() - lastClickedTime > 2000) return

  // Verify that this dropdown is indeed a lesson header dropdown
  const dropdownText = dropdown.textContent || ''
  const isLessonMenu =
    dropdownText.includes('Створити урок') ||
    dropdownText.includes('Приховати урок') ||
    dropdownText.includes('Приховати дату') ||
    dropdownText.includes('Редагувати урок') ||
    dropdownText.includes('Видалити урок') ||
    dropdownText.includes('Відкрити урок') ||
    dropdownText.includes('Показати дату') ||
    dropdownText.includes('Показати урок')

  if (!isLessonMenu) return

  // Only allow past lessons (including today). Future lessons must not show the menu item.
  const lessonDate = parseLessonDate(lastClickedLessonBlock)
  if (lessonDate) {
    const now = new Date()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    if (lessonDate.getTime() > todayEnd.getTime()) {
      return
    }
  }

  // Check that this date block has subcolumns in the journal
  const lessonSubCols = lastClickedLessonBlock.querySelectorAll<HTMLElement>(
    '.gradebook-narrow__header-item'
  )
  if (lessonSubCols.length === 0) return

  const titleEl = lastClickedLessonBlock.querySelector<HTMLElement>(
    '.gradebook-narrow__header-title-text, .g-main-header__head-title, a'
  )
  const lessonTopic = (
    titleEl?.getAttribute('data-awesome-tooltip') ||
    titleEl?.getAttribute('title') ||
    titleEl?.textContent ||
    lastClickedLessonBlock.getAttribute('data-awesome-tooltip') ||
    ''
  ).trim()

  const logoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('icons/logo.svg')
      : ''

  // Create menu item button (separated with 2px #e4e4e4 border-top, branded with Human Boost logo and color)
  const buttonWrapper = document.createElement('div')
  buttonWrapper.className = 'ng-star-inserted ha-mandatory-grades-menu-item'
  buttonWrapper.innerHTML = `
    <button class="black-cl button event-strategy-2 full-width medium no-select text-left clickable ha-mandatory-menu-btn" type="button">
      ${logoUrl ? `<img src="${logoUrl}" alt="Human Boost" class="ha-mandatory-menu-logo" />` : ''}
      <span class="ha-mandatory-menu-text">
        Проставити пропущені оцінки
      </span>
      <div class="overlay clickable"></div>
    </button>
  `

  buttonWrapper.onclick = (e) => {
    e.stopPropagation()
    e.preventDefault()

    const targetLessonBlock = lastClickedLessonBlock!

    // Close the dropdown cleanly
    dropdown.remove()

    // Trigger modal opening
    openModalForLesson(targetLessonBlock, lessonTopic)
  }

  dropdown.appendChild(buttonWrapper)
}

const UK_MONTH_NAMES = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
]

const UK_MONTH_REGEXES = [
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

export function formatFullLessonDate(
  dayNumber: string,
  dayText: string,
  lessonBlock?: HTMLElement | null
): string {
  const mIndex = UK_MONTH_REGEXES.findIndex((rx) => rx.test(dayText))
  if (mIndex !== -1) {
    const fullMonth = UK_MONTH_NAMES[mIndex]
    return dayNumber ? `${dayNumber} ${fullMonth}` : fullMonth
  }

  if (lessonBlock) {
    const parsed = parseLessonDate(lessonBlock)
    if (parsed) {
      const d = dayNumber || String(parsed.getDate()).padStart(2, '0')
      return `${d} ${UK_MONTH_NAMES[parsed.getMonth()]}`
    }
  }

  return `${dayNumber} ${dayText}`.trim()
}

function openModalForLesson(lessonBlock: HTMLElement, lessonTopic: string): void {
  if (!document.getElementById('human-automator-app')) {
    const floatingBtn = document.getElementById('human-automator')
    if (floatingBtn) {
      floatingBtn.click()
      useModalStore.getState().setShowModalBasic(false)
    }
  }

  const allSubColEls = Array.from(
    document.querySelectorAll<HTMLElement>('.gradebook-narrow__header-item')
  )
  const lessonSubCols = Array.from(
    lessonBlock.querySelectorAll<HTMLElement>('.gradebook-narrow__header-item')
  )

  const subColIndices = lessonSubCols
    .map((el) => allSubColEls.indexOf(el))
    .filter((idx) => idx !== -1)

  const colIndexStart = subColIndices.length > 0 ? Math.min(...subColIndices) : 0
  const colIndexEnd = subColIndices.length > 0 ? Math.max(...subColIndices) : 0

  const dayNumber = lessonBlock.querySelector('.date__day-number')?.textContent?.trim() || ''
  const dayText = lessonBlock.querySelector('.date__day-text')?.textContent?.trim() || ''
  const lessonDateText = formatFullLessonDate(dayNumber, dayText, lessonBlock)

  const isMandatory = MANDATORY_ASSESSMENT_REGEX.test(lessonTopic)

  const taskSubCol = lessonSubCols.find((el) => {
    const txt = (
      el.querySelector('.gradebook-narrow__header-item_text, .gradebook-narrow__clamp-2')
        ?.textContent ||
      el.textContent ||
      ''
    ).trim()
    return /завдання/i.test(txt)
  })

  const lessonSubCol = lessonSubCols.find((el) => {
    const txt = (
      el.querySelector('.gradebook-narrow__header-item_text, .gradebook-narrow__clamp-2')
        ?.textContent ||
      el.textContent ||
      ''
    ).trim()
    return /заняття/i.test(txt)
  })

  const rawTaskColIndex = taskSubCol ? allSubColEls.indexOf(taskSubCol) : null
  const rawLessonColIndex = lessonSubCol ? allSubColEls.indexOf(lessonSubCol) : null

  let taskColIndex: number | null = null
  let lessonColIndex: number | null = null
  let primaryColTitle = 'Завдання'
  let secondaryColTitle: string | null = null

  // "Завдання" is always the primary column if it exists in the lesson
  if (rawTaskColIndex !== null) {
    taskColIndex = rawTaskColIndex
    primaryColTitle = 'Завдання'
    if (rawLessonColIndex !== null && rawLessonColIndex !== taskColIndex) {
      lessonColIndex = rawLessonColIndex
      secondaryColTitle = 'Заняття'
    }
  } else if (rawLessonColIndex !== null) {
    // Fallback if only "Заняття" column is present
    taskColIndex = rawLessonColIndex
    primaryColTitle = 'Заняття'
  } else {
    taskColIndex = colIndexStart
    const firstColText = (
      lessonSubCols[0]?.querySelector(
        '.gradebook-narrow__header-item_text, .gradebook-narrow__clamp-2'
      )?.textContent ||
      lessonSubCols[0]?.textContent ||
      ''
    ).trim()
    primaryColTitle = firstColText || 'Урок'
  }

  const eligibleItems = getEligibleMandatoryGradeItems(taskColIndex, lessonColIndex)
  const eligibleStudentNames = eligibleItems.map((item) => item.studentName)

  useMandatoryGradeModalStore.getState().openModal({
    lessonTopic: lessonTopic || 'Тема не вказана',
    lessonDateText,
    lessonBlock,
    colIndexStart,
    colIndexEnd,
    taskColIndex,
    lessonColIndex,
    eligibleStudentNames,
    isMandatory,
    primaryColTitle,
    secondaryColTitle,
  })
}
