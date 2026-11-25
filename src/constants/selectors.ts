/**
 * Centralized DOM selectors for human.ua gradebook & lesson views,
 * and custom Human Boost CSS class identifiers.
 */

export const GRADEBOOK_SELECTORS = {
  OUTLET: '.gradebook-container__table2-outlet',
  ROW: '.gradebook-container__table2-outlet .gradebook-container__table2-row',
  CELL: '.gradebook-narrow__cell',
  SMART_CELL: '.smart-cell',
  SUB_COL_ITEM: '.gradebook-narrow__header-item',
  LESSON_BLOCK: '.gradebook-narrow__main-header__item, .g-main-header__item',
  STUDENT_NAME: '.bem-user__name',
  ABSENT_RED_BUTTON: '.pseudo-button--color-red',
  MARK_INPUT: '.mark-group__input-container input.mark-group__input',
  MARK_APPROVE_BTN: '.mark-group .mark-buttons button .clickable',
} as const

export const HA_CLASSES = {
  STATUS_TAG: 'ha-status-corner-tag',
  LESSON_TAG: 'ha-lesson-status-tag',
  DOTS_BTN: 'ha-status-dots-btn',
  CONFLICT_EMOJI: 'ha-conflict-warning-emoji',
  CONFLICT_CELL: 'ha-cell--conflict',
  MANDATORY_MISSING_CELL: 'ha-cell--mandatory-missing',
  GRADE_MISMATCH_CELL: 'ha-cell--grade-mismatch',
  COPY_PREVIEW: 'ha-cell--copy-preview',
  STYLED_TOOLTIP: 'ha-styled-tooltip',
  MANDATORY_MENU_ITEM: 'ha-mandatory-grades-menu-item',
  THEMATIC_MANDATORY_GRADE: 'ha-thematic-grade--mandatory',
  UNPUBLISHED_LESSON: 'ha-lesson-unpublished',
  UNCREATED_LESSON: 'ha-lesson-uncreated',
  TASK_MISSING: 'ha-task-missing',
} as const
