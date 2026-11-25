export const getRows = (): HTMLElement[] => [
  ...(document.querySelectorAll(
    '.gradebook-container__table2-outlet .gradebook-container__table2-row'
  ) as unknown as HTMLElement[]),
]

export const getCells = (): HTMLElement[] => [
  ...(document.querySelectorAll(
    '.gradebook-container__table .gradebook-container__table2-row .gradebook-narrow__cell.smart-cell'
  ) as unknown as HTMLElement[]),
]

export const isGradebookPage = (): boolean => {
  try {
    const url = document.location.href.toLowerCase()
    if (url.includes('gradebook') || url.includes('grade-book')) {
      return true
    }
    return Boolean(
      document.querySelector(
        '.gradebook-container, .gradebook-narrow__cell, .gradebook-container__table2-outlet'
      )
    )
  } catch {
    return false
  }
}

export const getClassId = (): number => {
  try {
    const path = new URL(document.location.href).pathname

    // Match explicit gradebook/journal class ID pattern:
    // e.g. /gradebook/12345 or /grade-book/12345 or /journal/12345
    const match = path.match(/\/(?:grade-?book|journal)\/(\d+)/i)
    if (match?.[1]) {
      return Number(match[1])
    }

    // Fallback: only if we are actually on a gradebook page, look for numeric segment
    if (isGradebookPage()) {
      const segments = path.split('/').filter(Boolean)
      for (let i = segments.length - 1; i >= 0; i--) {
        const num = Number(segments[i])
        if (!Number.isNaN(num) && num > 0) {
          return num
        }
      }
    }

    return 0
  } catch {
    return 0
  }
}

export const getClassLabel = (): string =>
  (document.querySelector('.group-switcher-title.label') as HTMLElement)?.innerText.trim()

export const cellRating = (cell: HTMLElement): HTMLElement | null => {
  return cell.querySelector('.badge__item--no-border')
}

export const cellTaskRating = (cell: HTMLElement): HTMLElement | null => {
  return cell.querySelector('.cell--last .badge__item--no-border')
}

export const rating = (cell: HTMLElement): number | null => {
  const rating = cellRating(cell)?.innerText.trim()
  return rating ? Number(rating) : null
}

export const taskRating = (cell: HTMLElement): number | null => {
  const rating = cellTaskRating(cell)?.innerText.trim()
  return rating ? Number(rating) : null
}

export const ratingComment = (cell: HTMLElement): HTMLElement | null => {
  return cell.querySelector('.gradebook__ng-universal-rating-comments')
}

export const cellAbsent = (cell: HTMLElement): HTMLElement | null => {
  return cell.querySelector('.pseudo-button--color-red')
}

export const cellsNarrow = (row: HTMLElement): NodeListOf<HTMLElement> => {
  return row.querySelectorAll('.gradebook-narrow__cell.smart-cell')
}

export const studentName = (row: HTMLElement): string => {
  return (row.querySelector('.bem-user__name') as HTMLElement).innerText.trim()
}

export const students = (): string[] => {
  return getRows().map((row) => studentName(row))
}

export const toolPanel = (isHide: boolean): void => {
  const toolPanel = document.querySelector('.gradebook-page__tool-panel')

  if (isHide) {
    toolPanel?.classList.add('d-none')
  } else {
    toolPanel?.classList.remove('d-none')
  }
}

export const cellRemoveSelected = (isRemove: boolean, cell?: HTMLElement): void => {
  if (cell) {
    if (isRemove) {
      cell.classList.add('remove-smart-cell-selected')
    } else {
      cell.classList.remove('remove-smart-cell-selected')
    }
    return
  }

  const cells = document.querySelectorAll('.gradebook-narrow__cell.smart-cell')

  if (isRemove) {
    cells.forEach((cell) => {
      cell.classList.add('remove-smart-cell-selected')
    })
  } else {
    cells.forEach((cell) => {
      cell.classList.remove('remove-smart-cell-selected')
    })
  }
}
