/**
 * Main World Bridge for Human Boost.
 * Runs directly in the main page context to read window.intercomSettings and expose userId.
 */
;(() => {
  function checkUser() {
    try {
      const uid = window.intercomSettings?.user_id
      if (uid) {
        const strUid = String(uid).trim()
        if (strUid && document.documentElement.getAttribute('data-ha-user-id') !== strUid) {
          document.documentElement.setAttribute('data-ha-user-id', strUid)
          window.dispatchEvent(new CustomEvent('ha:user-detected', { detail: { userId: strUid } }))
        }
      }
    } catch {
      // ignore
    }
  }

  checkUser()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkUser)
  }
  window.addEventListener('load', checkUser)
  setInterval(checkUser, 2000)
})()
