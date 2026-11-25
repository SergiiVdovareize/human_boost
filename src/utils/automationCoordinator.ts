import { useCopyGradesStore } from '@/stores/useCopyGradesStore'
import { useMandatoryGradeModalStore } from '@/stores/useMandatoryGradeModalStore'
import { clearColumnHighlight } from '@/utils/columnContourHighlight'
import { clearCopyTargetHighlight } from '@/utils/gradebookAutomation'
import { clearMandatoryTargetHighlight } from '@/utils/mandatoryGradeAutomation'

export type AutomationType = 'copy_grades' | 'mandatory_grades'

/**
 * Ensures strict mutual exclusion between automation actions.
 * Only one action can be configuring, previewing, or executing at any time.
 * When a new action is initiated, any previously active action is closed,
 * cancelled if running, and restored to its default (base) state.
 */
export function stopAndCloseAllAutomations(except?: AutomationType): void {
  if (except !== 'copy_grades') {
    const copyStore = useCopyGradesStore.getState()
    if (copyStore.isOpen || copyStore.isProcessing) {
      copyStore.closeModal()
    }
    clearCopyTargetHighlight()
  }

  if (except !== 'mandatory_grades') {
    const mandatoryStore = useMandatoryGradeModalStore.getState()
    if (mandatoryStore.isOpen || mandatoryStore.isProcessing) {
      mandatoryStore.closeModal()
    }
    clearMandatoryTargetHighlight()
    clearColumnHighlight()
  }
}
