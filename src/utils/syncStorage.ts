import type { StoredExtensionData } from '@/types'

/**
 * Legacy chrome.storage key. Do not rename — existing installs depend on it.
 */
const STORAGE_KEY = 'humanAutomator'

/**
 * Checks whether chrome.storage.sync is available.
 */
function isSyncAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome?.storage?.sync)
}

/**
 * Loads persisted extension data:
 * 1. chrome.storage.sync (Google profile) when present
 * 2. otherwise chrome.storage.local
 *
 * Reads never write — writing on read re-enters onChanged and races UI toggles.
 */
export async function getStoredExtensionData(): Promise<StoredExtensionData> {
  let syncData: StoredExtensionData | undefined

  if (isSyncAvailable()) {
    try {
      const res = (await chrome.storage.sync.get(STORAGE_KEY)) as {
        [STORAGE_KEY]?: StoredExtensionData
      }
      syncData = res[STORAGE_KEY]
    } catch (e) {
      console.warn('[Human Boost] chrome.storage.sync read error, falling back to local:', e)
    }
  }

  if (syncData && Object.keys(syncData).length > 0) {
    return syncData
  }

  let localData: StoredExtensionData = {}
  try {
    const localRes = (await chrome.storage.local.get(STORAGE_KEY)) as {
      [STORAGE_KEY]?: StoredExtensionData
    }
    localData = localRes[STORAGE_KEY] || {}
  } catch (e) {
    console.error('[Human Boost] chrome.storage.local read error:', e)
  }

  return localData
}

/** Serialize read-modify-write so concurrent toggles/sync cannot stomp each other. */
let writeQueue: Promise<unknown> = Promise.resolve()

/**
 * Updates persisted extension data in sync + local storage.
 */
export async function updateStoredExtensionData(
  updater: (prev: StoredExtensionData) => StoredExtensionData
): Promise<StoredExtensionData> {
  const run = async (): Promise<StoredExtensionData> => {
    const currentData = await getStoredExtensionData()
    const updatedData = updater({ ...currentData })

    if (isSyncAvailable()) {
      try {
        await chrome.storage.sync.set({ [STORAGE_KEY]: updatedData })
      } catch (e) {
        console.warn('[Human Boost] Failed to save to chrome.storage.sync:', e)
      }
    }

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: updatedData })
    } catch (e) {
      console.error('[Human Boost] Failed to save to chrome.storage.local:', e)
    }

    if (remoteSyncCallback) {
      try {
        remoteSyncCallback(updatedData)
      } catch (e) {
        console.debug('[Human Boost] Remote sync callback error:', e)
      }
    }

    return updatedData
  }

  const result = writeQueue.then(run, run)
  writeQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

let remoteSyncCallback: ((data: StoredExtensionData) => void) | null = null

export function registerRemoteSyncCallback(cb: (data: StoredExtensionData) => void): void {
  remoteSyncCallback = cb
}

/**
 * Listens for live updates from Google Profile sync (or other tabs).
 */
export function initStorageSyncListener(
  onDataChanged: (data: StoredExtensionData) => void
): () => void {
  if (typeof chrome === 'undefined' || !chrome?.storage?.onChanged) {
    return () => {}
  }

  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if ((areaName === 'sync' || areaName === 'local') && changes[STORAGE_KEY]) {
      const newValue = changes[STORAGE_KEY].newValue as StoredExtensionData | undefined
      if (newValue) {
        onDataChanged(newValue)
      }
    }
  }

  chrome.storage.onChanged.addListener(listener)

  return () => {
    chrome.storage.onChanged.removeListener(listener)
  }
}

/**
 * Saves the side panel open/closed state to sessionStorage and chrome.storage.
 */
export async function setPanelOpenState(isOpen: boolean): Promise<void> {
  try {
    sessionStorage.setItem('ha_panel_open', isOpen ? '1' : '0')
  } catch {
    // ignore sessionStorage errors
  }

  try {
    await updateStoredExtensionData((prev) => ({
      ...prev,
      isPanelOpen: isOpen,
    }))
  } catch (e) {
    console.warn('[Human Boost] Failed to persist panel open state:', e)
  }
}

/**
 * Retrieves the side panel open/closed state.
 */
export async function getPanelOpenState(): Promise<boolean> {
  try {
    const sessionVal = sessionStorage.getItem('ha_panel_open')
    if (sessionVal !== null) {
      return sessionVal === '1'
    }
  } catch {
    // fallback to storage
  }

  try {
    const data = await getStoredExtensionData()
    return Boolean(data.isPanelOpen)
  } catch {
    return false
  }
}
