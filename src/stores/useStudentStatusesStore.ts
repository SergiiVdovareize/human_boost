import { create } from 'zustand'

import type { StudentStatusType } from '@/types'
import { getClassId } from '@/utils/gradebook'
import { getStoredExtensionData, updateStoredExtensionData } from '@/utils/syncStorage'

export function generateStudentFallbackId(classId: number | string, studentName: string): string {
  let hash = 0
  const normalized = `${classId}_${studentName.trim().toLowerCase().replace(/\s+/g, ' ')}`
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return `sid_${Math.abs(hash)}`
}

export function matchStudentName(searchName: string, candidateName: string): boolean {
  const s1 = searchName.replace(/\s+/g, ' ').trim().toLowerCase()
  const s2 = candidateName.replace(/\s+/g, ' ').trim().toLowerCase()
  if (s1 === s2) return true

  const parts1 = s1.split(' ')
  const parts2 = s2.split(' ')

  // If one has surname and initial: e.g. "вдоварейзе с." and "вдоварейзе сергій"
  if (parts1.length >= 2 && parts2.length >= 2) {
    const lastName1 = parts1[0]
    const lastName2 = parts2[0]
    if (lastName1 === lastName2) {
      const first1 = parts1[1].replace('.', '')
      const first2 = parts2[1].replace('.', '')
      if (first1.length === 1 && first2.startsWith(first1)) return true
      if (first2.length === 1 && first1.startsWith(first2)) return true
    }
  }

  return false
}

interface StudentStatusesState {
  classId: number
  // Current class statuses: studentId (server ID or sid_*) -> StudentStatusType
  statuses: Record<string, StudentStatusType>
  // All stored statuses across all classes: classId -> (studentId -> StudentStatusType)
  allStatuses: Record<string, Record<string, StudentStatusType>>
  // In-memory mappings (NOT saved to storage, only in runtime memory)
  nameToIdMap: Record<string, string>
  idToNameMap: Record<string, string>
  isLoaded: boolean

  loadStatuses: (classId?: number) => Promise<void>
  setStatus: (studentId: string, status: StudentStatusType) => Promise<void>
  setStatusForClass: (
    classId: number,
    studentId: string,
    status: StudentStatusType
  ) => Promise<void>
  getStatus: (studentId: string) => StudentStatusType
  getStatusByName: (name: string) => StudentStatusType
  findStatusByStudentName: (
    name: string,
    candidateClassIds?: number[]
  ) => { status: StudentStatusType; studentId: string; classId: number }
  getStudentIdByName: (name: string) => string
  setStudentMappings: (
    students: { id: string | number; name: string }[],
    targetClassId?: number
  ) => Promise<void>
  reset: () => void
}

const useStudentStatusesStore = create<StudentStatusesState>((set, get) => ({
  classId: getClassId(),
  statuses: {},
  allStatuses: {},
  nameToIdMap: {},
  idToNameMap: {},
  isLoaded: false,

  loadStatuses: async (targetClassId?: number) => {
    const classId = targetClassId || getClassId()

    try {
      const result = await getStoredExtensionData()
      const allStatuses = result.studentStatuses || {}
      const allMappings = result.studentNameMappings || {}
      const classStatuses = classId ? allStatuses[String(classId)] || {} : {}
      const classNameMappings = classId ? allMappings[String(classId)] || {} : {}

      // Build global mappings across all stored classes
      const globalNameToId: Record<string, string> = {}
      const globalIdToName: Record<string, string> = {}
      for (const classMapping of Object.values(allMappings)) {
        if (classMapping && typeof classMapping === 'object') {
          for (const [name, id] of Object.entries(classMapping)) {
            globalNameToId[name] = id
            globalIdToName[id] = name
          }
        }
      }

      // Build idToName lookup for current class
      const idToName: Record<string, string> = {}
      for (const [name, id] of Object.entries(classNameMappings)) {
        idToName[id] = name
      }

      set({
        allStatuses,
        ...(classId ? { classId, statuses: { ...classStatuses } } : {}),
        nameToIdMap: { ...globalNameToId, ...classNameMappings, ...get().nameToIdMap },
        idToNameMap: { ...globalIdToName, ...idToName, ...get().idToNameMap },
        isLoaded: true,
      })
    } catch (e) {
      console.error('[Human Boost] Error loading student statuses:', e)
    }
  },

  setStatus: async (studentId: string, status: StudentStatusType) => {
    const classId = get().classId || getClassId()
    if (!classId || !studentId) return
    await get().setStatusForClass(classId, studentId, status)
  },

  setStatusForClass: async (classId: number, studentId: string, status: StudentStatusType) => {
    if (!classId || !studentId) return

    const currentAll = { ...get().allStatuses }
    const classStatuses = {
      ...(currentAll[String(classId)] || {}),
      [studentId]: status,
    }
    currentAll[String(classId)] = classStatuses

    set({
      allStatuses: currentAll,
      ...(classId === get().classId ? { statuses: classStatuses } : {}),
    })

    try {
      await updateStoredExtensionData((prev) => {
        const all = { ...(prev.studentStatuses || {}) }
        all[String(classId)] = classStatuses
        return {
          ...prev,
          studentStatuses: all,
        }
      })
    } catch (e) {
      console.error('[Human Boost] Error saving student status:', e)
    }
  },

  getStatus: (studentId: string): StudentStatusType => {
    return get().statuses[studentId] || 'standard'
  },

  getStatusByName: (name: string): StudentStatusType => {
    const studentId = get().getStudentIdByName(name)
    return get().getStatus(studentId)
  },

  findStatusByStudentName: (
    name: string,
    candidateClassIds: number[] = []
  ): { status: StudentStatusType; studentId: string; classId: number } => {
    const cleanName = name.replace(/\s+/g, ' ').trim()
    const all = get().allStatuses
    const nameToId = get().nameToIdMap

    const checkClass = (
      cId: number
    ): { status: StudentStatusType; studentId: string; classId: number } | null => {
      const classData = all[String(cId)]
      if (!classData) return null

      // 1. Direct nameToId lookup or initial matching
      let serverId = nameToId[cleanName]
      if (!serverId) {
        for (const [knownName, mappedId] of Object.entries(nameToId)) {
          if (matchStudentName(cleanName, knownName)) {
            serverId = mappedId
            break
          }
        }
      }

      if (serverId && classData[serverId] && classData[serverId] !== 'standard') {
        return { status: classData[serverId], studentId: serverId, classId: cId }
      }

      // 2. Check deterministic fallback ID
      const fallbackId = generateStudentFallbackId(cId, cleanName)
      if (classData[fallbackId] && classData[fallbackId] !== 'standard') {
        return { status: classData[fallbackId], studentId: fallbackId, classId: cId }
      }

      return null
    }

    // 1. Check candidate class IDs first (e.g. groups from lesson page)
    for (const cId of candidateClassIds) {
      const res = checkClass(cId)
      if (res) return res
    }

    // 2. Check current class in store
    const currentClassId = get().classId
    if (currentClassId) {
      const res = checkClass(currentClassId)
      if (res) return res
    }

    // 3. Search across all stored classes in case student exists in any class
    for (const classKey of Object.keys(all)) {
      const numClassId = Number(classKey)
      const res = checkClass(numClassId)
      if (res) return res
    }

    // Default: generate standard id with primary candidate or current class
    const targetClass = candidateClassIds[0] || currentClassId || 0
    let resolvedId = nameToId[cleanName]
    if (!resolvedId) {
      for (const [knownName, mappedId] of Object.entries(nameToId)) {
        if (matchStudentName(cleanName, knownName)) {
          resolvedId = mappedId
          break
        }
      }
    }
    const fallbackId = generateStudentFallbackId(targetClass, cleanName)
    return {
      status: 'standard',
      studentId: resolvedId || fallbackId,
      classId: targetClass,
    }
  },

  getStudentIdByName: (name: string): string => {
    const cleanName = name.replace(/\s+/g, ' ').trim()
    const mappedId = get().nameToIdMap[cleanName]
    if (mappedId) return mappedId

    // Try initial or fuzzy matching
    for (const [k, v] of Object.entries(get().nameToIdMap)) {
      if (matchStudentName(cleanName, k)) return v
    }

    // Fallback: generate deterministic ID based on classId and student name
    const classId = get().classId || getClassId()
    return generateStudentFallbackId(classId, cleanName)
  },

  setStudentMappings: async (
    students: { id: string | number; name: string }[],
    targetClassId?: number
  ) => {
    const nameToId: Record<string, string> = { ...get().nameToIdMap }
    const idToName: Record<string, string> = { ...get().idToNameMap }
    const classId = targetClassId || get().classId || getClassId()
    const currentStatuses = { ...get().statuses }

    for (const s of students) {
      const serverId = String(s.id)
      const cleanName = s.name.replace(/\s+/g, ' ').trim()
      if (cleanName && serverId) {
        nameToId[cleanName] = serverId
        idToName[serverId] = cleanName

        // Also check if there was a fallback ID with a saved status
        const fallbackId = generateStudentFallbackId(classId, cleanName)
        if (currentStatuses[fallbackId] && !currentStatuses[serverId]) {
          currentStatuses[serverId] = currentStatuses[fallbackId]
          delete currentStatuses[fallbackId]
        }
      }
    }

    set({
      nameToIdMap: nameToId,
      idToNameMap: idToName,
      statuses: currentStatuses,
    })

    if (classId) {
      try {
        await updateStoredExtensionData((prev) => {
          const allStatuses = { ...(prev.studentStatuses || {}) }
          const allMappings = { ...(prev.studentNameMappings || {}) }
          allStatuses[String(classId)] = currentStatuses
          allMappings[String(classId)] = nameToId
          return {
            ...prev,
            studentStatuses: allStatuses,
            studentNameMappings: allMappings,
          }
        })
      } catch (e) {
        console.error('[Human Boost] Error migrating fallback student statuses:', e)
      }
    }
  },

  reset: () =>
    set({
      statuses: {},
      nameToIdMap: {},
      idToNameMap: {},
      isLoaded: false,
    }),
}))

export default useStudentStatusesStore
