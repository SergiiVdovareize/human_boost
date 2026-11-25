import { create } from 'zustand'

import { stopAndCloseAllAutomations } from '@/utils/automationCoordinator'

const STORAGE_KEY = 'ha_last_mandatory_grade'

export interface OpenMandatoryModalParams {
  lessonTopic: string
  lessonDateText: string
  lessonBlock: HTMLElement
  colIndexStart: number
  colIndexEnd: number
  taskColIndex: number | null
  lessonColIndex: number | null
  eligibleStudentNames: string[]
  isMandatory?: boolean
  primaryColTitle?: string
  secondaryColTitle?: string | null
}

interface MandatoryGradeModalState {
  isOpen: boolean
  lessonTopic: string
  lessonDateText: string
  lessonBlock: HTMLElement | null
  colIndexStart: number | null
  colIndexEnd: number | null
  taskColIndex: number | null
  lessonColIndex: number | null
  eligibleStudentNames: string[]
  isMandatory: boolean
  primaryColTitle: string
  secondaryColTitle: string | null
  includeLessonCol: boolean
  grade: number
  isProcessing: boolean
  isStopping: boolean
  currentProgress: number
  totalProgress: number
  openModal: (data: OpenMandatoryModalParams) => void
  closeModal: () => void
  setIncludeLessonCol: (include: boolean) => void
  setGrade: (grade: number) => void
  setIsProcessing: (isProcessing: boolean) => void
  setProgress: (current: number, total: number) => void
  requestStop: () => void
}

export const useMandatoryGradeModalStore = create<MandatoryGradeModalState>((set, get) => ({
  isOpen: false,
  lessonTopic: '',
  lessonDateText: '',
  lessonBlock: null,
  colIndexStart: null,
  colIndexEnd: null,
  taskColIndex: null,
  lessonColIndex: null,
  eligibleStudentNames: [],
  isMandatory: false,
  primaryColTitle: 'Завдання',
  secondaryColTitle: 'Заняття',
  includeLessonCol: false,
  grade: 4, // Default is 4 as requested
  isProcessing: false,
  isStopping: false,
  currentProgress: 0,
  totalProgress: 0,
  openModal: (data) => {
    // 1. Close and reset any other active automation action
    stopAndCloseAllAutomations('mandatory_grades')

    const currentGrade = get().grade >= 1 && get().grade <= 6 ? get().grade : 4
    const isMandatory = data.isMandatory ?? false
    const primaryColTitle = data.primaryColTitle ?? (isMandatory ? 'Завдання' : 'Заняття')
    const secondaryColTitle = data.secondaryColTitle ?? null

    set({
      isOpen: true,
      isStopping: false,
      lessonTopic: data.lessonTopic,
      lessonDateText: data.lessonDateText,
      lessonBlock: data.lessonBlock,
      colIndexStart: data.colIndexStart,
      colIndexEnd: data.colIndexEnd,
      taskColIndex: data.taskColIndex,
      lessonColIndex: data.lessonColIndex,
      eligibleStudentNames: data.eligibleStudentNames,
      isMandatory,
      primaryColTitle,
      secondaryColTitle,
      includeLessonCol: false,
      grade: currentGrade,
      isProcessing: false,
      currentProgress: 0,
      totalProgress: 0,
    })

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          if (res?.[STORAGE_KEY]) {
            const saved = Number(res[STORAGE_KEY])
            if (saved >= 1 && saved <= 6) {
              set({ grade: saved })
            }
          }
        })
      } catch {
        // ignore
      }
    }
  },
  closeModal: () =>
    set({
      isOpen: false,
      isStopping: true,
      lessonBlock: null,
      colIndexStart: null,
      colIndexEnd: null,
      taskColIndex: null,
      lessonColIndex: null,
      eligibleStudentNames: [],
      isMandatory: false,
      primaryColTitle: 'Завдання',
      secondaryColTitle: null,
      includeLessonCol: false,
      isProcessing: false,
      currentProgress: 0,
      totalProgress: 0,
    }),
  setIncludeLessonCol: (include) => set({ includeLessonCol: include }),
  setGrade: (grade) => {
    set({ grade })
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: grade })
      }
    } catch {
      // ignore storage error
    }
  },
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setProgress: (current, total) =>
    set({
      currentProgress: current,
      totalProgress: total,
    }),
  requestStop: () => set({ isStopping: true }),
}))

// Load last persisted grade from storage on initialization
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  try {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      if (res?.[STORAGE_KEY]) {
        const saved = Number(res[STORAGE_KEY])
        if (saved >= 1 && saved <= 6) {
          useMandatoryGradeModalStore.setState({ grade: saved })
        }
      }
    })
  } catch {
    // ignore
  }
}
