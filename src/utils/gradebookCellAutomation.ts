import { TIMING } from '@/constants/config'
import { GRADEBOOK_SELECTORS } from '@/constants/selectors'
import { cellRemoveSelected } from '@/utils/gradebook'

export type CancelPredicate = () => boolean

/**
 * Enters a grade score into a human.ua gradebook cell with proper UI event dispatching
 * and debounce delays, ensuring the platform accepts the input and clicks the approve button.
 *
 * @param cell Target cell HTMLElement
 * @param score Grade value to enter (1-12 or string)
 * @param isCancelled Optional callback checking if the process was stopped by user
 * @returns Promise resolving to true if grade was entered, false if cancelled
 */
export async function enterGradeToCell(
  cell: HTMLElement,
  score: number | string,
  isCancelled?: CancelPredicate
): Promise<boolean> {
  if (isCancelled?.()) return false

  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      if (isCancelled?.()) {
        resolve(false)
        return
      }

      cellRemoveSelected(false, cell)
      cell.click()
      cell.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })

      setTimeout(() => {
        if (isCancelled?.()) {
          resolve(false)
          return
        }

        const inputMarkGroup = document.querySelector<HTMLInputElement>(
          GRADEBOOK_SELECTORS.MARK_INPUT
        )

        if (inputMarkGroup) {
          inputMarkGroup.value = String(score)
          inputMarkGroup.dispatchEvent(new Event('input', { bubbles: true }))
        }

        setTimeout(() => {
          if (isCancelled?.()) {
            resolve(false)
            return
          }

          const approveBtn = document.querySelector<HTMLElement>(
            GRADEBOOK_SELECTORS.MARK_APPROVE_BTN
          )

          if (approveBtn) {
            approveBtn.click()
          }

          resolve(true)
        }, TIMING.APPROVAL_DELAY)
      }, TIMING.INNER_TIMEOUT)
    }, TIMING.OUTER_TIMEOUT)
  })
}
