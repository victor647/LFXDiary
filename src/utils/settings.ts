import {
  DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
  DEFAULT_GIT_BRANCH,
  DEFAULT_GIT_DIARY_PATH,
  DEFAULT_LAN_NAS_URL,
  DEFAULT_MARKDOWN_FOLDER,
  DEFAULT_PUBLIC_NAS_URL,
  SETTINGS_KEY,
  TAG_COLOR_PALETTE,
} from '../domain/constants'
import type { AppSettings } from '../domain/types'

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
  activityColorGroupNames: DEFAULT_ACTIVITY_COLOR_GROUP_NAMES,
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
    activityColorGroupNames: normalizeActivityColorGroupNames(settings.activityColorGroupNames ?? {}),
  }
}

export function getActiveNasUrl(settings: AppSettings): string {
  return settings.nasMode === 'lan' ? settings.lanNasUrl : settings.publicNasUrl
}

export function getActivityColorGroupName(settings: AppSettings, color: string): string {
  return settings.activityColorGroupNames[color] || DEFAULT_ACTIVITY_COLOR_GROUP_NAMES[color] || color
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
