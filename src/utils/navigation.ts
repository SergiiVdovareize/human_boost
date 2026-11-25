import { getClassId, isGradebookPage } from '@/utils/gradebook'
import { isLessonPage } from '@/utils/lesson'

export type PageType = 'gradebook' | 'lesson' | 'schedule' | 'thematic' | 'other'

export interface PageContext {
  type: PageType
  url: string
  classId: number
  lessonId?: number
  thematicId?: number
}

let isHistoryPatched = false
let pollTimer: number | null = null

/**
 * Safely waits for an element matching the selector to appear in the DOM.
 */
export function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeoutMs = 5000
): Promise<T | null> {
  const existing = document.querySelector<T>(selector)
  if (existing) {
    return Promise.resolve(existing)
  }

  return new Promise((resolve) => {
    let timeoutId: number | null = null

    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector)
      if (el) {
        if (timeoutId !== null) clearTimeout(timeoutId)
        observer.disconnect()
        resolve(el)
      }
    })

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    })

    timeoutId = window.setTimeout(() => {
      observer.disconnect()
      resolve(document.querySelector<T>(selector))
    }, timeoutMs)
  })
}

/**
 * Detects the current page context based on URL and DOM cues.
 */
export function detectPageContext(): PageContext {
  const url = window.location.href
  const classId = getClassId()

  let type: PageType = 'other'

  if (url.toLowerCase().includes('/thematic-assessment')) {
    type = 'thematic'
  } else if (classId > 0 || isGradebookPage()) {
    type = 'gradebook'
  } else if (isLessonPage()) {
    type = 'lesson'
  } else if (
    url.toLowerCase().includes('/schedule') ||
    url.toLowerCase().includes('/calendar') ||
    document.querySelector(
      '.schedule-container, .schedule-table, .calendar-events-container, .calendar-container'
    )
  ) {
    type = 'schedule'
  }

  let lessonId: number | undefined
  const lessonMatch = url.match(/\/lesson\/(\d+)/i)
  if (lessonMatch?.[1]) {
    lessonId = Number(lessonMatch[1])
  }

  let thematicId: number | undefined
  const thematicMatch = url.match(/\/thematic-assessment\/(\d+)/i)
  if (thematicMatch?.[1]) {
    thematicId = Number(thematicMatch[1])
  }

  return {
    type,
    url,
    classId,
    lessonId,
    thematicId,
  }
}

/**
 * Hooks into History API to detect SPA navigation events.
 * Note: in Chrome Extension content scripts (Isolated World), patching history.pushState
 * only intercepts calls made within the content script, while Angular runs in Main World.
 * We listen to 'popstate' and back it up with the 500ms fallback pollTimer in initNavigationObserver.
 */
function patchHistory(): void {
  if (isHistoryPatched || typeof window === 'undefined') return
  isHistoryPatched = true

  const fireLocationChange = () => {
    window.dispatchEvent(new Event('ha:locationchange'))
  }

  const originalPushState = window.history.pushState
  window.history.pushState = function (...args) {
    const res = originalPushState.apply(this, args)
    fireLocationChange()
    return res
  }

  const originalReplaceState = window.history.replaceState
  window.history.replaceState = function (...args) {
    const res = originalReplaceState.apply(this, args)
    fireLocationChange()
    return res
  }

  window.addEventListener('popstate', fireLocationChange)
}

/**
 * Initializes a global SPA navigation observer that runs continuously,
 * notifying whenever the URL or page context changes.
 */
export function initNavigationObserver(
  onRouteChange: (context: PageContext) => void | Promise<void>
): () => void {
  patchHistory()

  let lastUrl = ''
  let lastContextKey = ''
  let debounceTimeout: number | null = null

  const checkNavigation = () => {
    const context = detectPageContext()
    const contextKey = `${context.type}_${context.classId}_${context.url}`

    if (contextKey !== lastContextKey || context.url !== lastUrl) {
      lastUrl = context.url
      lastContextKey = contextKey

      if (debounceTimeout !== null) {
        clearTimeout(debounceTimeout)
      }

      debounceTimeout = window.setTimeout(() => {
        onRouteChange(context)
      }, 50)
    }
  }

  // 1. Listen for patched history events
  window.addEventListener('ha:locationchange', checkNavigation)

  // 2. Continuous fallback interval to catch in-page changes without URL mutation
  if (pollTimer === null) {
    pollTimer = window.setInterval(checkNavigation, 500)
  }

  // 3. Trigger initial route check immediately
  checkNavigation()

  return () => {
    window.removeEventListener('ha:locationchange', checkNavigation)
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout)
      debounceTimeout = null
    }
  }
}
