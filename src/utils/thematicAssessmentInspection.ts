/**
 * Thematic assessment page: auto-highlight grades from mandatory works.
 * Uses MANDATORY_ASSESSMENT_REGEX on lesson/theme titles.
 * Only sets background (#e3f1ff) on existing grade blocks — no HTML replacement.
 */

import { HA_CLASSES } from '@/constants/selectors'
import useSettingsStore from '@/stores/useSettingsStore'
import { MANDATORY_ASSESSMENT_REGEX } from '@/utils/studentStatusDOM'

const LOG_PREFIX = '[HA Thematic]'
const STYLE_LABEL =
  'background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;'
const HIGHLIGHT_CLASS = HA_CLASSES.THEMATIC_MANDATORY_GRADE
const MARK_ATTR = 'data-ha-thematic-hl'
const STATUS_ATTR = 'data-ha-thematic'
const BG_COLOR = '#e3f1ff'

interface ThematicTaskRef {
  id?: number
  title?: string | null
  type?: { id?: number; name?: string | null } | null
}

interface ThematicAssessmentItem {
  id: number
  int_value?: number | null
  theme_id?: number | null
  entity_type?: number | null
  theme?: { id?: number; title?: string | null } | null
  lesson_task?: ThematicTaskRef | null
  home_task?: ThematicTaskRef | null
}

interface PreparedAssessment {
  id: number
  intValue: number | null
  themeId: number | null
  title: string
  isMandatory: boolean
  columnLabel: string
}

let pageObserver: MutationObserver | null = null
let performanceObserver: PerformanceObserver | null = null
let debounceTimer: number | null = null
let retryTimer: number | null = null
let initTimers: Array<ReturnType<typeof setTimeout>> = []
let lastFetchedUrl = ''
let lastLearnerId = ''
let inFlightUrl = ''
let cachedAssessments: PreparedAssessment[] = []
let isApplying = false
let mapFailCount = 0
let clickHandler: ((e: Event) => void) | null = null
let refreshHandler: (() => void) | null = null
let settingsHandler: (() => void) | null = null

function log(...args: unknown[]): void {
  console.log(`%c${LOG_PREFIX}`, STYLE_LABEL, ...args)
}

function setStatus(status: string): void {
  document.documentElement.setAttribute(STATUS_ATTR, status)
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function getThemeIdFromUrl(url = window.location.href): string | null {
  try {
    return new URL(url).searchParams.get('tab')
  } catch {
    return null
  }
}

function getPlanIdFromUrl(url = window.location.href): string | null {
  return url.match(/\/thematic-assessment\/(\d+)/i)?.[1] || null
}

function getSchoolIdFromPerformance(): string | null {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    for (let i = entries.length - 1; i >= 0; i--) {
      const match = entries[i].name.match(/api\.human\.ua\/v1\/(\d+)\//i)
      if (match?.[1]) return match[1]
    }
  } catch {
    // ignore
  }
  return null
}

function findLatestAssessmentsUrl(themeId: string | null): string | null {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    for (let i = entries.length - 1; i >= 0; i--) {
      const url = entries[i].name
      if (!/\/analytics\/assessments\?/i.test(url)) continue
      if (!/learner_id=\d+/i.test(url)) continue
      if (themeId && !url.includes(`global_theme_id=${themeId}`)) continue
      return url
    }
  } catch {
    // ignore
  }
  return null
}

function assessmentSearchText(item: ThematicAssessmentItem): string {
  return [item.lesson_task?.title, item.theme?.title, item.home_task?.title]
    .map((v) => normalizeText(v))
    .filter(Boolean)
    .join(' | ')
}

function columnLabel(item: ThematicAssessmentItem): string {
  return (
    normalizeText(item.lesson_task?.type?.name) ||
    normalizeText(item.home_task?.type?.name) ||
    (item.entity_type === 2 ? 'Заняття' : item.entity_type === 1 ? 'Завдання' : 'Оцінка')
  )
}

function prepareAssessments(items: ThematicAssessmentItem[]): PreparedAssessment[] {
  const mandatoryThemeIds = new Set<number>()

  for (const item of items) {
    const text = assessmentSearchText(item)
    if (text && MANDATORY_ASSESSMENT_REGEX.test(text) && item.theme_id != null) {
      mandatoryThemeIds.add(item.theme_id)
    }
  }

  return items.map((item) => {
    const title =
      normalizeText(item.lesson_task?.title) ||
      normalizeText(item.theme?.title) ||
      normalizeText(item.home_task?.title) ||
      ''
    const themeId = item.theme_id ?? null
    const isMandatory =
      (themeId != null && mandatoryThemeIds.has(themeId)) ||
      MANDATORY_ASSESSMENT_REGEX.test(assessmentSearchText(item))

    return {
      id: item.id,
      intValue: typeof item.int_value === 'number' ? item.int_value : null,
      themeId,
      title,
      isMandatory,
      columnLabel: columnLabel(item),
    }
  })
}

function extractAssessmentsList(payload: unknown): ThematicAssessmentItem[] {
  if (Array.isArray(payload)) return payload as ThematicAssessmentItem[]
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  for (const candidate of [obj.data, obj.items, obj.results, obj.assessments]) {
    if (Array.isArray(candidate)) return candidate as ThematicAssessmentItem[]
  }
  return []
}

/** Same root strategy as the working console snippet. */
function findSnippetRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>('.thematic-assessment-page__user-header')?.parentElement ||
    document.querySelector<HTMLElement>('app-thematic-assessment-recommended') ||
    document.querySelector<HTMLElement>('app-assessment-tool') ||
    document.body
  )
}

function hasStudentDetailOpen(): boolean {
  return Boolean(document.querySelector('.thematic-assessment-page__user-header'))
}

function gradeBlockFromLeaf(leaf: HTMLElement): HTMLElement {
  let el: HTMLElement = leaf
  const gradeText = normalizeText(leaf.innerText || leaf.textContent)

  while (el.parentElement) {
    const parentText = normalizeText(el.parentElement.innerText || el.parentElement.textContent)
    if (parentText !== gradeText) break
    el = el.parentElement
  }

  return el
}

/**
 * Exact algorithm from the working console snippet:
 * find host by full grades text → leaf digit nodes → climb to visual block.
 */
function findGradeBlocks(expected: string[]): HTMLElement[] {
  const joined = expected.join(' ')
  const root = findSnippetRoot()

  const host =
    Array.from(root.querySelectorAll<HTMLElement>('*')).find((el) => {
      const text = normalizeText(el.innerText || el.textContent)
      return text === joined || text === `Оцінки ${joined}` || text === `Оцінки: ${joined}`
    }) || null

  const scope = host || root
  const leaves = Array.from(scope.querySelectorAll<HTMLElement>('*')).filter((el) => {
    if (el.children.length > 0) return false
    return /^(?:\d{1,2}|Н|н)$/u.test(normalizeText(el.innerText || el.textContent))
  })

  return leaves.map(gradeBlockFromLeaf)
}

function isMandatoryHighlightEnabled(): boolean {
  return useSettingsStore.getState().settings.highlightMandatoryWorks ?? true
}

function clearHighlights(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(`[${MARK_ATTR}]`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS)
    el.removeAttribute(MARK_ATTR)
    const bg = el.style.backgroundColor.replace(/\s/g, '').toLowerCase()
    if (bg === BG_COLOR || bg === 'rgb(227,241,255)') {
      el.style.backgroundColor = ''
    }
    if (el.getAttribute('data-ha-tooltip')?.startsWith('Обовʼязкова робота')) {
      el.removeAttribute('data-ha-tooltip')
    }
  })
}

/**
 * Re-applies or clears thematic mandatory highlights when settings change.
 */
export function refreshThematicMandatoryHighlights(): void {
  if (!window.location.href.toLowerCase().includes('/thematic-assessment')) return

  if (!isMandatoryHighlightEnabled()) {
    clearHighlights(document)
    setStatus('disabled-by-setting')
    return
  }

  if (cachedAssessments.length > 0) {
    applyHighlights(cachedAssessments)
    return
  }

  void syncThematicHighlights(true, 'settings')
}

function applyHighlights(assessments: PreparedAssessment[]): boolean {
  if (!hasStudentDetailOpen()) {
    setStatus('waiting-student')
    return false
  }

  if (!isMandatoryHighlightEnabled()) {
    clearHighlights(document)
    setStatus('disabled-by-setting')
    return false
  }

  isApplying = true
  try {
    clearHighlights(document)

    const expected = assessments.map((a) => (a.intValue == null ? null : String(a.intValue)))
    if (expected.some((v) => v == null)) {
      setStatus('missing-int-value')
      return false
    }

    const expectedStrs = expected as string[]
    const blocks = findGradeBlocks(expectedStrs)
    const mandatoryCount = assessments.filter((a) => a.isMandatory).length

    log('apply', {
      api: expectedStrs.join(' '),
      mandatory: mandatoryCount,
      blocks: blocks.map((b) => normalizeText(b.innerText)),
    })

    if (blocks.length !== assessments.length) {
      mapFailCount += 1
      setStatus(`map-failed:${blocks.length}/${assessments.length}`)
      if (mapFailCount <= 8) {
        if (retryTimer !== null) window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => {
          if (cachedAssessments.length > 0) applyHighlights(cachedAssessments)
        }, 400)
      }
      return false
    }

    mapFailCount = 0
    let painted = 0

    assessments.forEach((assessment, index) => {
      if (!assessment.isMandatory) return
      const block = blocks[index]
      block.classList.add(HIGHLIGHT_CLASS)
      block.setAttribute(MARK_ATTR, '1')
      block.style.backgroundColor = BG_COLOR
      const tip = assessment.title
        ? `Обовʼязкова робота\n${assessment.columnLabel}: ${assessment.title}`
        : 'Обовʼязкова робота'
      block.setAttribute('data-ha-tooltip', tip)
      painted += 1
    })

    log(`painted ${painted}`)
    setStatus(painted > 0 ? 'highlighted' : 'no-mandatory')
    return true
  } finally {
    window.setTimeout(() => {
      isApplying = false
    }, 80)
  }
}

function ensureExpand(url: string): string {
  if (!/expand=/i.test(url)) {
    return `${url}${url.includes('?') ? '&' : '?'}expand=theme,lesson_task,home_task`
  }
  if (!/lesson_task/i.test(url) || !/home_task/i.test(url) || !/theme/i.test(url)) {
    return url.replace(/([?&])expand=[^&]*/i, '$1expand=theme,lesson_task,home_task')
  }
  return url
}

function buildAssessmentsUrl(learnerId: string, themeId: string, schoolId: string): string {
  return ensureExpand(
    `https://api.human.ua/v1/${schoolId}/analytics/assessments?learner_id=${learnerId}&global_theme_id=${themeId}&_limit=987654321`
  )
}

function resetLearnerCache(learnerId: string): void {
  if (!learnerId || learnerId === lastLearnerId) return
  log('learner changed', lastLearnerId || '—', '→', learnerId)
  lastLearnerId = learnerId
  lastFetchedUrl = ''
  cachedAssessments = []
  mapFailCount = 0
  clearHighlights(document)
}

async function fetchAndHighlight(url: string): Promise<void> {
  const finalUrl = ensureExpand(url)
  if (!finalUrl || inFlightUrl === finalUrl) return

  const learnerId = finalUrl.match(/learner_id=(\d+)/i)?.[1] || ''
  resetLearnerCache(learnerId)

  inFlightUrl = finalUrl
  setStatus('fetching')
  log('fetch', finalUrl)

  try {
    const response = await fetch(finalUrl, {
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    })
    if (!response.ok) {
      log('fetch failed', response.status)
      setStatus(`fetch-${response.status}`)
      return
    }

    const payload = await response.json()
    const prepared = prepareAssessments(extractAssessmentsList(payload))
    lastFetchedUrl = finalUrl
    cachedAssessments = prepared
    applyHighlights(prepared)
  } catch (e) {
    log('fetch error', e)
    setStatus('fetch-error')
  } finally {
    if (inFlightUrl === finalUrl) inFlightUrl = ''
  }
}

function scheduleSync(reason = 'debounce'): void {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    void syncThematicHighlights(false, reason)
  }, 250)
}

async function syncThematicHighlights(force = false, reason = 'sync'): Promise<void> {
  if (!window.location.href.toLowerCase().includes('/thematic-assessment')) return
  if (isApplying) return

  if (!isMandatoryHighlightEnabled()) {
    clearHighlights(document)
    setStatus('disabled-by-setting')
    return
  }

  const themeId = getThemeIdFromUrl()
  if (!hasStudentDetailOpen()) {
    setStatus('waiting-student')
    return
  }

  const hasHighlight = Boolean(document.querySelector(`[${MARK_ATTR}]`))

  // Re-paint after Angular re-render
  if (!force && !hasHighlight && cachedAssessments.length > 0) {
    applyHighlights(cachedAssessments)
    if (document.querySelector(`[${MARK_ATTR}]`)) return
  }

  if (!force && hasHighlight && cachedAssessments.length > 0) return

  let url = findLatestAssessmentsUrl(themeId)
  if (!url) {
    const anyLearnerUrl = findLatestAssessmentsUrl(null)
    const learnerId = anyLearnerUrl?.match(/learner_id=(\d+)/i)?.[1]
    const schoolId = getSchoolIdFromPerformance()
    if (learnerId && themeId && schoolId) {
      url = buildAssessmentsUrl(learnerId, themeId, schoolId)
    }
  }

  if (!url) {
    if (reason.startsWith('click') || reason === 'init' || force) {
      log('waiting for assessments API', { reason, themeId })
    }
    setStatus('waiting-api')
    return
  }

  const learnerId = url.match(/learner_id=(\d+)/i)?.[1] || ''
  if (learnerId && learnerId !== lastLearnerId) {
    resetLearnerCache(learnerId)
  }

  url = ensureExpand(url)
  if (!force && url === lastFetchedUrl && hasHighlight) return
  if (!force && url === lastFetchedUrl && cachedAssessments.length > 0) {
    applyHighlights(cachedAssessments)
    return
  }

  await fetchAndHighlight(url)
}

function onResourceEntry(entry: PerformanceResourceTiming): void {
  const url = entry.name
  if (!/\/analytics\/assessments\?/i.test(url)) return
  if (!/learner_id=\d+/i.test(url)) return
  const learnerId = url.match(/learner_id=(\d+)/i)?.[1] || ''
  if (learnerId) resetLearnerCache(learnerId)
  scheduleSync('performance')
}

export function initThematicAssessmentInspection(): void {
  destroyThematicAssessmentInspection()

  lastFetchedUrl = ''
  lastLearnerId = ''
  inFlightUrl = ''
  cachedAssessments = []
  isApplying = false
  mapFailCount = 0
  setStatus('active')

  log(
    `auto-highlight ON · plan=${getPlanIdFromUrl() || '—'} · theme=${getThemeIdFromUrl() || '—'} · load from /dist`
  )

  scheduleSync('init')
  initTimers.push(window.setTimeout(() => scheduleSync('t800'), 800))
  initTimers.push(window.setTimeout(() => scheduleSync('t2000'), 2000))

  pageObserver = new MutationObserver(() => scheduleSync('mutation'))
  pageObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  })

  clickHandler = (e: Event) => {
    const target = e.target as HTMLElement | null
    if (!target?.closest('.user-item, [class*="user-item"]')) return
    setStatus('student-click')
    // New student → force refetch on next sync
    lastFetchedUrl = ''
    lastLearnerId = ''
    cachedAssessments = []
    mapFailCount = 0
    clearHighlights(document)
    initTimers.push(window.setTimeout(() => scheduleSync('click-300'), 300))
    initTimers.push(window.setTimeout(() => scheduleSync('click-1000'), 1000))
    initTimers.push(window.setTimeout(() => scheduleSync('click-2000'), 2000))
  }
  document.addEventListener('click', clickHandler, true)

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      performanceObserver = new PerformanceObserver((list) => {
        ;(list.getEntries() as PerformanceResourceTiming[]).forEach(onResourceEntry)
      })
      performanceObserver.observe({ entryTypes: ['resource'] })
    } catch (e) {
      log('PerformanceObserver error', e)
    }
  }

  refreshHandler = () => {
    lastFetchedUrl = ''
    cachedAssessments = []
    mapFailCount = 0
    void syncThematicHighlights(true, 'event')
  }
  window.addEventListener('ha:thematic-refresh', refreshHandler)
  document.addEventListener('ha:thematic-refresh', refreshHandler)

  settingsHandler = () => {
    refreshThematicMandatoryHighlights()
  }
  window.addEventListener('ha:settings-applied', settingsHandler)
}

export function destroyThematicAssessmentInspection(): void {
  for (const timer of initTimers) clearTimeout(timer)
  initTimers = []

  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer)
    retryTimer = null
  }

  pageObserver?.disconnect()
  pageObserver = null
  performanceObserver?.disconnect()
  performanceObserver = null

  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true)
    clickHandler = null
  }
  if (refreshHandler) {
    window.removeEventListener('ha:thematic-refresh', refreshHandler)
    document.removeEventListener('ha:thematic-refresh', refreshHandler)
    refreshHandler = null
  }

  if (settingsHandler) {
    window.removeEventListener('ha:settings-applied', settingsHandler)
    settingsHandler = null
  }

  clearHighlights(document)
  document.documentElement.removeAttribute(STATUS_ATTR)
}
