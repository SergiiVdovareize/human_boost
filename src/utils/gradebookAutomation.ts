import { cellAbsent, rating } from '@/utils/gradebook'
import { enterGradeToCell } from '@/utils/gradebookCellAutomation'
import { hasActualGrade, isCellAbsentMark } from '@/utils/studentStatusDOM'

export interface AutomationLessonOption {
  id: string
  dateText: string
  topic: string
  fullLabel: string
  lessonBlock: HTMLElement
  taskColIndex: number
  lessonColIndex: number
}

export type CopyDirection = 'taskToLesson' | 'lessonToTask'

export interface CopyGradeItem {
  row: HTMLElement
  studentName: string
  sourceCell: HTMLElement
  targetCell: HTMLElement
  sourceGrade: number
  currentTargetGrade: number | null
}

/**
 * Returns the numeric grade of a cell (1-12) or null if empty / absent / invalid.
 */
export function getCellNumericGrade(cell: HTMLElement): number | null {
  if (!cell || !hasActualGrade(cell)) return null
  const r = rating(cell)
  if (r !== null && !isNaN(r) && r > 0 && r <= 12) return r

  const match = (cell.textContent || '').match(/\b(\d{1,2})\b/)
  if (match) {
    const val = Number(match[1])
    if (val >= 1 && val <= 12) return val
  }
  return null
}

/**
 * Discovers all lessons in the current gradebook that have BOTH
 * a "Завдання" and a "Заняття" subcolumn.
 */
export function getGradebookLessons(): AutomationLessonOption[] {
  if (typeof document === 'undefined') return []

  const allSubColEls = Array.from(
    document.querySelectorAll<HTMLElement>('.gradebook-narrow__header-item')
  )
  if (allSubColEls.length === 0) return []

  const lessonBlocks = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.gradebook-narrow__main-header__item, .g-main-header__item'
    )
  )

  const lessons: AutomationLessonOption[] = []

  lessonBlocks.forEach((lessonBlock, idx) => {
    const subCols = Array.from(
      lessonBlock.querySelectorAll<HTMLElement>('.gradebook-narrow__header-item')
    )
    if (subCols.length === 0) return

    const taskSubCol = subCols.find((el) => {
      const txt = (
        el.querySelector('.gradebook-narrow__header-item_text, .gradebook-narrow__clamp-2')
          ?.textContent ||
        el.textContent ||
        ''
      ).trim()
      return /завдання/i.test(txt)
    })

    const lessonSubCol = subCols.find((el) => {
      const txt = (
        el.querySelector('.gradebook-narrow__header-item_text, .gradebook-narrow__clamp-2')
          ?.textContent ||
        el.textContent ||
        ''
      ).trim()
      return /заняття/i.test(txt)
    })

    if (!taskSubCol || !lessonSubCol) return

    const taskColIndex = allSubColEls.indexOf(taskSubCol)
    const lessonColIndex = allSubColEls.indexOf(lessonSubCol)
    if (taskColIndex === -1 || lessonColIndex === -1) return

    const dayNumber = lessonBlock.querySelector('.date__day-number')?.textContent?.trim() || ''
    const dayText = lessonBlock.querySelector('.date__day-text')?.textContent?.trim() || ''
    const dateText = `${dayNumber} ${dayText}`.trim()

    const titleEl = lessonBlock.querySelector<HTMLElement>(
      '.gradebook-narrow__header-title-text, .g-main-header__head-title, a'
    )
    const topic = (
      titleEl?.getAttribute('data-awesome-tooltip') ||
      titleEl?.getAttribute('title') ||
      titleEl?.textContent ||
      lessonBlock.getAttribute('data-awesome-tooltip') ||
      ''
    ).trim()

    const fullLabel = dateText ? `${dateText} — ${topic || 'Урок'}` : topic || `Урок #${idx + 1}`

    lessons.push({
      id: `lesson-${idx}-${dateText}`,
      dateText,
      topic,
      fullLabel,
      lessonBlock,
      taskColIndex,
      lessonColIndex,
    })
  })

  return lessons
}

/**
 * Calculates all eligible student items whose grades will be copied for the given lesson and direction.
 * In accordance with user requirements:
 * - Direction is strictly one-way ('taskToLesson' or 'lessonToTask').
 * - All students in the class without exception are processed.
 * - Cells with absence "Н" are NEVER overwritten.
 * - If overwriteLower is false: only completely empty target cells are filled.
 * - If overwriteLower is true: also overwrites target cells where sourceGrade > currentTargetGrade.
 */
export function getEligibleCopyItems(
  lesson: AutomationLessonOption,
  direction: CopyDirection,
  overwriteLower: boolean
): CopyGradeItem[] {
  if (typeof document === 'undefined') return []

  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.gradebook-container__table2-outlet .gradebook-container__table2-row'
    )
  )

  const items: CopyGradeItem[] = []

  const sourceColIndex = direction === 'taskToLesson' ? lesson.taskColIndex : lesson.lessonColIndex
  const targetColIndex = direction === 'taskToLesson' ? lesson.lessonColIndex : lesson.taskColIndex

  rows.forEach((row) => {
    let cells = Array.from(row.querySelectorAll<HTMLElement>('.gradebook-narrow__cell'))
    if (cells.length === 0) {
      cells = Array.from(row.querySelectorAll<HTMLElement>('.smart-cell')).filter(
        (c) => !c.classList.contains('smart-cell--width-270') && !c.querySelector('.bem-user')
      )
    }

    const sourceCell = cells[sourceColIndex]
    const targetCell = cells[targetColIndex]
    if (!sourceCell || !targetCell) return

    // Never touch cells with absence "Н" (Strict rule #4 in AGENTS.md)
    if (cellAbsent(targetCell) || isCellAbsentMark(targetCell)) return

    const sourceGrade = getCellNumericGrade(sourceCell)
    if (sourceGrade === null || sourceGrade <= 0) return

    const currentTargetGrade = getCellNumericGrade(targetCell)

    // 1. Target is empty: copy grade
    if (currentTargetGrade === null) {
      const nameEl = row.querySelector('.bem-user__name') as HTMLElement | null
      const studentName = nameEl?.innerText?.trim() || ''
      items.push({
        row,
        studentName,
        sourceCell,
        targetCell,
        sourceGrade,
        currentTargetGrade: null,
      })
      return
    }

    // 2. Target has grade, but overwriteLower is enabled and sourceGrade is strictly higher
    if (overwriteLower && sourceGrade > currentTargetGrade) {
      const nameEl = row.querySelector('.bem-user__name') as HTMLElement | null
      const studentName = nameEl?.innerText?.trim() || ''
      items.push({
        row,
        studentName,
        sourceCell,
        targetCell,
        sourceGrade,
        currentTargetGrade,
      })
    }
  })

  return items
}

/**
 * Calculates all eligible student items across ALL lessons in the current period (month)
 * according to the selected direction and overwriteLower settings.
 */
export function getAllEligibleCopyItemsForPeriod(
  direction: CopyDirection,
  overwriteLower: boolean
): {
  items: CopyGradeItem[]
  lessons: AutomationLessonOption[]
  periodTitle: string
} {
  const lessons = getGradebookLessons()
  const allItems: CopyGradeItem[] = []

  lessons.forEach((lesson) => {
    const lessonItems = getEligibleCopyItems(lesson, direction, overwriteLower)
    allItems.push(...lessonItems)
  })

  // Detect month / period title
  let periodTitle = `Поточний період (${lessons.length} уроків)`
  const ukMonthNames: Record<string, string> = {
    січ: 'Січень',
    лют: 'Лютий',
    бер: 'Березень',
    кві: 'Квітень',
    тра: 'Травень',
    чер: 'Червень',
    лип: 'Липень',
    сер: 'Серпень',
    вер: 'Вересень',
    жов: 'Жовтень',
    лис: 'Листопад',
    гру: 'Грудень',
  }

  for (const lesson of lessons) {
    const lower = lesson.dateText.toLowerCase()
    const foundKey = Object.keys(ukMonthNames).find((k) => lower.includes(k))
    if (foundKey) {
      periodTitle = `${ukMonthNames[foundKey]} (${lessons.length} уроків)`
      break
    }
  }

  return {
    items: allItems,
    lessons,
    periodTitle,
  }
}

/**
 * Highlights target cells in the gradebook that will be filled with copied grades.
 */
export function highlightCopyTargetCells(cells: HTMLElement[]): void {
  clearCopyTargetHighlight()
  cells.forEach((cell) => {
    cell.classList.add('ha-cell--copy-preview')
  })
}

/**
 * Clears copy preview highlighting from all cells.
 */
export function clearCopyTargetHighlight(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('.ha-cell--copy-preview').forEach((el) => {
    el.classList.remove('ha-cell--copy-preview')
  })
}

/**
 * Enters a score into a gradebook cell with proper timing and dispatching events.
 */
export async function executeFillCellGrade(
  cell: HTMLElement,
  score: number,
  isStoppingRef: { current: boolean }
): Promise<void> {
  await enterGradeToCell(cell, score, () => isStoppingRef.current)
}
