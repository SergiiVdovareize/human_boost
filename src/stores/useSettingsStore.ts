import { create } from 'zustand'

import type { AppSettings } from '@/types'
import { syncAndHighlightCalendar } from '@/utils/calendarApi'
import { refreshLessonStudentBadges } from '@/utils/lessonStatusDOM'
import { refreshStudentStatusBadges } from '@/utils/studentStatusDOM'
import { getStoredExtensionData, updateStoredExtensionData } from '@/utils/syncStorage'

interface SettingsState {
  settings: AppSettings
  isLoaded: boolean
  loadSettings: () => Promise<void>
  applySettings: (partial?: Partial<AppSettings> | null) => void
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

export const DEFAULT_SETTINGS: AppSettings = {
  showStudentStatuses: true,
  highlightAbsentForInactive: true,
  highlightMandatoryWorks: true,
  highlightGradeMismatch: true,
  highlightVideoConference: true,
  highlightUnpublishedLessons: true,
}

export function applySettingsToDOM(settings: AppSettings): void {
  const showStatuses = settings.showStudentStatuses ?? true
  const highlightAbsent = settings.highlightAbsentForInactive ?? true
  const highlightMandatory = settings.highlightMandatoryWorks ?? true
  const highlightGradeMismatch = settings.highlightGradeMismatch ?? true
  const highlightVideo = settings.highlightVideoConference ?? true
  const highlightUnpublished = settings.highlightUnpublishedLessons ?? true

  if (showStatuses) {
    document.body.classList.remove('ha-disable-student-statuses')
  } else {
    document.body.classList.add('ha-disable-student-statuses')
    // Close any open status dropdown
    document.querySelectorAll('.ha-status-dropdown').forEach((el) => {
      el.remove()
    })
  }

  if (showStatuses && highlightAbsent) {
    document.body.classList.remove('ha-disable-inactive-absent-highlight')
  } else {
    document.body.classList.add('ha-disable-inactive-absent-highlight')
  }

  if (highlightMandatory) {
    document.body.classList.remove('ha-disable-mandatory-works-highlight')
  } else {
    document.body.classList.add('ha-disable-mandatory-works-highlight')
  }

  if (highlightGradeMismatch) {
    document.body.classList.remove('ha-disable-grade-mismatch-highlight')
  } else {
    document.body.classList.add('ha-disable-grade-mismatch-highlight')
    // Immediately clear mismatch marks so UI reacts even before the next row refresh
    document.querySelectorAll('.ha-cell--grade-mismatch').forEach((el) => {
      el.classList.remove('ha-cell--grade-mismatch')
      if (el.getAttribute('data-ha-tooltip') === 'Оцінки в «Заняття» та «Завдання» відрізняються') {
        el.removeAttribute('data-ha-tooltip')
      }
    })
  }

  if (highlightVideo) {
    document.body.classList.remove('ha-disable-video-conference-highlight')
  } else {
    document.body.classList.add('ha-disable-video-conference-highlight')
  }

  if (highlightUnpublished) {
    document.body.classList.remove('ha-disable-unpublished-highlight')
    if (window.location.href.includes('/calendar')) {
      syncAndHighlightCalendar()
    }
  } else {
    document.body.classList.add('ha-disable-unpublished-highlight')
  }

  refreshStudentStatusBadges()
  refreshLessonStudentBadges()
  // Thematic highlight listens for this (avoids circular import with thematic module)
  window.dispatchEvent(new CustomEvent('ha:settings-applied'))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const data = await getStoredExtensionData()
      get().applySettings(data.settings)
    } catch {
      get().applySettings(DEFAULT_SETTINGS)
    }
  },

  applySettings: (partial) => {
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...(partial || {}),
    }
    set({ settings: merged, isLoaded: true })
    applySettingsToDOM(merged)
  },

  updateSetting: async (key, value) => {
    const updated = { ...get().settings, [key]: value }
    // Optimistic UI update — do not wait for storage
    set({ settings: updated, isLoaded: true })
    applySettingsToDOM(updated)

    try {
      await updateStoredExtensionData((prev) => ({
        ...prev,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(prev.settings || {}),
          [key]: value,
        },
      }))
    } catch (e) {
      console.error('[Human Boost] Failed to update setting:', e)
      // Keep the in-memory value the user just chose even if persistence fails
    }
  },
}))

export default useSettingsStore
