export type ModalType = 'basic'

export type StudentStatusType = 'standard' | 'withdrawn' | 'family' | 'abroad'

export interface StudentStatusOption {
  value: StudentStatusType
  label: string
  shortLabel: string
  color: string
  bg: string
  border: string
  dot: string
}

export interface AppSettings {
  showStudentStatuses?: boolean
  highlightAbsentForInactive?: boolean
  highlightMandatoryWorks?: boolean
  highlightGradeMismatch?: boolean
  highlightVideoConference?: boolean
  highlightUnpublishedLessons?: boolean
}

/** Persisted extension payload in chrome.storage (and optional remote sync). */
export interface StoredExtensionData {
  studentStatuses?: Record<string, Record<string, StudentStatusType>>
  studentNameMappings?: Record<string, Record<string, string>>
  settings?: AppSettings
  isPanelOpen?: boolean
  [key: string]: unknown
}
