import type { StudentStatusOption, StudentStatusType } from '@/types'

export interface ExtendedStudentStatusOption extends StudentStatusOption {
  cornerLabel: string
}

export const STUDENT_STATUSES: Record<StudentStatusType, ExtendedStudentStatusOption> = {
  standard: {
    value: 'standard',
    label: 'Активний',
    shortLabel: 'Активний',
    cornerLabel: '',
    color: '#64748b',
    bg: '#f8fafc',
    border: '#cbd5e1',
    dot: '#16a34a',
  },
  withdrawn: {
    value: 'withdrawn',
    label: 'Вибув',
    shortLabel: 'Вибув',
    cornerLabel: 'вибув',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fca5a5',
    dot: '#ef4444',
  },
  family: {
    value: 'family',
    label: 'Сімейник',
    shortLabel: 'Сімейник',
    cornerLabel: 'сімейник',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#93c5fd',
    dot: '#3b82f6',
  },
  abroad: {
    value: 'abroad',
    label: 'Закордонник',
    shortLabel: 'Закордонник',
    cornerLabel: 'закордонник',
    color: '#d97706',
    bg: '#fefce8',
    border: '#fde047',
    dot: '#eab308',
  },
}

export const STUDENT_STATUS_LIST: ExtendedStudentStatusOption[] = [
  STUDENT_STATUSES.standard,
  STUDENT_STATUSES.family,
  STUDENT_STATUSES.abroad,
  STUDENT_STATUSES.withdrawn,
]
