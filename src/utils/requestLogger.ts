/**
 * Safely logs all network API requests (Fetch / XHR) on the page
 * using standard PerformanceObserver without violating Content Security Policy (CSP).
 */
export function initRequestLogger(): void {
  if (typeof performance === 'undefined') return

  const loggedUrls = new Set<string>()

  const logEntry = (entry: PerformanceResourceTiming) => {
    const url = entry.name
    if (!url || loggedUrls.has(url)) return

    // Filter relevant API, lesson, group, student, and gradebook requests (exclude analytics/telemetry)
    const isRelevant =
      url.includes('human.ua') &&
      !url.includes('google') &&
      !url.includes('cdn-cgi') &&
      (url.includes('/api/') ||
        url.includes('lesson') ||
        url.includes('group') ||
        url.includes('student') ||
        url.includes('grade') ||
        url.includes('task') ||
        entry.initiatorType === 'fetch' ||
        entry.initiatorType === 'xmlhttprequest')

    if (isRelevant) {
      loggedUrls.add(url)
      console.log(
        `%c[HA API Request]%c ${url}`,
        'background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
        'color: #0f172a; font-weight: bold;'
      )
    }
  }

  // 1. Process past requests
  try {
    const pastEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    pastEntries.forEach(logEntry)
  } catch {
    // ignore
  }

  // 2. Observe dynamic requests in real time
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver((list) => {
        const newEntries = list.getEntries() as PerformanceResourceTiming[]
        newEntries.forEach(logEntry)
      })
      observer.observe({ entryTypes: ['resource'] })
    } catch (e) {
      console.debug('[Human Boost] PerformanceObserver error:', e)
    }
  }

  console.log(
    '%c[Human Boost] Логування мережевих запитів активовано (CSP-compliant)!%c Усі API-запити уроку виводяться нижче.',
    'background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;',
    'color: #0f172a; font-weight: 500;'
  )
}
