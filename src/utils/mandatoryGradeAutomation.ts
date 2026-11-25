import { HA_CLASSES } from '@/constants/selectors'
import useStudentStatusesStore from '@/stores/useStudentStatusesStore'
import { clearColumnHighlight } from '@/utils/columnContourHighlight'
import { cellAbsent } from '@/utils/gradebook'
import { enterGradeToCell } from '@/utils/gradebookCellAutomation'
import {
  getStudentIdFromRow,
  hasActualGrade,
  refreshStudentStatusBadges,
} from '@/utils/studentStatusDOM'

export interface MandatoryEligibleItem {
  studentName: string
  taskCell: HTMLElement | null
  lessonCell: HTMLElement | null
}

export interface FillMandatoryGradesOptions {
  taskColIndex: number | null
  lessonColIndex: number | null
  grade: number
  includeLessonCol: boolean
  onProgress?: (current: number, total: number) => void
  isStopping?: () => boolean
}

/**
 * Scans the visible gradebook rows and returns all students
 * who are active (standard) and have no grade or absence mark in both
 * "Завдання" and "Заняття" columns.
 */
export function getEligibleMandatoryGradeItems(
  taskColIndex: number | null,
  lessonColIndex: number | null
): MandatoryEligibleItem[] {
  if (taskColIndex === null && lessonColIndex === null) {
    return []
  }

  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.gradebook-container__table2-outlet .gradebook-container__table2-row'
    )
  )

  const items: MandatoryEligibleItem[] = []
  const statusesStore = useStudentStatusesStore.getState()

  rows.forEach((row) => {
    const studentId = getStudentIdFromRow(row)
    const status = studentId ? statusesStore.getStatus(studentId) : 'standard'
    if (status !== 'standard') return

    let cells = Array.from(row.querySelectorAll<HTMLElement>('.gradebook-narrow__cell'))
    if (cells.length === 0) {
      cells = Array.from(row.querySelectorAll<HTMLElement>('.smart-cell')).filter(
        (c) => !c.classList.contains('smart-cell--width-270') && !c.querySelector('.bem-user')
      )
    }

    const taskCell = taskColIndex !== null ? cells[taskColIndex] : null
    const lessonCell = lessonColIndex !== null ? cells[lessonColIndex] : null

    const hasTaskGrade = taskCell ? hasActualGrade(taskCell) : false
    const hasLessonGrade = lessonCell ? hasActualGrade(lessonCell) : false
    const isTaskAbsent = taskCell ? Boolean(cellAbsent(taskCell)) : false
    const isLessonAbsent = lessonCell ? Boolean(cellAbsent(lessonCell)) : false

    // Eligible ONLY if BOTH cells are empty (no grade in either and neither is absent)
    if (!hasTaskGrade && !hasLessonGrade && !isTaskAbsent && !isLessonAbsent) {
      const nameEl = row.querySelector('.bem-user__name') as HTMLElement | null
      const studentName = nameEl?.innerText?.trim() || ''
      items.push({ studentName, taskCell, lessonCell })
    }
  })

  return items
}

/**
 * Highlights target cells in the gradebook that will be filled with mandatory grades.
 */
export function highlightMandatoryTargetCells(
  taskColIndex: number | null,
  lessonColIndex: number | null,
  includeLessonCol: boolean
): void {
  clearMandatoryTargetHighlight()
  const eligibleItems = getEligibleMandatoryGradeItems(taskColIndex, lessonColIndex)
  eligibleItems.forEach((item) => {
    if (item.taskCell && !cellAbsent(item.taskCell) && !hasActualGrade(item.taskCell)) {
      item.taskCell.classList.add(HA_CLASSES.COPY_PREVIEW)
    }
    if (
      includeLessonCol &&
      item.lessonCell &&
      !cellAbsent(item.lessonCell) &&
      !hasActualGrade(item.lessonCell)
    ) {
      item.lessonCell.classList.add(HA_CLASSES.COPY_PREVIEW)
    }
  })
}

/**
 * Clears mandatory grade preview highlighting from all cells.
 */
export function clearMandatoryTargetHighlight(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll(`.${HA_CLASSES.COPY_PREVIEW}`).forEach((el) => {
    el.classList.remove(HA_CLASSES.COPY_PREVIEW)
  })
}

/**
 * Automates entering the selected mandatory grade for all eligible students.
 */
export async function executeFillMandatoryGrades({
  taskColIndex,
  lessonColIndex,
  grade,
  includeLessonCol,
  onProgress,
  isStopping,
}: FillMandatoryGradesOptions): Promise<boolean> {
  const eligibleItems = getEligibleMandatoryGradeItems(taskColIndex, lessonColIndex)
  if (eligibleItems.length === 0) {
    clearMandatoryTargetHighlight()
    return true
  }

  onProgress?.(0, eligibleItems.length)

  for (let i = 0; i < eligibleItems.length; i++) {
    if (isStopping?.()) break

    const item = eligibleItems[i]

    // 1. Fill "Завдання"
    if (item.taskCell && !cellAbsent(item.taskCell) && !hasActualGrade(item.taskCell)) {
      item.taskCell.classList.remove(HA_CLASSES.COPY_PREVIEW)
      await enterGradeToCell(item.taskCell, grade, isStopping)
    }

    // 2. Also fill "Заняття" if requested
    if (
      includeLessonCol &&
      item.lessonCell &&
      !cellAbsent(item.lessonCell) &&
      !hasActualGrade(item.lessonCell)
    ) {
      if (!isStopping?.()) {
        item.lessonCell.classList.remove(HA_CLASSES.COPY_PREVIEW)
        await enterGradeToCell(item.lessonCell, grade, isStopping)
      }
    }

    onProgress?.(i + 1, eligibleItems.length)
  }

  // Persist last selected grade
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ ha_last_mandatory_grade: grade })
    }
  } catch {
    // ignore
  }

  clearMandatoryTargetHighlight()
  clearColumnHighlight()
  refreshStudentStatusBadges()

  return true
}
