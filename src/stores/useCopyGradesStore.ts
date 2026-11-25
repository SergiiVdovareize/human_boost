import { create } from 'zustand'

import { stopAndCloseAllAutomations } from '@/utils/automationCoordinator'
import { clearCopyTargetHighlight } from '@/utils/gradebookAutomation'

interface CopyGradesState {
  isOpen: boolean
  isProcessing: boolean
  isStopping: boolean
  openModal: () => void
  closeModal: () => void
  setIsProcessing: (isProcessing: boolean) => void
  setIsStopping: (isStopping: boolean) => void
}

export const useCopyGradesStore = create<CopyGradesState>((set) => ({
  isOpen: false,
  isProcessing: false,
  isStopping: false,

  openModal: () => {
    // 1. Close and reset any other active automation action
    stopAndCloseAllAutomations('copy_grades')

    set({
      isOpen: true,
      isProcessing: false,
      isStopping: false,
    })
  },

  closeModal: () => {
    clearCopyTargetHighlight()
    set({
      isOpen: false,
      isProcessing: false,
      isStopping: true,
    })
  },

  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setIsStopping: (isStopping) => set({ isStopping }),
}))
