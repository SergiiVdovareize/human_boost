/**
 * Diagnostic inspector for lesson homework & student submission pages.
 * Analyzes DOM structure, student name, attached files, comment textarea, and submit button.
 */

export interface HomeworkInspectionResult {
  url: string
  queryParams: Record<string, string>
  studentNameCandidates: string[]
  detectedStudentName: string | null
  appComponents: string[]
  fileAttachmentElements: Array<{
    selector: string
    text: string
    tagName: string
    className: string
    href?: string
  }>
  textAreas: Array<{
    selector: string
    tagName: string
    className: string
    placeholder: string
    isContentEditable: boolean
    valueOrText: string
  }>
  sendButtons: Array<{
    selector: string
    text: string
    tagName: string
    className: string
    disabled: boolean
    hasSvg: boolean
  }>
  submissionAreaSnippets: Array<{
    selector: string
    snippet: string
  }>
}

let lastInspectedUrl = ''
let lastInspectedUser = ''
let inspectorDebounceTimer: number | null = null

export function inspectLessonHomework(): HomeworkInspectionResult {
  const url = window.location.href
  const urlObj = new URL(url)
  const queryParams: Record<string, string> = {}
  urlObj.searchParams.forEach((val, key) => {
    queryParams[key] = val
  })

  // 1. Angular app-* component hierarchy
  const appComponents = Array.from(document.querySelectorAll('*'))
    .map((el) => el.tagName.toLowerCase())
    .filter((tag) => tag.startsWith('app-'))
    .filter((tag, idx, arr) => arr.indexOf(tag) === idx)

  // 2. Student name candidates
  const studentNameCandidates: string[] = []

  // Check active student in sidebar/list
  const activeUserEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.active .bem-user__name, .active .user__name, .selected .bem-user__name, .selected .user__name, [class*="active"] [class*="user__name"], [class*="selected"] [class*="user__name"]'
    )
  )
  activeUserEls.forEach((el) => {
    const t = el.textContent?.trim()
    if (t && !studentNameCandidates.includes(t)) studentNameCandidates.push(t)
  })

  // Check user info in header / review pane
  const userInfoEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.bem-user__name, [class*="user-name"], [class*="student-name"], [class*="user__name"], .user-info, .header-user, [class*="author"]'
    )
  )
  userInfoEls.forEach((el) => {
    const t = el.textContent?.trim()
    if (
      t &&
      t.length > 2 &&
      t.length < 50 &&
      !t.includes('\n') &&
      !studentNameCandidates.includes(t)
    ) {
      studentNameCandidates.push(t)
    }
  })

  // Tooltips on user elements
  const tooltipUserEls = Array.from(
    document.querySelectorAll<HTMLElement>('[data-awesome-tooltip], [mattooltip], [title]')
  )
  tooltipUserEls.forEach((el) => {
    const tip = (
      el.getAttribute('data-awesome-tooltip') ||
      el.getAttribute('mattooltip') ||
      el.getAttribute('title') ||
      ''
    ).trim()
    if (
      tip &&
      tip.split(' ').length >= 2 &&
      tip.length < 40 &&
      !tip.includes('<') &&
      !studentNameCandidates.includes(tip)
    ) {
      studentNameCandidates.push(tip)
    }
  })

  // Determine best student name
  const detectedStudentName = studentNameCandidates[0] || null

  // 3. File attachments detection
  const fileAttachmentElements: HomeworkInspectionResult['fileAttachmentElements'] = []

  // Query common file/attachment selectors
  const potentialFileEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a[href*="download"], a[href*="file"], a[href*="storage"], a[download], [class*="attachment"], [class*="file-item"], [class*="attached"], [class*="document"], [class*="uploaded"], app-file, app-attachment, .file'
    )
  )
  potentialFileEls.forEach((el) => {
    // Avoid counting avatars or navigation links
    if (el.closest('.bem-user__avatar, .header, nav, .sidebar')) return
    fileAttachmentElements.push({
      selector:
        el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ').join('.')}` : ''),
      text: el.textContent?.trim().slice(0, 100) || '',
      tagName: el.tagName.toLowerCase(),
      className: el.className || '',
      href: el instanceof HTMLAnchorElement ? el.href : el.querySelector('a')?.href || undefined,
    })
  })

  // Also check images inside work area (excluding avatars)
  const workImages = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      'app-homework img, [class*="homework"] img, [class*="answer"] img, [class*="submission"] img, [class*="task"] img'
    )
  ).filter((img) => !img.closest('.bem-user, .avatar, [class*="avatar"]'))

  workImages.forEach((img) => {
    fileAttachmentElements.push({
      selector: `img.${img.className || 'work-image'}`,
      text: img.alt || img.src.slice(0, 80),
      tagName: 'img',
      className: img.className || '',
      href: img.src,
    })
  })

  // 4. Textareas / comment / chat input
  const textAreas: HomeworkInspectionResult['textAreas'] = []
  const inputElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'textarea, div[contenteditable="true"], [class*="comment"] input, [class*="chat"] input, [class*="message"] textarea, app-chat textarea'
    )
  )
  inputElements.forEach((el) => {
    const isCE = el.getAttribute('contenteditable') === 'true'
    const placeholder =
      el.getAttribute('placeholder') ||
      el.getAttribute('data-placeholder') ||
      el.getAttribute('aria-label') ||
      ''
    const valOrText =
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el.value
        : el.textContent || ''
    textAreas.push({
      selector:
        el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ').join('.')}` : ''),
      tagName: el.tagName.toLowerCase(),
      className: el.className || '',
      placeholder,
      isContentEditable: isCE,
      valueOrText: valOrText.slice(0, 100),
    })
  })

  // 5. Send / Submit buttons
  const sendButtons: HomeworkInspectionResult['sendButtons'] = []
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]')
  )
  buttons.forEach((btn) => {
    const text = btn.textContent?.trim() || ''
    const hasSvg = Boolean(btn.querySelector('svg, icon2, img'))
    const isSendLike =
      /надісла|відправи|відправ|зберег|поверн|перевір|send|submit/i.test(text) ||
      btn.querySelector(
        'svg path[d*="M2.01 21L23 12 2.01 3"], [data-icon*="send"], icon2[icon*="send"]'
      ) !== null ||
      btn.closest('[class*="chat"], [class*="comment"], [class*="footer"], [class*="message"]') !==
        null

    if (isSendLike || (hasSvg && btn.closest('[class*="chat"], [class*="comment"]'))) {
      const isDisabled =
        btn.hasAttribute('disabled') ||
        btn.classList.contains('disabled') ||
        btn.getAttribute('aria-disabled') === 'true'
      sendButtons.push({
        selector:
          btn.tagName.toLowerCase() +
          (btn.className ? `.${btn.className.split(' ').join('.')}` : ''),
        text: text.slice(0, 50),
        tagName: btn.tagName.toLowerCase(),
        className: btn.className || '',
        disabled: isDisabled,
        hasSvg,
      })
    }
  })

  // 6. Snippets from main submission / review area
  const submissionAreaSnippets: HomeworkInspectionResult['submissionAreaSnippets'] = []
  const mainReviewContainers = Array.from(
    document.querySelectorAll<HTMLElement>(
      'app-lesson-task, app-homework, app-submission, [class*="homework-review"], [class*="task-review"], [class*="student-work"], [class*="submission-detail"], .lesson-content'
    )
  )
  mainReviewContainers.forEach((container) => {
    const text = container.innerText?.replace(/\s+/g, ' ').trim().slice(0, 300) || ''
    if (text) {
      submissionAreaSnippets.push({
        selector:
          container.tagName.toLowerCase() +
          (container.className ? `.${container.className.split(' ').join('.')}` : ''),
        snippet: text,
      })
    }
  })

  const result: HomeworkInspectionResult = {
    url,
    queryParams,
    studentNameCandidates,
    detectedStudentName,
    appComponents,
    fileAttachmentElements,
    textAreas,
    sendButtons,
    submissionAreaSnippets,
  }

  // Print diagnostic banner to console
  console.group(
    `%c[Human Boost] 🔍 ДІАГНОСТИКА УРОКУ ТА ЗАВДАННЯ (${new Date().toLocaleTimeString()})`,
    'background: #0f172a; color: #38bdf8; font-weight: bold; padding: 4px 8px; border-radius: 4px;'
  )
  console.log('🌐 URL:', url)
  console.log('📌 Query Params:', queryParams)
  console.log('👤 Знайдені кандидати учня:', studentNameCandidates)
  console.log('👤 Найбільш вірогідне імʼя учня:', detectedStudentName)
  console.log('🧩 Angular компоненти на сторінці:', appComponents)
  console.log(
    `📎 Знайдено прикріплених файлів/зображень: ${fileAttachmentElements.length}`,
    fileAttachmentElements
  )
  console.log(`💬 Поля вводу повідомлення/коментаря (${textAreas.length}):`, textAreas)
  console.log(`🚀 Кнопки надсилання (${sendButtons.length}):`, sendButtons)
  if (submissionAreaSnippets.length > 0) {
    console.log('📝 Текстовий зміст робочої зони:', submissionAreaSnippets)
  }
  console.log(
    '%c💡 Скопіюйте вміст цієї групи консолі або зробіть скриншот для аналізу різниці!',
    'color: #10b981; font-weight: bold;'
  )
  console.groupEnd()

  return result
}

// Expose helper globally on window for manual triggering via console
if (typeof window !== 'undefined') {
  ;(window as unknown as { haInspectHomework: typeof inspectLessonHomework }).haInspectHomework =
    inspectLessonHomework
}

let lessonObserver: MutationObserver | null = null

/**
 * Initializes automatic observation and logging on lesson pages.
 */
export function initLessonHomeworkInspector(): void {
  // Run once immediately with a slight delay to allow Angular components to render
  scheduleInspection(1200)

  // Watch for student switching or DOM changes inside main content
  if (!lessonObserver && typeof document !== 'undefined') {
    lessonObserver = new MutationObserver(() => {
      const currentUrl = window.location.href
      const currentUser = new URL(currentUrl).searchParams.get('user') || ''
      if (currentUrl !== lastInspectedUrl || currentUser !== lastInspectedUser) {
        scheduleInspection(800)
      }
    })

    lessonObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    })
  }
}

function scheduleInspection(delayMs: number): void {
  if (inspectorDebounceTimer !== null) {
    window.clearTimeout(inspectorDebounceTimer)
  }
  inspectorDebounceTimer = window.setTimeout(() => {
    inspectorDebounceTimer = null
    lastInspectedUrl = window.location.href
    lastInspectedUser = new URL(window.location.href).searchParams.get('user') || ''
    inspectLessonHomework()
  }, delayMs)
}

export function destroyLessonHomeworkInspector(): void {
  if (inspectorDebounceTimer !== null) {
    window.clearTimeout(inspectorDebounceTimer)
    inspectorDebounceTimer = null
  }
  if (lessonObserver) {
    lessonObserver.disconnect()
    lessonObserver = null
  }
}
