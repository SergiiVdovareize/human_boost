import useStudentStatusesStore from '@/stores/useStudentStatusesStore'
import { getClassId } from '@/utils/gradebook'
import { getLessonClassCandidates } from '@/utils/lesson'

let isFetching = false
let observerAttached = false
const fetchedLessonUrls = new Set<string>()

/**
 * Searches performance resource entries to find any grade-book API request.
 */
function getGradebookUrlFromPerformance(classId: number): string | null {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const strClassId = String(classId)

    for (let i = entries.length - 1; i >= 0; i--) {
      const url = entries[i].name
      if (url.includes('grade-book') && (url.includes(strClassId) || url.includes('/group/'))) {
        return url
      }
    }
  } catch (e) {
    console.debug('[Human Boost] Performance entries error:', e)
  }
  return null
}

/**
 * Deeply extracts students (id and names) from any human.ua API payload.
 */
export function extractStudentsFromData(data: unknown): { id: string; name: string }[] {
  const students: { id: string; name: string }[] = []
  if (!data || typeof data !== 'object') return students

  const added = new Set<string>()

  const addStudent = (id: string | number, name: string) => {
    const cleanId = String(id).trim()
    const cleanName = name.replace(/\s+/g, ' ').trim()
    if (!cleanId || !cleanName) return

    const key = `${cleanId}_${cleanName}`
    if (!added.has(key)) {
      added.add(key)
      students.push({ id: cleanId, name: cleanName })
    }
  }

  const processUser = (u: Record<string, unknown>) => {
    if (!u || typeof u !== 'object') return
    const id = (u.id || u.student_id || u.user_id || u.studentId || u.userId) as
      | string
      | number
      | undefined
    if (!id) return

    const userObj = ((u.user || u.student || u) as Record<string, unknown>) || {}
    const lastName = String(userObj.last_name || userObj.lastName || '').trim()
    const firstName = String(userObj.first_name || userObj.firstName || '').trim()
    const patronymic = String(userObj.patronymic || '').trim()
    const fullName = String(userObj.name || userObj.full_name || '').trim()

    if (lastName && firstName) {
      addStudent(id, `${lastName} ${firstName}`)
      addStudent(id, `${firstName} ${lastName}`)
      if (patronymic) {
        addStudent(id, `${lastName} ${firstName} ${patronymic}`)
      }
    } else if (fullName) {
      addStudent(id, fullName)
    }
  }

  // Deep scan
  const queue: unknown[] = [data]
  const visited = new Set<unknown>()

  while (queue.length > 0) {
    const cur = queue.shift()
    if (!cur || typeof cur !== 'object' || visited.has(cur)) continue
    visited.add(cur)

    if (Array.isArray(cur)) {
      for (const item of cur) {
        if (item && typeof item === 'object') {
          if (item.first_name || item.last_name || item.name || item.user || item.student) {
            processUser(item)
          } else {
            queue.push(item)
          }
        }
      }
    } else {
      for (const [key, val] of Object.entries(cur)) {
        if (['students', 'members', 'groupStudents', 'recipients', 'users'].includes(key)) {
          if (Array.isArray(val)) {
            val.forEach(processUser)
          }
        } else if (val && typeof val === 'object') {
          queue.push(val)
        }
      }
    }
  }

  return students
}

/**
 * Fetches the gradebook data safely using the extension/browser session cookies
 * to extract student IDs and match them to names in-memory.
 */
export async function loadGradebookStudents(targetClassId?: number): Promise<void> {
  const classId = targetClassId || getClassId()
  if (!classId || isFetching) return

  const currentStore = useStudentStatusesStore.getState()
  if (currentStore.classId === classId && Object.keys(currentStore.nameToIdMap).length > 0) {
    return
  }

  const apiUrl = getGradebookUrlFromPerformance(classId)
  if (apiUrl) {
    await fetchStudentsFromApi(apiUrl, classId)
    return
  }

  if (!observerAttached && typeof PerformanceObserver !== 'undefined') {
    observerAttached = true
    try {
      const perfObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceResourceTiming[]
        const strClassId = String(classId)

        for (const entry of entries) {
          if (
            entry.name.includes('grade-book') &&
            (entry.name.includes(strClassId) || entry.name.includes('/group/'))
          ) {
            perfObserver.disconnect()
            observerAttached = false
            fetchStudentsFromApi(entry.name, classId)
            break
          }
        }
      })

      perfObserver.observe({ entryTypes: ['resource'] })
    } catch {
      setTimeout(() => {
        const retryUrl = getGradebookUrlFromPerformance(classId)
        if (retryUrl) {
          fetchStudentsFromApi(retryUrl, classId)
        }
      }, 1500)
    }
  }
}

async function fetchStudentsFromApi(url: string, targetClassId?: number): Promise<void> {
  if (isFetching) return
  isFetching = true

  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    })

    if (!response.ok) return

    const data = await response.json()
    const students = extractStudentsFromData(data)

    if (students.length > 0) {
      await useStudentStatusesStore.getState().setStudentMappings(students, targetClassId)
      window.dispatchEvent(new CustomEvent('ha:students-updated'))
    }
  } catch (e) {
    console.debug('[Human Boost] fetchStudentsFromApi error:', e)
  } finally {
    isFetching = false
  }
}

let lessonPerfObserver: PerformanceObserver | null = null

function isLessonApiUrl(url: string): boolean {
  if (!url?.includes('human.ua')) return false
  if (url.includes('analytics') || url.includes('google') || url.includes('cdn-cgi')) return false

  return (
    url.includes('/plan/theme/') ||
    url.includes('/result-groups/') ||
    (url.includes('/group/') && url.includes('students')) ||
    url.includes('/lesson/by-theme/')
  )
}

async function fetchAndProcessLessonUrl(url: string, targetClassId?: number): Promise<void> {
  if (fetchedLessonUrls.has(url)) return
  fetchedLessonUrls.add(url)

  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    })

    if (!response.ok) return

    const data = await response.json()
    const students = extractStudentsFromData(data)

    if (students.length > 0) {
      let resolvedClassId = targetClassId
      if (!resolvedClassId) {
        const obj = data as Record<string, unknown>
        const fromData =
          obj?.group_id ||
          obj?.groupId ||
          (obj?.group as Record<string, unknown>)?.id ||
          (obj?.course as Record<string, unknown>)?.group_id ||
          (obj?.theme as Record<string, unknown>)?.group_id
        if (fromData) {
          resolvedClassId = Number(fromData)
        }
      }
      if (!resolvedClassId) {
        const match = url.match(/(?:result-groups|group)\/(?:.*\/)?(\d{6,8})/)
        if (match?.[1]) {
          resolvedClassId = Number(match[1])
        }
      }
      if (!resolvedClassId) {
        const candidates = getLessonClassCandidates()
        if (candidates.length > 0) {
          resolvedClassId = candidates[0]
        }
      }

      if (resolvedClassId) {
        await useStudentStatusesStore.getState().loadStatuses(resolvedClassId)
      }

      await useStudentStatusesStore.getState().setStudentMappings(students, resolvedClassId)
      window.dispatchEvent(new CustomEvent('ha:students-updated'))
    }
  } catch (e) {
    console.debug('[Human Boost] Error fetching lesson student API url:', url, e)
  }
}

export function disconnectLessonObserver(): void {
  if (lessonPerfObserver) {
    lessonPerfObserver.disconnect()
    lessonPerfObserver = null
  }
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

function findThematicAssessmentApiUrl(planId: string): string | null {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    for (let i = entries.length - 1; i >= 0; i--) {
      const url = entries[i].name
      if (
        url.includes('/plan/thematic-assessment/') &&
        url.includes(planId) &&
        url.includes('group')
      ) {
        return url
      }
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      const url = entries[i].name
      if (url.includes('/plan/thematic-assessment/') && url.includes(planId)) {
        return url
      }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Loads students + group id for the thematic assessment page so status badges
 * can resolve against the same classId used in the gradebook.
 */
export async function loadThematicStudents(attempt = 0): Promise<void> {
  const planId = window.location.pathname.match(/\/thematic-assessment\/(\d+)/i)?.[1]
  if (!planId) return

  const schoolId = getSchoolIdFromPerformance()
  if (!schoolId) {
    if (attempt < 5) {
      window.setTimeout(() => {
        void loadThematicStudents(attempt + 1)
      }, 800)
    }
    return
  }

  const existing = findThematicAssessmentApiUrl(planId)
  const url =
    existing && /expand=/i.test(existing) && /members/i.test(existing)
      ? existing
      : `https://api.human.ua/v1/${schoolId}/plan/thematic-assessment/${planId}?expand=group.members&_limit=987654321`

  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    })
    if (!response.ok) {
      console.debug('[Human Boost] Thematic students fetch failed', response.status)
      return
    }

    const data = await response.json()
    const payload = Array.isArray(data) ? data[0] : data
    const group = (payload as Record<string, unknown>)?.group as Record<string, unknown> | undefined
    const groupIdRaw = group?.id ?? (payload as Record<string, unknown>)?.group_id
    const groupId = groupIdRaw ? Number(groupIdRaw) : 0

    const students = extractStudentsFromData(payload)
    if (groupId > 0) {
      await useStudentStatusesStore.getState().loadStatuses(groupId)
    } else {
      await useStudentStatusesStore.getState().loadStatuses()
    }

    if (students.length > 0) {
      await useStudentStatusesStore
        .getState()
        .setStudentMappings(students, groupId > 0 ? groupId : undefined)
      window.dispatchEvent(new CustomEvent('ha:students-updated'))
      console.debug(
        `[Human Boost] Thematic: mapped ${students.length} students` +
          (groupId > 0 ? ` for group ${groupId}` : '')
      )
    }
  } catch (e) {
    console.debug('[Human Boost] Thematic students error:', e)
  }
}

/**
 * Automatically inspects lesson & group API responses on lesson pages,
 * extracting real student IDs and linking them with statuses.
 */
export async function loadLessonStudents(
  _lessonId?: number,
  targetClassId?: number
): Promise<void> {
  // 1. Process already finished requests
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    for (let i = entries.length - 1; i >= 0; i--) {
      const url = entries[i].name
      if (isLessonApiUrl(url)) {
        await fetchAndProcessLessonUrl(url, targetClassId)
      }
    }
  } catch (e) {
    console.debug('[Human Boost] Performance entries error for lesson:', e)
  }

  // 2. Keep observing incoming requests while on lesson page
  if (!lessonPerfObserver && typeof PerformanceObserver !== 'undefined') {
    try {
      lessonPerfObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceResourceTiming[]
        for (const entry of entries) {
          const url = entry.name
          if (isLessonApiUrl(url)) {
            fetchAndProcessLessonUrl(url, targetClassId)
          }
        }
      })
      lessonPerfObserver.observe({ entryTypes: ['resource'] })
    } catch {
      // ignore
    }
  }
}
