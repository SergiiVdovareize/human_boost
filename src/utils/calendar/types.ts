export interface CalendarApiResponse {
  periods?: Array<{
    id: number
    number: number
    start_at: number
    finish_at: number
  }>
  scheduleHelpers?: Array<{
    id: number
    period?: number
    group_id?: number
    day_of_week?: number
  }>
  lessonEvents?: Array<{
    id: number
    date: number
    date_end?: number
    date_start: string
    date_finish: string
    theme_id: number
    group_id: number
    schedule_helper_id?: number
    has_task?: boolean | number
    hasTask?: boolean | number
    has_home_task?: boolean | number
    hasHomeTask?: boolean | number
    tasks?: Array<Record<string, unknown>>
    homeTasks?: Array<Record<string, unknown>>
    lessonTasks?: Array<Record<string, unknown>>
    webConference?: {
      id: number
      url?: string
    } | null
    group?: {
      id: number
      number: number | null
      letter: number | null
      subgroup: number | null
      subject?: {
        id: number
        i18n?: {
          name?: string
        }
      }
    }
  }>
  lessonTasks?: Array<{
    id: number
    theme_id?: number
    lesson_event_id?: number
    event_id?: number
    type_id: number
    published: number
    published_at: number | null
    status?: number
    title?: string | null
    _recipients?: string | null
    recipients?: Array<unknown>
    type?: {
      id: number
      category: number
      name: string
      short_name: string
    }
  }>
  homeTasks?: Array<{
    id: number
    theme_id?: number
    lesson_event_id?: number
    event_id?: number
    type_id?: number
    published?: number
    published_at?: number | null
    status?: number
    title?: string | null
    _recipients?: string | null
    recipients?: Array<unknown>
    type?: {
      id: number
      category: number
      name: string
      short_name: string
    }
  }>
  tasks?: Array<Record<string, unknown>>
  userHomeTasks?: Array<{
    id: number
    theme_id?: number
    published?: number
    expire_date?: number | null
    group_id?: number
    title?: string | null
    type?: {
      id: number
      category: number
      name: string
      short_name: string
    }
  }>
  themes?: Array<{
    id: number
    title: string
    position?: number
  }>
}

export interface LessonEventStatus {
  eventId: number
  themeId: number
  themeTitle: string
  subjectName: string
  groupText: string
  groupNumber?: number
  period?: number
  dateStart: string
  dateFinish: string
  dateStartTimestamp?: number
  dateEndTimestamp?: number
  dateStr: string // YYYY-MM-DD
  dayOfWeek: number // 0 = Mon, 1 = Tue, ..., 6 = Sun
  isLessonPublished: boolean // true if lessonTask published === 2
  hasLessonTask: boolean
  hasPublishedTask: boolean // true if a task (завдання) is published
  hasTask: boolean // true if any task (завдання) exists for this theme
  isTaskExpected: boolean // true if task is expected for this lesson (not junior class and task exists in curriculum)
  hasWebConference: boolean
}
