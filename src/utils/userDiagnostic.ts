/**
 * Diagnostics utility to discover and log the current authenticated user's Human ID
 * by inspecting localStorage, sessionStorage, DOM, and Performance API entries.
 */

export interface UserCandidate {
  id: string | number
  source: string
  details?: string
  confidence: 'high' | 'medium' | 'low'
}

export function logCurrentHumanUserInfo(): UserCandidate[] {
  const candidates: UserCandidate[] = []
  const seen = new Set<string>()

  const addCandidate = (
    id: string | number | undefined | null,
    source: string,
    details?: string,
    confidence: 'high' | 'medium' | 'low' = 'medium'
  ) => {
    if (!id) return
    const strId = String(id).trim()
    if (!strId || strId === '0' || strId === 'undefined' || strId === 'null') return
    const key = `${strId}_${source}`
    if (!seen.has(key)) {
      seen.add(key)
      candidates.push({ id: strId, source, details, confidence })
    }
  }

  // 1. Inspect localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const rawVal = localStorage.getItem(key)
      if (!rawVal) continue

      // Look for user-like keys
      const lowerKey = key.toLowerCase()
      if (
        lowerKey.includes('user') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('profile') ||
        lowerKey.includes('account') ||
        lowerKey.includes('token') ||
        lowerKey.includes('session')
      ) {
        try {
          const parsed = JSON.parse(rawVal)
          if (parsed && typeof parsed === 'object') {
            const uid =
              parsed.id ||
              parsed.userId ||
              parsed.user_id ||
              parsed.uid ||
              parsed.sub ||
              parsed.user?.id ||
              parsed.profile?.id
            if (uid) {
              const name = parsed.name || parsed.fullName || parsed.user?.name || parsed.email || ''
              addCandidate(
                uid,
                `localStorage['${key}']`,
                name ? `Ім'я/Email: ${name}` : undefined,
                'high'
              )
            }
          }
        } catch {
          // If plain number or string ID
          if (/^\d{3,10}$/.test(rawVal)) {
            addCandidate(rawVal, `localStorage['${key}']`, 'Числовий рядок', 'medium')
          }
        }
      }
    }
  } catch (e) {
    console.debug('[Human Boost] localStorage scan error:', e)
  }

  // 2. Inspect sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (!key) continue
      const rawVal = sessionStorage.getItem(key)
      if (!rawVal) continue

      const lowerKey = key.toLowerCase()
      if (
        lowerKey.includes('user') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('profile') ||
        lowerKey.includes('token')
      ) {
        try {
          const parsed = JSON.parse(rawVal)
          if (parsed && typeof parsed === 'object') {
            const uid =
              parsed.id ||
              parsed.userId ||
              parsed.user_id ||
              parsed.sub ||
              parsed.user?.id ||
              parsed.profile?.id
            if (uid) {
              addCandidate(uid, `sessionStorage['${key}']`, undefined, 'high')
            }
          }
        } catch {
          if (/^\d{3,10}$/.test(rawVal)) {
            addCandidate(rawVal, `sessionStorage['${key}']`, 'Числовий рядок', 'medium')
          }
        }
      }
    }
  } catch (e) {
    console.debug('[Human Boost] sessionStorage scan error:', e)
  }

  // 3. Inspect DOM (header profile links, avatars, user menus)
  try {
    // Links pointing to profiles or user pages
    const profileLinks = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/user/"], a[href*="/profile/"], a[href*="/teacher/"], a[href*="/person/"], a[href*="/users/"]'
    )
    profileLinks.forEach((link) => {
      const href = link.getAttribute('href') || ''
      const match = href.match(/\/(?:user|profile|teacher|person|users)\/(\d+)/i)
      if (match?.[1]) {
        const text = link.innerText?.trim() || link.getAttribute('title') || ''
        addCandidate(
          match[1],
          `DOM Link: ${href}`,
          text ? `Текст посилання: "${text}"` : undefined,
          'high'
        )
      }
    })

    // Data attributes in DOM
    const userElements = document.querySelectorAll<HTMLElement>(
      '[data-user-id], [data-userid], [data-account-id]'
    )
    userElements.forEach((el) => {
      const uid =
        el.getAttribute('data-user-id') ||
        el.getAttribute('data-userid') ||
        el.getAttribute('data-account-id')
      if (uid) {
        addCandidate(uid, `DOM Attribute: ${el.tagName.toLowerCase()}`, el.className, 'medium')
      }
    })

    // User avatar or name in top bar
    const userHeader = document.querySelector<HTMLElement>(
      '.header-user, .user-menu, .profile-menu, .bem-user, .user-avatar, .user-profile'
    )
    if (userHeader) {
      const userText = userHeader.innerText?.trim().replace(/\s+/g, ' ')
      const links = userHeader.querySelectorAll<HTMLAnchorElement>('a')
      links.forEach((l) => {
        const h = l.getAttribute('href') || ''
        const m = h.match(/(\d{3,10})/)
        if (m?.[1]) {
          addCandidate(m[1], 'DOM Header User block', `Текст: "${userText}"`, 'high')
        }
      })
    }
  } catch (e) {
    console.debug('[Human Boost] DOM scan error:', e)
  }

  // 4. Inspect Performance / Network resource URLs
  try {
    if (typeof performance !== 'undefined') {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      for (let i = entries.length - 1; i >= 0; i--) {
        const url = entries[i].name
        if (!url.includes('human.ua')) continue

        // Look for patterns like /api/.../user/12345 or /users/12345
        const userMatch = url.match(/\/(?:users?|profile|teacher)\/(\d{3,10})(?:[/?#]|$)/i)
        if (userMatch?.[1]) {
          addCandidate(userMatch[1], 'API Request URL', url, 'medium')
        }
      }
    }
  } catch (e) {
    console.debug('[Human Boost] Performance scan error:', e)
  }

  // 5. Output formatted diagnostic log
  console.group(
    '%c[Human Boost] 🔍 Детекція Human ID користувача%c',
    'background: #4f46e5; color: white; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 13px;',
    'color: inherit;'
  )

  if (candidates.length > 0) {
    console.log(
      '%cЗнайдено потенційні Human ID у системі:%c',
      'font-weight: bold; color: #16a34a;',
      'color: inherit;'
    )
    console.table(
      candidates.map((c) => ({
        'Human ID': c.id,
        'Надійність (Confidence)': c.confidence,
        'Джерело (Source)': c.source,
        'Деталі (Details)': c.details || '—',
      }))
    )
    console.log(
      '%c💡 Підказка:%c Для повторного сканування в будь-який момент викличте у консолі: %cwindow.__haInspectUser()',
      'font-weight: bold; color: #2563eb;',
      'color: inherit;',
      'background: #f1f5f9; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: bold;'
    )
  } else {
    console.warn(
      '[Human Boost] Не вдалося автоматично знайти Human ID у localStorage або DOM. Можливо, сторінка ще завантажується. Викличте window.__haInspectUser() через кілька секунд.'
    )
  }

  // Also print full storage summary for deep debugging
  try {
    const storageKeys: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) {
        const val = localStorage.getItem(k) || ''
        storageKeys[k] = val.length > 100 ? `${val.slice(0, 100)}...` : val
      }
    }
    console.groupCollapsed('📦 Всі ключі localStorage (клікніть для перегляду):')
    console.table(storageKeys)
    console.groupEnd()
  } catch {
    // ignore
  }

  console.groupEnd()

  return candidates
}

/**
 * Initializes auto-logging of current user info.
 */
export function initUserDiagnostic(): void {
  // Expose global helper for manual inspection
  ;(window as unknown as { __haInspectUser?: typeof logCurrentHumanUserInfo }).__haInspectUser =
    logCurrentHumanUserInfo

  // Run initial scan after a short delay so the SPA DOM and auth storage are populated
  setTimeout(() => {
    logCurrentHumanUserInfo()
  }, 1500)
}
