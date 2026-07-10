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
} from '../domain/constants'
import type { AppSettings, TemperatureColorBand, TemperatureThresholds } from '../domain/types'

export const defaultSettings: AppSettings = {
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

  for (const [rawName, tag] of Object.entries(tags)) {
    const name = rawName.trim()

    if (!name)
      continue

    normalized[name] = {
      color: tag.color || DEFAULT_TAG_COLOR,
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
