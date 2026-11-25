import '@/scss/style.scss'

import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import App from '@/App'
import { useCopyGradesStore } from '@/stores/useCopyGradesStore'
import useModalStore from '@/stores/useModalStore'
import useSettingsStore from '@/stores/useSettingsStore'
import useStudentStatusesStore from '@/stores/useStudentStatusesStore'
import type { StoredExtensionData } from '@/types'
import { stopAndCloseAllAutomations } from '@/utils/automationCoordinator'
import { destroyCalendarAutomation, initCalendarAutomation } from '@/utils/calendarApi'
import { destroyCalendarInspection, initCalendarInspection } from '@/utils/calendarInspection'
import { getClassId } from '@/utils/gradebook'
import {
  destroyLessonHomeworkInspector,
  initLessonHomeworkInspector,
} from '@/utils/lessonHomeworkInspector'
import { destroyLessonHomeworkReview, initLessonHomeworkReview } from '@/utils/lessonHomeworkReview'
import {
  destroyLessonStatusDOM,
  initLessonStatusDOM,
  refreshLessonStudentBadges,
} from '@/utils/lessonStatusDOM'
import { destroyMandatoryGradeMenu, initMandatoryGradeMenu } from '@/utils/mandatoryGradeMenu'
import { initNavigationObserver, type PageContext, waitForElement } from '@/utils/navigation'
import { initServerSync, performServerSync } from '@/utils/serverSync'
import { loadGradebookStudents, loadThematicStudents } from '@/utils/studentStatusApi'
import {
  destroyStudentStatusDOM,
  initStudentStatusDOM,
  refreshStudentStatusBadges,
} from '@/utils/studentStatusDOM'
import { getPanelOpenState, initStorageSyncListener, setPanelOpenState } from '@/utils/syncStorage'
import {
  destroyThematicAssessmentInspection,
  initThematicAssessmentInspection,
} from '@/utils/thematicAssessmentInspection'
import { initTooltipListeners } from '@/utils/tooltip'
import { initUserDiagnostic } from '@/utils/userDiagnostic'

let appRoot: Root | null = null

async function icon(): Promise<string> {
  const logoUrl = chrome.runtime.getURL('icons/logo.svg')
  const response = await fetch(logoUrl)

  return await response.text()
}

function resetStores(): void {
  useModalStore.getState().reset()
}

function mountApp(): void {
  const existingApp = document.getElementById('human-automator-app')
  if (existingApp && useModalStore.getState().showModalBasic) {
    useCopyGradesStore.getState().closeModal()
    useModalStore.getState().setShowModalBasic(false)
    void setPanelOpenState(false)
    return
  }

  appRoot?.unmount()
  appRoot = null

  document.getElementById('human-automator-app')?.remove()

  resetStores()

  const app = document.createElement('div')
  app.id = 'human-automator-app'
  document.body.append(app)

  appRoot = createRoot(app)
  appRoot.render(
    <StrictMode>
      <App />
    </StrictMode>
  )

  void setPanelOpenState(true)
}

async function app(): Promise<HTMLDivElement> {
  const fabHost = document.createElement('div')

  fabHost.id = 'human-automator'
  fabHost.innerHTML = await icon()
  fabHost.addEventListener('click', mountApp)

  return fabHost
}

/**
 * Handles page context changes across the human.ua SPA:
 * decides what data to fetch, what DOM overlays to mount/unmount.
 */
async function handleNavigation(context: PageContext): Promise<void> {
  console.log(
    `%c[Human Boost] route%c ${context.type}`,
    'background:#0f172a;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
    'font-weight:bold;',
    context.url
  )

  if (context.type === 'gradebook') {
    // 1. Detach lesson side panel observer if active
    destroyLessonStatusDOM()
    destroyLessonHomeworkInspector()
    destroyLessonHomeworkReview()
    destroyCalendarInspection()
    destroyThematicAssessmentInspection()

    // 2. Wait for gradebook virtual scroll container to appear in DOM
    await waitForElement('.gradebook-container__table2-outlet, .gradebook-narrow__cell', 5000)

    const classId = context.classId || getClassId()
    if (classId) {
      // 3. Load persisted status preferences from storage
      await useStudentStatusesStore.getState().loadStatuses(classId)

      // 4. Safely mount gradebook DOM observers & status corner badges
      initStudentStatusDOM()
      initMandatoryGradeMenu()

      // 5. Resolve student IDs via background API call
      await loadGradebookStudents(classId)

      // 6. Background sync with remote server to pull any updates from other devices
      void performServerSync(() => {
        refreshStudentStatusBadges()
      })
    }
  } else if (context.type === 'lesson') {
    // Detach gradebook observers & active automations
    stopAndCloseAllAutomations()
    destroyStudentStatusDOM()
    destroyMandatoryGradeMenu()
    destroyCalendarInspection()
    destroyCalendarAutomation()
    destroyThematicAssessmentInspection()

    // Mount lesson side panel status badges, observer, homework reviewer and diagnostic inspector
    initLessonStatusDOM()
    initLessonHomeworkInspector()
    initLessonHomeworkReview()
  } else if (context.type === 'schedule') {
    // Schedule/calendar page: detach gradebook & lesson observers
    stopAndCloseAllAutomations()
    destroyStudentStatusDOM()
    destroyLessonStatusDOM()
    destroyLessonHomeworkInspector()
    destroyLessonHomeworkReview()
    destroyMandatoryGradeMenu()
    destroyThematicAssessmentInspection()

    // Initialize calendar inspector and API-driven unpublished highlight automation
    initCalendarInspection()
    initCalendarAutomation()
  } else if (context.type === 'thematic') {
    // Thematic assessment: mandatory-grade highlight + student status badges in list
    stopAndCloseAllAutomations()
    destroyStudentStatusDOM()
    destroyLessonHomeworkInspector()
    destroyLessonHomeworkReview()
    destroyMandatoryGradeMenu()
    destroyCalendarInspection()
    destroyCalendarAutomation()

    initThematicAssessmentInspection()
    // Reuse lesson status badges for `.user-item` list (сімейник / закордонник / вибув)
    void initLessonStatusDOM()
    void loadThematicStudents()
  } else {
    // Other pages: clean up observers
    stopAndCloseAllAutomations()
    destroyStudentStatusDOM()
    destroyLessonStatusDOM()
    destroyLessonHomeworkInspector()
    destroyLessonHomeworkReview()
    destroyMandatoryGradeMenu()
    destroyCalendarInspection()
    destroyCalendarAutomation()
    destroyThematicAssessmentInspection()
  }
}

;(async function initExtension() {
  const extVersion = chrome.runtime?.getManifest?.()?.version || '1.12.0'
  console.log(`[Human Boost] v${extVersion} Content script active on:`, window.location.href)

  // 1. Load user settings and apply them to DOM
  await useSettingsStore.getState().loadSettings()

  initTooltipListeners()
  initUserDiagnostic()

  document.body.appendChild(await app())

  // 2. Remote backend synchronization (cross-device & cross-account sync)
  const refreshUiAfterSync = async (data?: StoredExtensionData) => {
    // Prefer the payload from storage.onChanged — avoids a re-read that can race
    // with the toggle the user just made.
    if (data?.settings) {
      useSettingsStore.getState().applySettings(data.settings)
    } else {
      await useSettingsStore.getState().loadSettings()
    }
    const currentClassId = getClassId()
    if (currentClassId) {
      await useStudentStatusesStore.getState().loadStatuses(currentClassId)
      refreshStudentStatusBadges()
    }
    refreshLessonStudentBadges()
  }

  initServerSync(() => {
    void refreshUiAfterSync()
  })

  // 3. Live Google profile / local storage synchronization listener (always active)
  initStorageSyncListener((data) => {
    void refreshUiAfterSync(data)
  })

  // 4. Global SPA route observer (reacts to schedule -> lesson -> gradebook transitions)
  initNavigationObserver(handleNavigation)

  // 5. Restore panel state if it was open before reload
  const wasPanelOpen = await getPanelOpenState()
  if (wasPanelOpen) {
    mountApp()
  }
})()
