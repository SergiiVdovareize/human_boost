/**
 * Automation for reviewing student homework submissions on lesson pages (/lesson/...).
 * When a student's task is awaiting review ("Очікує") and the student has NOT attached
 * any files or links, an orange button "Не видно роботи" is displayed next to "Додати вкладення".
 *
 * Clicking this button:
 * 1. Extracts the student's first name (e.g. "Максим" from "Костенко Максим В'ячеславович").
 * 2. Writes "[Імʼя], не видно роботи. Спробуй завантажити ще раз." into the chat input.
 * 3. Clicks the chat send button.
 * 4. Clicks "Повернути на доопрацювання" to return the homework for revision.
 */

let reviewObserver: MutationObserver | null = null
let isProcessing = false

/**
 * Extracts the student's first name from a full Ukrainian name.
 * Examples:
 * - "Костенко Максим В'ячеславович" -> "Максим"
 * - "Мустафа Максим Ілліч" -> "Максим"
 * - "Петренко Олена" -> "Олена"
 * - "Максим" -> "Максим"
 */
export function extractStudentFirstName(rawName: string): string {
  if (!rawName) return ''
  const clean = rawName
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = clean.split(' ').filter((w) => w.length > 1 && !w.includes('.') && !w.includes(':'))
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]
  // In Ukrainian full name "Прізвище Ім'я По батькові" or "Прізвище Ім'я":
  // Word 0 is surname (Прізвище), Word 1 is first name (Ім'я).
  return words[1]
}

/**
 * Finds the student's name on the current homework review page.
 * Uses exact .student-info .names header in the drawer and active student in list.
 */
export function findCurrentStudentName(approvalEl?: HTMLElement | null): string {
  // 1. Direct student header element in review drawer/modal (.student-info .names)
  const studentInfoName = document.querySelector<HTMLElement>(
    '.student-info .names, [class*="student-info"] .names, .student-info [class*="names"]'
  )
  if (studentInfoName?.textContent?.trim()) {
    return studentInfoName.textContent.trim()
  }

  // 2. Active student in sidebar/list (.active or .selected student item)
  const activeUser = document.querySelector<HTMLElement>(
    '.active [class*="user__name"], .selected [class*="user__name"], .active .bem-user__name, .selected .bem-user__name'
  )
  if (activeUser?.textContent?.trim()) {
    return activeUser.textContent.trim()
  }

  // 3. Inside approval container if provided
  if (approvalEl) {
    const el = approvalEl.querySelector<HTMLElement>('.names, [class*="names"]')
    if (el?.textContent?.trim()) {
      return el.textContent.trim()
    }
  }

  return ''
}

/**
 * Checks whether the current homework submission is awaiting review ("Очікує").
 */
export function isSubmissionPendingReview(approvalEl?: HTMLElement | null): boolean {
  const root =
    approvalEl || document.querySelector<HTMLElement>('app-home-task-approval') || document.body

  // 1. Check status text in header: "Очікує"
  const statusEl = root.querySelector<HTMLElement>(
    '.expand-block__header-info-text, [class*="header-info-text"], [class*="status-text"]'
  )
  if (statusEl) {
    const text = statusEl.textContent?.trim().toLowerCase() || ''
    if (text.includes('очікує') || text.includes('pending') || text.includes('перевір')) {
      return true
    }
  }

  // 2. Presence of "Повернути на доопрацювання" and "Схвалити" buttons confirms review mode
  const hasReturnBtn = Boolean(
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) =>
        b.textContent?.trim().includes('Повернути на доопрацювання') &&
        !b.classList.contains('ha-btn-no-work')
    )
  )

  return hasReturnBtn
}

/**
 * Checks whether the student has attached any files, images, or external links.
 * Strictly examines the student's work block (.expand-block for "Робота учня").
 * Link submissions use <link-preview-minimalism> / .attachment2 (not files-list).
 */
export function checkHasAttachments(approvalEl?: HTMLElement | null): boolean {
  const root =
    approvalEl || document.querySelector<HTMLElement>('app-home-task-approval') || document.body

  // 1. Angular files-list component inside student work
  const filesList = root.querySelector('files-list')
  if (filesList) {
    const hasItems = Array.from(filesList.children).some(
      (el) => el.nodeType === Node.ELEMENT_NODE && el.tagName !== 'COMMENT'
    )
    if (hasItems) return true
  }

  // 2. Angular images-toolbar component inside student work
  const imagesToolbar = root.querySelector('images-toolbar')
  if (imagesToolbar) {
    const hasItems = Array.from(imagesToolbar.children).some(
      (el) => el.nodeType === Node.ELEMENT_NODE && el.tagName !== 'COMMENT'
    )
    if (hasItems) return true
  }

  // 3. File items, download links, or preview images inside student work block
  const studentWorkBlock =
    root.querySelector('.home-task-user-info .expand-block, .expand-block:first-of-type') || root

  const otherFiles = studentWorkBlock.querySelectorAll(
    '.file-item, [class*="file-item"], [class*="attachment-item"], a[download], a[href*="download"], a[href*="storage"]'
  )
  if (otherFiles.length > 0) return true

  const workImages = studentWorkBlock.querySelectorAll<HTMLImageElement>(
    '.expand-block__body img:not([src*="icon"]):not(.avatar):not([class*="avatar"])'
  )
  if (workImages.length > 0) return true

  // 4. External link attachments (Google Docs etc.) — link-preview-minimalism cards
  if (studentWorkBlock.querySelector('link-preview-minimalism')) return true

  const linkOverlays = studentWorkBlock.querySelectorAll<HTMLAnchorElement>(
    '.attachment2 a.overlay[href], .attachment2 a[href], a.overlay[href]'
  )
  for (const a of linkOverlays) {
    const href = a.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) return true
  }

  return false
}

/**
 * Executes the full action:
 * 1. Fills message into chat.
 * 2. Clicks chat send button.
 * 3. Clicks "Повернути на доопрацювання".
 */
export async function executeNoWorkAction(buttonEl: HTMLButtonElement): Promise<void> {
  if (isProcessing) return
  isProcessing = true

  const originalContent = buttonEl.innerHTML
  buttonEl.disabled = true
  buttonEl.innerHTML = `
    <span class="ha-spinner" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ha-spin 0.6s linear infinite;vertical-align:middle;margin-right:5px;"></span>
    <span>Надсилаю...</span>
  `

  try {
    const approvalEl = document.querySelector<HTMLElement>('app-home-task-approval')

    // 1. Detect student first name
    const rawFullName = findCurrentStudentName(approvalEl)
    const firstName = extractStudentFirstName(rawFullName)

    // Formulate message: "Максим, не видно роботи. Спробуй завантажити ще раз."
    const message = firstName
      ? `${firstName}, не видно роботи. Спробуй завантажити ще раз.`
      : 'Не видно роботи. Спробуй завантажити ще раз.'

    // 2. Locate chat textarea
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '.new-chat-footer__send-panel__input, textarea[placeholder*="повідомлення"], create-chat-item2 textarea'
    )

    if (textarea) {
      textarea.value = message
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))

      // Allow Angular form control to update and enable send button
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 3. Click chat send button
      const sendBtn = document.querySelector<HTMLButtonElement>(
        '.new-chat-footer__send-panel-button button, button:has(icon2[icon="send-new"]), .send-button button, .new-chat-footer button'
      )
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click()
      }
    } else {
      console.warn('[Human Boost] Chat textarea not found on page.')
    }

    // Allow chat message to process before clicking return
    await new Promise((resolve) => setTimeout(resolve, 450))

    // 4. Locate and click "Повернути на доопрацювання"
    const returnBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) =>
        b.textContent?.includes('Повернути на доопрацювання') &&
        !b.classList.contains('ha-btn-no-work')
    )

    if (returnBtn) {
      returnBtn.click()
    } else {
      console.warn('[Human Boost] Button "Повернути на доопрацювання" not found.')
    }

    buttonEl.innerHTML = '<span>✓ Повернуто</span>'
    await new Promise((resolve) => setTimeout(resolve, 1500))
  } catch (err) {
    console.error('[Human Boost] Error executing no work action:', err)
  } finally {
    buttonEl.innerHTML = originalContent
    buttonEl.disabled = false
    isProcessing = false
  }
}

/**
 * Injects the orange "Не видно роботи" button next to "Додати вкладення".
 * Displays ONLY when:
 * 1. The submission is pending review ("Очікує").
 * 2. The student has NOT attached any files or external links.
 */
export function injectNoWorkButton(): void {
  const approvalEl = document.querySelector<HTMLElement>('app-home-task-approval')

  // 1. Only show if task is awaiting review ("Очікує")
  const isPending = isSubmissionPendingReview(approvalEl)
  if (!isPending) {
    document.querySelectorAll('.ha-btn-no-work').forEach((el) => {
      el.remove()
    })
    return
  }

  // 2. Only show if student has NOT attached any files
  const hasAttachments = checkHasAttachments(approvalEl)
  if (hasAttachments) {
    document.querySelectorAll('.ha-btn-no-work').forEach((el) => {
      el.remove()
    })
    return
  }

  // 3. Locate the "Додати вкладення" button
  const addAttachmentBtn = Array.from(
    document.querySelectorAll<HTMLElement>('button, ev-button')
  ).find(
    (b) =>
      b.textContent?.trim().includes('Додати вкладення') && !b.classList.contains('ha-btn-no-work')
  )

  if (!addAttachmentBtn) {
    document.querySelectorAll('.ha-btn-no-work').forEach((el) => {
      el.remove()
    })
    return
  }

  // If button is wrapped in <ev-button>, position relative to the wrapper
  const targetEl =
    addAttachmentBtn.parentElement?.tagName.toLowerCase() === 'ev-button'
      ? addAttachmentBtn.parentElement
      : addAttachmentBtn

  if (!targetEl.parentElement) return

  const existingBtn = document.querySelector<HTMLButtonElement>('.ha-btn-no-work')
  if (existingBtn) {
    // Ensure it sits right next to targetEl as next sibling
    if (existingBtn.previousElementSibling !== targetEl) {
      targetEl.parentElement.insertBefore(existingBtn, targetEl.nextSibling)
    }
    return
  }

  // Create clean orange button without icons
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'ha-btn-no-work button event-strategy-1 no-select clickable'
  btn.setAttribute(
    'title',
    'Надіслати учню в чат «[Імʼя], не видно роботи. Спробуй завантажити ще раз» та повернути на доопрацювання'
  )
  btn.innerHTML = '<span>Не видно роботи</span>'

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void executeNoWorkAction(btn)
  })

  // Insert right next to "Додати вкладення"
  targetEl.parentElement.insertBefore(btn, targetEl.nextSibling)
}

/**
 * Initializes DOM observer to inject/remove the button as appropriate.
 */
export function initLessonHomeworkReview(): void {
  injectNoWorkButton()

  if (!reviewObserver && typeof document !== 'undefined') {
    reviewObserver = new MutationObserver(() => {
      injectNoWorkButton()
    })

    reviewObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    })
  }
}

/**
 * Disconnects the review observer and removes injected button.
 */
export function destroyLessonHomeworkReview(): void {
  if (reviewObserver) {
    reviewObserver.disconnect()
    reviewObserver = null
  }
  document.querySelectorAll('.ha-btn-no-work').forEach((el) => {
    el.remove()
  })
}
