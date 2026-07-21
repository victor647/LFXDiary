import {
  DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
  DEFAULT_GIT_BRANCH,
  DEFAULT_GIT_DIARY_PATH,
  DEFAULT_LAN_NAS_URL,
  DEFAULT_MARKDOWN_FOLDER,
  DEFAULT_PUBLIC_NAS_URL,
  DEFAULT_TAG_COLOR,
  DEFAULT_TEMPERATURE_THRESHOLDS,
  SETTINGS_KEY,
  TAG_COLOR_PALETTE,
  TEMPERATURE_COLOR_BAND_DEFINITIONS,
  normalizeColorName,
} from '../domain/constants'
import { mirrorToFiles } from './storage'
import type { AppSettings, TemperatureColorBand, TemperatureThresholds } from '../domain/types'
import { normalizePersonTag, normalizePointOfInterestTag } from './tags'

export const defaultSettings: AppSettings = {
  theme: 'system' as const,
  syncProvider: 'nas',
  nasMode: 'lan',
  lanNasUrl: DEFAULT_LAN_NAS_URL,
  publicNasUrl: DEFAULT_PUBLIC_NAS_URL,
  nasUsername: '',
  nasPassword: '',
  markdownFolder: DEFAULT_MARKDOWN_FOLDER,
  gitRemoteUrl: '',
  gitBranch: DEFAULT_GIT_BRANCH,
  gitUsername: '',
  gitPassword: '',
  gitAuthorName: '',
  gitAuthorEmail: '',
  gitDiaryPath: DEFAULT_GIT_DIARY_PATH,
  gitCorsProxy: '',
  birthDate: '',
  aqicnToken: '',
  aliyunAirAppCode: '',
  aliyunAirAppKey: '',
  aliyunAirAppSecret: '',
  activityColorGroupNames: DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
  activityTags: {},
  personColorGroupNames: DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
  peopleTags: {},
  pointOfInterestColorGroupNames: DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
  pointOfInterestTags: {},
  locationColorGroupNames: DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
  temperatureThresholds: DEFAULT_TEMPERATURE_THRESHOLDS,
}

export function loadSettings(): AppSettings {
  // Run GUID migration if needed (safe to call multiple times)
  migrateGuidsToNames()
  migrateHexToColorNames()

  const raw = localStorage.getItem(SETTINGS_KEY)

  if (!raw)
    return defaultSettings

  try {
    return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
  mirrorToFiles()
}

export function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const legacySettings = settings as Partial<AppSettings> & { temperatureColorBands?: TemperatureColorBand[] }
  const publicNasUrl =
    settings.publicNasUrl === 'https://lafaxi647.cn:5001/'
      ? DEFAULT_PUBLIC_NAS_URL
      : settings.publicNasUrl || DEFAULT_PUBLIC_NAS_URL
  const markdownFolder =
    settings.markdownFolder === '/LFXDiary' || settings.markdownFolder === '/home/Documents/Diary'
      ? DEFAULT_MARKDOWN_FOLDER
      : settings.markdownFolder || DEFAULT_MARKDOWN_FOLDER

  return {
    theme: settings.theme === 'dark' ? 'dark' : settings.theme === 'system' ? 'system' : 'light',
    syncProvider: settings.syncProvider === 'git' ? 'git' : 'nas',
    nasMode: settings.nasMode === 'public' ? 'public' : 'lan',
    lanNasUrl: normalizeNasUrl(settings.lanNasUrl || DEFAULT_LAN_NAS_URL),
    publicNasUrl: normalizeNasUrl(publicNasUrl),
    nasUsername: settings.nasUsername?.trim() ?? '',
    nasPassword: settings.nasPassword ?? '',
    markdownFolder: normalizeFolder(markdownFolder),
    gitRemoteUrl: settings.gitRemoteUrl?.trim() ?? '',
    gitBranch: settings.gitBranch?.trim() || DEFAULT_GIT_BRANCH,
    gitUsername: settings.gitUsername?.trim() ?? '',
    gitPassword: settings.gitPassword ?? '',
    gitAuthorName: settings.gitAuthorName?.trim() ?? '',
    gitAuthorEmail: settings.gitAuthorEmail?.trim() ?? '',
    gitDiaryPath: normalizeGitPath(settings.gitDiaryPath || DEFAULT_GIT_DIARY_PATH),
    gitCorsProxy: normalizeOptionalUrl(settings.gitCorsProxy ?? ''),
    birthDate: normalizeBirthDate(settings.birthDate ?? ''),
    aqicnToken: settings.aqicnToken?.trim() ?? '',
    aliyunAirAppCode: settings.aliyunAirAppCode?.trim() ?? '',
    aliyunAirAppKey: settings.aliyunAirAppKey?.trim() ?? '',
    aliyunAirAppSecret: settings.aliyunAirAppSecret?.trim() ?? '',
    activityColorGroupNames: normalizeActivityColorGroupNames(settings.activityColorGroupNames ?? {}),
    activityTags: normalizeActivityTags(settings.activityTags ?? {}),
    personColorGroupNames: normalizeActivityColorGroupNames(settings.personColorGroupNames ?? settings.activityColorGroupNames ?? {}),
    peopleTags: normalizeActivityTags(settings.peopleTags ?? {}),
    pointOfInterestColorGroupNames: normalizeActivityColorGroupNames(settings.pointOfInterestColorGroupNames ?? settings.locationColorGroupNames ?? settings.activityColorGroupNames ?? {}),
    pointOfInterestTags: normalizeActivityTags(settings.pointOfInterestTags ?? {}),
    locationColorGroupNames: normalizeActivityColorGroupNames(settings.locationColorGroupNames ?? settings.activityColorGroupNames ?? {}),
    temperatureThresholds: normalizeTemperatureThresholds(settings.temperatureThresholds ?? getLegacyTemperatureThresholds(legacySettings.temperatureColorBands)),
  }
}

export function getActiveNasUrl(settings: AppSettings): string {
  return settings.nasMode === 'lan' ? settings.lanNasUrl : settings.publicNasUrl
}

export function getActivityColorGroupName(settings: AppSettings, color: string): string {
  return settings.activityColorGroupNames[color] || DEFAULT_ACTIVITY_COLOR_GROUP_NAMES[color] || color
}

export function getPersonColorGroupName(settings: AppSettings, color: string): string {
  return settings.personColorGroupNames[color] || DEFAULT_ACTIVITY_COLOR_GROUP_NAMES[color] || color
}

export function getTemperatureColorBands(thresholds: TemperatureThresholds): TemperatureColorBand[] {
  const normalizedThresholds = normalizeTemperatureThresholds(thresholds)

  return TEMPERATURE_COLOR_BAND_DEFINITIONS.map((definition, index) => {
    const previousDefinition = TEMPERATURE_COLOR_BAND_DEFINITIONS[index - 1]
    const minC = previousDefinition ? normalizedThresholds[previousDefinition.id] : null
    const maxC = index === TEMPERATURE_COLOR_BAND_DEFINITIONS.length - 1 ? null : normalizedThresholds[definition.id]

    return {
      ...definition,
      label: formatTemperatureBandLabel(minC, maxC),
      minC,
      maxC,
    }
  })
}

export function normalizeTemperatureThresholds(thresholds: TemperatureThresholds): TemperatureThresholds {
  const normalized: TemperatureThresholds = {}
  let previousValue = Number.NEGATIVE_INFINITY

  for (const definition of TEMPERATURE_COLOR_BAND_DEFINITIONS.slice(0, -1)) {
    const rawValue = thresholds[definition.id]
    const defaultValue = DEFAULT_TEMPERATURE_THRESHOLDS[definition.id]
    const value = Number.isFinite(rawValue) ? rawValue : defaultValue
    const nextValue = Math.max(Math.round(value), previousValue + 1)

    normalized[definition.id] = nextValue
    previousValue = nextValue
  }

  return normalized
}

function normalizeNasUrl(value: string): string {
  const trimmed = value.trim()

  if (!trimmed)
    return DEFAULT_LAN_NAS_URL

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function normalizeFolder(value: string): string {
  const trimmed = value.trim()

  if (!trimmed)
    return DEFAULT_MARKDOWN_FOLDER

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeGitPath(value: string): string {
  const trimmed = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

  return trimmed || DEFAULT_GIT_DIARY_PATH
}

function normalizeOptionalUrl(value: string): string {
  const trimmed = value.trim()

  if (!trimmed)
    return ''

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function normalizeBirthDate(value: string): string {
  const trimmed = value.trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
    return ''

  const date = new Date(`${trimmed}T12:00:00`)

  if (Number.isNaN(date.getTime()))
    return ''

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  return date > today ? '' : trimmed
}

function normalizeActivityColorGroupNames(names: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const color of TAG_COLOR_PALETTE)
    normalized[color] = names[color]?.trim() || DEFAULT_ACTIVITY_COLOR_GROUP_NAMES[color] || color

  for (const [color, name] of Object.entries(names)) {
    if (normalized[color])
      continue

    normalized[color] = name.trim() || color
  }

  return normalized
}

function normalizeActivityTags(tags: AppSettings['activityTags']): AppSettings['activityTags'] {
  const normalized: AppSettings['activityTags'] = {}

  for (const [id, tag] of Object.entries(tags)) {
    if (!id.trim())
      continue

    normalized[id] = {
      color: normalizeColorName(tag.color) || DEFAULT_TAG_COLOR,
      pinned: tag.pinned === true,
    }
  }

  return normalized
}

function getLegacyTemperatureThresholds(bands: TemperatureColorBand[] | undefined): TemperatureThresholds {
  if (!bands)
    return DEFAULT_TEMPERATURE_THRESHOLDS

  const legacyThresholds: TemperatureThresholds = {}

  for (const band of bands) {
    if (typeof band.maxC !== 'number')
      continue

    if (band.id === 'below-freezing')
      legacyThresholds['freezing'] = band.maxC
    else if (band.id === 'mild')
      legacyThresholds.comfortable = band.maxC
    else if (band.id in DEFAULT_TEMPERATURE_THRESHOLDS)
      legacyThresholds[band.id] = band.maxC
  }

  return {
    ...DEFAULT_TEMPERATURE_THRESHOLDS,
    ...legacyThresholds,
  }
}

function formatTemperatureBandLabel(minC: number | null, maxC: number | null): string {
  if (minC === null && maxC !== null)
    return `< ${maxC}°C`

  if (minC !== null && maxC === null)
    return `>= ${minC}°C`

  if (minC !== null && maxC !== null)
    return `${minC}-${maxC}°C`

  return 'Temperature'
}

export function getSettingsPersonColor(settings: AppSettings, person: string): string | null {
  const normalizedPerson = normalizePersonTag(person)

  for (const [name, tag] of Object.entries(settings.peopleTags)) {
    if (normalizePersonTag(name) === normalizedPerson)
      return tag.color
  }

  return null
}

export function getSettingsPointOfInterestColor(settings: AppSettings, pointOfInterest: string): string | null {
  const normalizedPointOfInterest = normalizePointOfInterestTag(pointOfInterest)

  for (const [name, tag] of Object.entries(settings.pointOfInterestTags)) {
    if (normalizePointOfInterestTag(name) === normalizedPointOfInterest)
      return tag.color
  }

  return null
}

const NAME_MIGRATION_KEY = 'lfx-diary.name-migration.v1'

/** One-time migration: convert GUID-keyed tags back to name-keyed */
export function migrateGuidsToNames(): void {
  if (localStorage.getItem(NAME_MIGRATION_KEY)) return

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Build GUID → name map from settings
  const guidToName = new Map<string, string>()
  const settingsRaw = localStorage.getItem('lfx-diary.settings.v1')
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw)
      for (const section of ['activityTags', 'peopleTags', 'pointOfInterestTags'] as const) {
        for (const [key, tag] of Object.entries(s[section] ?? {}) as [string, { name: string }][]) {
          if (uuidPattern.test(key) && tag.name && !uuidPattern.test(tag.name))
            guidToName.set(key, tag.name)
        }
      }
    } catch { return }
  }

  if (guidToName.size === 0) {
    localStorage.setItem(NAME_MIGRATION_KEY, '1')
    return
  }

  // Migrate settings
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw)
      for (const section of ['activityTags', 'peopleTags', 'pointOfInterestTags'] as const) {
        const next: Record<string, unknown> = {}
        for (const [key, tag] of Object.entries(s[section] ?? {}) as [string, { name?: string; color: string; pinned?: boolean }][]) {
          const nameKey = guidToName.get(key) ?? (uuidPattern.test(key) ? (tag.name ?? key) : key)
          const { name: _name, ...rest } = tag as { name?: string; color: string; pinned?: boolean }
          next[nameKey] = rest
        }
        s[section] = next
      }
      localStorage.setItem('lfx-diary.settings.v1', JSON.stringify(s))
    } catch { /* continue */ }
  }

  // Migrate entries
  const entriesRaw = localStorage.getItem('lfx-diary.entries.v1')
  if (entriesRaw) {
    try {
      const monthData = JSON.parse(entriesRaw)
      for (const month of Object.values(monthData) as { entries?: unknown[] }[]) {
        if (!Array.isArray(month?.entries)) continue
        for (const entry of month.entries as Record<string, unknown>[]) {
          for (const field of ['tags', 'people', 'pointsOfInterest'] as const) {
            if (Array.isArray(entry[field]))
              entry[field] = (entry[field] as string[]).map((id) => guidToName.get(id) ?? id)
          }
          for (const field of ['tagColors', 'personColors', 'pointOfInterestColors'] as const) {
            const colors = entry[field] as Record<string, string> | undefined
            if (colors) {
              const next: Record<string, string> = {}
              for (const [key, color] of Object.entries(colors))
                next[guidToName.get(key) ?? key] = color
              entry[field] = next
            }
          }
        }
      }
      localStorage.setItem('lfx-diary.entries.v1', JSON.stringify(monthData))
    } catch { /* continue */ }
  }

  // Migrate catalog
  const catalogRaw = localStorage.getItem('lfx-diary.catalog.v1')
  if (catalogRaw) {
    try {
      const c = JSON.parse(catalogRaw)
      for (const section of ['activities', 'people', 'pointsOfInterest'] as const) {
        const next: Record<string, unknown> = {}
        for (const [key, tag] of Object.entries(c[section] ?? {}) as [string, { name?: string }][]) {
          const nameKey = guidToName.get(key) ?? (uuidPattern.test(key) ? ((tag as { name?: string }).name ?? key) : key)
          const { name: _name, ...rest } = tag as { name?: string; color?: string; pinned?: boolean; entries?: string[] }
          next[nameKey] = rest
        }
        c[section] = next
      }
      localStorage.setItem('lfx-diary.catalog.v1', JSON.stringify(c))
    } catch { /* continue */ }
  }

  localStorage.setItem(NAME_MIGRATION_KEY, '1')
}

const COLOR_MIGRATION_KEY = 'lfx-diary.color-name-migration.v1'

function normalizeColorInRecord(record: Record<string, { color: string; pinned?: boolean }>): boolean {
  let changed = false
  for (const [key, tag] of Object.entries(record)) {
    const normalized = normalizeColorName(tag.color)
    if (normalized !== tag.color) {
      record[key] = { ...tag, color: normalized }
      changed = true
    }
  }
  return changed
}

/** One-time migration: convert hex colors to color names */
function migrateHexToColorNames(): void {
  if (localStorage.getItem(COLOR_MIGRATION_KEY)) return

  // Migrate settings
  const settingsRaw = localStorage.getItem('lfx-diary.settings.v1')
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw)
      let changed = false
      for (const section of ['activityTags', 'peopleTags', 'pointOfInterestTags'] as const) {
        if (s[section] && normalizeColorInRecord(s[section] as Record<string, { color: string }>))
          changed = true
      }
      if (changed)
        localStorage.setItem('lfx-diary.settings.v1', JSON.stringify(s))
    } catch { /* ignore */ }
  }

  // Migrate entries
  const entriesRaw = localStorage.getItem('lfx-diary.entries.v1')
  if (entriesRaw) {
    try {
      const monthData = JSON.parse(entriesRaw)
      let changed = false
      for (const month of Object.values(monthData) as { entries?: unknown[] }[]) {
        if (!Array.isArray(month?.entries)) continue
        for (const entry of month.entries as Record<string, unknown>[]) {
          for (const field of ['tagColors', 'personColors', 'pointOfInterestColors', 'locationColors'] as const) {
            const colors = entry[field] as Record<string, string> | undefined
            if (colors) {
              for (const key of Object.keys(colors)) {
                const normalized = normalizeColorName(colors[key])
                if (normalized !== colors[key]) {
                  colors[key] = normalized
                  changed = true
                }
              }
            }
          }
        }
      }
      if (changed)
        localStorage.setItem('lfx-diary.entries.v1', JSON.stringify(monthData))
    } catch { /* ignore */ }
  }

  // Migrate catalog
  const catalogRaw = localStorage.getItem('lfx-diary.catalog.v1')
  if (catalogRaw) {
    try {
      const c = JSON.parse(catalogRaw)
      let changed = false
      for (const section of ['activities', 'people', 'pointsOfInterest'] as const) {
        if (c[section] && normalizeColorInRecord(c[section] as Record<string, { color: string }>))
          changed = true
      }
      // Also normalize location colors
      if (c.locations) {
        for (const key of Object.keys(c.locations as Record<string, { color: string }>)) {
          const loc = (c.locations as Record<string, { color: string }>)[key]
          const normalized = normalizeColorName(loc.color)
          if (normalized !== loc.color) {
            loc.color = normalized
            changed = true
          }
        }
      }
      if (changed)
        localStorage.setItem('lfx-diary.catalog.v1', JSON.stringify(c))
    } catch { /* ignore */ }
  }

  localStorage.setItem(COLOR_MIGRATION_KEY, '1')
}
