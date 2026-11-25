/**
 * Checks whether the current page is a lesson page.
 */
export function isLessonPage(): boolean {
  try {
    const url = window.location.href.toLowerCase()
    if (url.includes('/lesson/') || url.includes('/lessons/')) {
      return true
    }
    return Boolean(document.querySelector('.hometask-expire-date, .lesson-container'))
  } catch {
    return false
  }
}

/**
 * Tries to find potential class IDs on the lesson page
 * to match against known gradebook class IDs.
 */
export function getLessonClassCandidates(): number[] {
  const ids = new Set<number>()
  try {
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/group/"]')
    links.forEach((a) => {
      const match = a.href.match(/\/group\/(\d+)/)
      if (match?.[1]) {
        const id = Number(match[1])
        if (id > 0) ids.add(id)
      }
    })
    if (typeof performance !== 'undefined') {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      for (let i = entries.length - 1; i >= Math.max(0, entries.length - 50); i--) {
        const match =
          entries[i].name.match(/(?:group|result-groups|grade-?book)\/(?:.*\/)?(\d+)/) ||
          entries[i].name.match(/\/group\/.*\/(\d+)/)
        if (match?.[1]) {
          const id = Number(match[1])
          if (id > 0) ids.add(id)
        }
      }
    }
  } catch (e) {
    console.debug('[Human Boost] Error finding lesson class candidates:', e)
  }
  return Array.from(ids)
}
