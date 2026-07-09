import type { AppSettings, DiaryEntry } from '../domain/types'
import { getEntryMarkdownFolder, getEntryNasMarkdownFileName } from './files'
import { getActiveNasUrl } from './settings'

type GitSyncErrorLike = Error & {
  name: 'GitSyncError'
  operation?: string
  originalMessage?: string
}

type SynologySyncErrorLike = Error & {
  name: 'SynologySyncError'
  phase?: string
  endpoint?: string
  code?: number
  originalMessage?: string
}

export function formatSyncErrorLog(
  error: unknown,
  settings: AppSettings,
  entry?: DiaryEntry,
  remoteFolder?: string,
): string {
  if (settings.syncProvider === 'git')
    return formatGitErrorLog(error, settings, entry)

  return formatNasErrorLog(
    error,
    settings,
    remoteFolder ?? (entry ? getEntryMarkdownFolder(settings.markdownFolder, entry) : settings.markdownFolder),
    entry,
  )
}

function formatGitErrorLog(
  error: unknown,
  settings: AppSettings,
  entry?: DiaryEntry,
): string {
  const lines = [
    `Time: ${new Date().toISOString()}`,
    `Message: ${error instanceof Error ? error.message : String(error)}`,
    'Sync provider: Git',
    `Remote: ${settings.gitRemoteUrl || 'not configured'}`,
    `Branch: ${settings.gitBranch}`,
    `Repo folder: ${settings.gitDiaryPath}`,
    `CORS proxy configured: ${settings.gitCorsProxy ? 'yes' : 'no'}`,
    `Username configured: ${settings.gitUsername ? 'yes' : 'no'}`,
    `Password/token configured: ${settings.gitPassword ? 'yes' : 'no'}`,
  ]

  if (entry) {
    lines.push(`Markdown file: ${getEntryGitMarkdownPath(settings, entry)}`)
    lines.push(`Entry date: ${entry.diaryDate}`)
  }

  if (isGitSyncError(error)) {
    if (error.operation)
      lines.push(`Operation: ${error.operation}`)

    if (error.originalMessage)
      lines.push(`Original error: ${error.originalMessage}`)
  }

  if (error instanceof Error && error.stack)
    lines.push(`Stack:\n${error.stack}`)

  lines.push(
    'Hint: Browser Git sync requires an HTTPS Git remote that allows browser requests, or a CORS proxy. For GitHub/Gitea, use a personal access token as the password.',
  )

  return lines.join('\n')
}

function formatNasErrorLog(
  error: unknown,
  settings: AppSettings,
  remoteFolder: string,
  entry?: DiaryEntry,
): string {
  const lines = [
    `Time: ${new Date().toISOString()}`,
    `Message: ${error instanceof Error ? error.message : String(error)}`,
    `NAS mode: ${settings.nasMode}`,
    `NAS URL: ${getActiveNasUrl(settings)}`,
    `Remote folder: ${remoteFolder}`,
    `Username configured: ${settings.nasUsername ? 'yes' : 'no'}`,
    `Password configured: ${settings.nasPassword ? 'yes' : 'no'}`,
  ]

  if (entry) {
    lines.push(`Markdown file: ${getEntryNasMarkdownFileName(entry)}`)
    lines.push(`Entry date: ${entry.diaryDate}`)
  }

  if (isSynologySyncError(error)) {
    if (error.phase)
      lines.push(`Phase: ${error.phase}`)

    if (error.endpoint)
      lines.push(`Endpoint: ${error.endpoint}`)

    if (error.code !== undefined)
      lines.push(`Code: ${error.code}`)

    if (error.originalMessage)
      lines.push(`Original error: ${error.originalMessage}`)
  }

  if (error instanceof Error && error.stack)
    lines.push(`Stack:\n${error.stack}`)

  if (isSynologySyncError(error) && error.code === 119) {
    lines.push(
      'Hint: DSM error 119 means invalid session. The app will pass _sid and SynoToken through URL parameters for upload requests.',
    )
  } else {
    lines.push(
      'Hint: Browser "Failed to fetch" usually means the request was blocked before DSM returned JSON. Check CORS, TLS certificate trust, DNS, and whether DSM allows requests from http://127.0.0.1:5173.',
    )
  }

  return lines.join('\n')
}

function isGitSyncError(error: unknown): error is GitSyncErrorLike {
  return error instanceof Error && error.name === 'GitSyncError'
}

function isSynologySyncError(error: unknown): error is SynologySyncErrorLike {
  return error instanceof Error && error.name === 'SynologySyncError'
}

function getEntryGitMarkdownPath(settings: AppSettings, entry: DiaryEntry): string {
  const [year, month] = entry.diaryDate.slice(0, 7).split('-')
  return joinGitPath(settings.gitDiaryPath, year, month, getEntryNasMarkdownFileName(entry))
}

function joinGitPath(...parts: string[]): string {
  return parts.map(normalizeGitPath).filter(Boolean).join('/')
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}
