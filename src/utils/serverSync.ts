import type { StoredExtensionData, StudentStatusType } from '@/types'
import {
  getStoredExtensionData,
  registerRemoteSyncCallback,
  updateStoredExtensionData,
} from './syncStorage'

const SYNC_API_URL: string = (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/+$/, '')
const SYNC_SECRET: string = import.meta.env.VITE_SYNC_SECRET || ''

let cachedUserId: string | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Checks whether remote backend sync is configured with API URL and secret.
 */
export function isServerSyncConfigured(): boolean {
  return Boolean(SYNC_API_URL && SYNC_SECRET)
}

/**
 * Retrieves the current teacher's Human.ua User ID.
 * Looks into:
 * 1. DOM attribute data-ha-user-id set by main-world bridge (intercomSettings.user_id)
 * 2. In-memory cache
 * 3. chrome.storage.local cache
 */
export async function getCurrentUserId(): Promise<string | null> {
  // 1. Direct DOM attribute from main-world bridge
  if (typeof document !== 'undefined') {
    const domUid = document.documentElement.getAttribute('data-ha-user-id')
    if (domUid && /^\d+$/.test(domUid.trim())) {
      const uid = domUid.trim()
      cachedUserId = uid
      try {
        await chrome?.storage?.local?.set({ ha_cached_user_id: uid })
      } catch {
        // ignore
      }
      return uid
    }
  }

  // 2. Memory cache
  if (cachedUserId) {
    return cachedUserId
  }

  // 3. chrome.storage.local cached ID
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    try {
      const res = await chrome.storage.local.get('ha_cached_user_id')
      if (res?.ha_cached_user_id) {
        cachedUserId = String(res.ha_cached_user_id)
        return cachedUserId
      }
    } catch {
      // ignore
    }
  }

  return null
}

/**
 * Fetches latest automator data for the specified user from the remote backend.
 */
export async function fetchRemoteSyncData(
  userId: string
): Promise<{ data: StoredExtensionData; updatedAt: number | null } | null> {
  if (!isServerSyncConfigured()) return null

  try {
    const url = `${SYNC_API_URL}/${encodeURIComponent(userId)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-sync-secret': SYNC_SECRET,
      },
    })

    if (!res.ok) {
      console.warn(`[Human Boost Sync] GET failed: HTTP ${res.status}`)
      return null
    }

    const json = (await res.json()) as {
      userId?: string
      data?: StoredExtensionData
      updatedAt?: number | null
    }

    return {
      data: json.data || {},
      updatedAt: json.updatedAt || null,
    }
  } catch (e) {
    console.warn('[Human Boost Sync] Failed to fetch remote data:', e)
    return null
  }
}

/**
 * Pushes updated automator data to the remote backend.
 */
export async function pushRemoteSyncData(
  userId: string,
  data: StoredExtensionData
): Promise<boolean> {
  if (!isServerSyncConfigured()) return false

  try {
    const url = `${SYNC_API_URL}/${encodeURIComponent(userId)}`
    const payload = {
      data,
      clientUpdatedAt: Date.now(),
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sync-secret': SYNC_SECRET,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.warn(`[Human Boost Sync] POST failed: HTTP ${res.status}`)
      return false
    }

    return true
  } catch (e) {
    console.warn('[Human Boost Sync] Failed to push data to server:', e)
    return false
  }
}

/**
 * Schedules a debounced push of local data to the backend.
 * Avoids sending rapid successive requests when user toggles multiple statuses.
 */
export function schedulePushRemoteData(data: StoredExtensionData, delayMs = 1500): void {
  if (!isServerSyncConfigured()) return

  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(async () => {
    const userId = await getCurrentUserId()
    if (!userId) return

    await pushRemoteSyncData(userId, data)
  }, delayMs)
}

/**
 * Deep merges remote student statuses into local student statuses:
 * preserves existing local classes and overlays remote changes.
 */
function mergeStudentStatuses(
  local?: Record<string, Record<string, StudentStatusType>>,
  remote?: Record<string, Record<string, StudentStatusType>>
): Record<string, Record<string, StudentStatusType>> {
  const merged: Record<string, Record<string, StudentStatusType>> = { ...(local || {}) }

  if (!remote) return merged

  for (const [classId, remoteStudents] of Object.entries(remote)) {
    merged[classId] = {
      ...(merged[classId] || {}),
      ...remoteStudents,
    }
  }

  return merged
}

/**
 * Synchronizes local data with the remote server:
 * 1. Identifies the current user.
 * 2. Fetches remote data from backend.
 * 3. Merges remote statuses and settings into local storage.
 * 4. If remote is empty but local has data, initializes remote storage.
 */
export async function performServerSync(onUpdated?: () => void): Promise<void> {
  if (!isServerSyncConfigured()) return

  const userId = await getCurrentUserId()
  if (!userId) {
    return
  }

  const remoteResult = await fetchRemoteSyncData(userId)
  if (!remoteResult) return

  const remoteData = remoteResult.data
  const localData = await getStoredExtensionData()

  const hasRemoteData =
    Boolean(remoteData.studentStatuses && Object.keys(remoteData.studentStatuses).length > 0) ||
    Boolean(remoteData.settings && Object.keys(remoteData.settings).length > 0)

  const hasLocalData =
    Boolean(localData.studentStatuses && Object.keys(localData.studentStatuses).length > 0) ||
    Boolean(localData.settings && Object.keys(localData.settings).length > 0)

  if (hasRemoteData) {
    // Merge inside the updater so we always overlay onto the latest local write
    // (avoids stomping a setting the user toggled while this fetch was in flight).
    await updateStoredExtensionData((prev) => ({
      ...prev,
      studentStatuses: mergeStudentStatuses(prev.studentStatuses, remoteData.studentStatuses),
      settings: {
        ...(remoteData.settings || {}),
        ...(prev.settings || {}),
      },
    }))

    if (onUpdated) {
      onUpdated()
    }
  } else if (hasLocalData) {
    // Initialize empty remote backend with existing local data
    await pushRemoteSyncData(userId, localData)
  }
}

/**
 * Initializes automatic server synchronization:
 * 1. Hooks into syncStorage to push changes automatically.
 * 2. Listens for user detection events from main-world bridge.
 * 3. Performs initial pull/merge.
 */
export function initServerSync(onUpdated?: () => void): () => void {
  if (!isServerSyncConfigured()) return () => {}

  // 1. Hook into storage changes to push debounced updates
  registerRemoteSyncCallback((data) => {
    schedulePushRemoteData(data)
  })

  // 2. Listen for custom user-detected event from main-world bridge
  const userListener = () => {
    void performServerSync(onUpdated)
  }
  window.addEventListener('ha:user-detected', userListener)

  // 3. Initial sync attempt (if userId already in cache)
  void performServerSync(onUpdated)

  return () => {
    window.removeEventListener('ha:user-detected', userListener)
  }
}
