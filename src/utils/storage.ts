/**
 * File-based persistent storage for Electron.
 * Mirrors all localStorage writes to the user's data folder.
 * On startup in Electron, restores from files if localStorage is empty.
 */

const STORAGE_KEYS = [
  'lfx-diary.settings.v1',
  'lfx-diary.catalog.v1',
  'lfx-diary.month-index.v1',
] as const

function getElectronAPI() {
  return window.electronAPI ?? null
}

export function getDataFolder(): string | null {
  // Will be filled after first getDataFolder call
  return null
}

export async function pickDataFolder(): Promise<string | null> {
  const api = getElectronAPI()
  if (!api) return null
  return api.pickDataFolder()
}

/** Mirror all localStorage data to the Electron data folder */
export function mirrorToFiles(): void {
  const api = getElectronAPI()
  if (!api) return

  for (const key of STORAGE_KEYS) {
    const value = localStorage.getItem(key)
    if (value != null) {
      const filename = key.replace('lfx-diary.', 'diary-').replace('.v1', '') + '.json'
      api.writeFile(filename, value)
    }
  }

  // Also mirror month entries
  const monthIndexRaw = localStorage.getItem('lfx-diary.month-index.v1')
  if (monthIndexRaw) {
    try {
      const monthIndex = JSON.parse(monthIndexRaw) as Record<string, unknown>
      for (const monthKey of Object.keys(monthIndex)) {
        const monthRaw = localStorage.getItem(`lfx-diary.month.${monthKey}.v1`)
        if (monthRaw != null) {
          api.writeFile(`diary-month-${monthKey}.json`, monthRaw)
        }
      }
    } catch { /* ignore parse errors */ }
  }
}

/** Restore data from Electron files into localStorage if localStorage is empty */
export async function restoreFromFiles(): Promise<boolean> {
  const api = getElectronAPI()
  if (!api) return false

  // Only restore if localStorage appears empty (no settings)
  if (localStorage.getItem('lfx-diary.settings.v1')) return false

  let restored = false
  for (const key of STORAGE_KEYS) {
    const filename = key.replace('lfx-diary.', 'diary-').replace('.v1', '') + '.json'
    const data = await api.readFile(filename)
    if (data) {
      localStorage.setItem(key, data)
      restored = true
    }
  }

  // Also restore month entries from files matching diary-month-*.json
  // (We can't enumerate files from the renderer, so this is limited)
  // The month index will trigger lazy loading on demand.

  return restored
}
