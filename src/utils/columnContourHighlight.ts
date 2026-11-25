/**
 * Utilities for highlighting the background of a wide gradebook column
 * (all subcolumns for a specific date: Відвідуваність, Заняття, Завдання).
 */

export function clearColumnHighlight(): void {
  document
    .querySelectorAll(
      '.ha-col-highlight--lesson-head, .ha-col-highlight--header, .ha-col-highlight--cell'
    )
    .forEach((el) => {
      el.classList.remove(
        'ha-col-highlight--lesson-head',
        'ha-col-highlight--header',
        'ha-col-highlight--cell'
      )
    })
}

// Alias for backwards compatibility
export const clearColumnContour = clearColumnHighlight

export function highlightWideColumn(
  colIndexStart: number | null,
  colIndexEnd: number | null,
  lessonBlock: HTMLElement | null
): void {
  clearColumnHighlight()

  if (colIndexStart === null || colIndexEnd === null || colIndexStart < 0 || colIndexEnd < 0) {
    return
  }

  // Highlight wide lesson header container
  if (lessonBlock) {
    const headContainer = lessonBlock.querySelector<HTMLElement>(
      '.gradebook-narrow__header-container, .g-main-header__head'
    )
    if (headContainer) {
      headContainer.classList.add('ha-col-highlight--lesson-head')
      const rect = headContainer.getBoundingClientRect()
      if (rect.left < 280 || rect.right > window.innerWidth - 380) {
        headContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }

  const allHeaderItems = Array.from(
    document.querySelectorAll<HTMLElement>('.gradebook-narrow__header-item')
  )

  // Highlight each subcolumn header in the range
  for (let c = colIndexStart; c <= colIndexEnd; c++) {
    const headerItem = allHeaderItems[c]
    if (headerItem) {
      headerItem.classList.add('ha-col-highlight--header')
    }
  }

  // Highlight student rows in the virtual scroll outlet
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.gradebook-container__table2-outlet .gradebook-container__table2-row'
    )
  )

  if (rows.length === 0) return

  rows.forEach((row) => {
    let cells = Array.from(row.querySelectorAll<HTMLElement>('.gradebook-narrow__cell'))
    if (cells.length === 0) {
      cells = Array.from(row.querySelectorAll<HTMLElement>('.smart-cell')).filter(
        (cell) =>
          !cell.classList.contains('smart-cell--width-270') && !cell.querySelector('.bem-user')
      )
    }

    for (let c = colIndexStart; c <= colIndexEnd; c++) {
      const cell = cells[c]
      if (cell) {
        cell.classList.add('ha-col-highlight--cell')
      }
    }
  })
}

// Alias for backwards compatibility
export const highlightWideColumnContour = highlightWideColumn
