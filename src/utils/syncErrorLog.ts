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

  lines.push(getNasErrorHint(error))

  return lines.join('\n')
}

function getNasErrorHint(error: unknown): string {
  if (isSynologySyncError(error) && error.code === 119)
    return 'Hint: DSM error 119 means invalid session. The app will pass _sid and SynoToken through URL parameters for upload requests.'

  if (isSynologySyncError(error) && isGatewayErrorCode(error.code)) {
    if (isLocalNasProxyEndpoint(error.endpoint))
      return 'Hint: HTTP 502/503/504 from /nas-public-api or /nas-lan-api usually means the local dev proxy could not reach DSM or received an invalid gateway response. Check the proxy targets in vite.config.ts or set LFX_DIARY_NAS_PUBLIC_URL / LFX_DIARY_NAS_LAN_URL before starting npm run browser:dev.'

    return 'Hint: HTTP 502/503/504 usually means the NAS gateway, reverse proxy, QuickConnect/DDNS route, or DSM itself returned an upstream error before the FileStation API responded.'
  }

  if (isSynologySyncError(error) && error.message.includes('non-JSON response'))
    return 'Hint: DSM APIs should return JSON for login/list/upload errors. A non-JSON response is often an HTML error page from a proxy, captive login page, or gateway. Check the Endpoint and Original error response preview above.'

  return 'Hint: Browser "Failed to fetch" usually means the request was blocked before DSM returned JSON. Check CORS, TLS certificate trust, DNS, and whether DSM allows requests from http://127.0.0.1:5173.'
}

function isGatewayErrorCode(code: number | undefined): boolean {
  return code === 502 || code === 503 || code === 504
}

function isLocalNasProxyEndpoint(endpoint: string | undefined): boolean {
  return Boolean(endpoint?.includes('/nas-public-api/') || endpoint?.includes('/nas-lan-api/'))
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

export function normalizeBodyText(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

export function formatImportSourceLabel(files: File[]): string {
  if (files.length === 1)
    return files[0].name

  return `${files.length} files`
}

export function getImportStatusMessage(
  fileName: string,
  importedCount: number,
  addedTags: string[],
  addedPeople: string[],
  weatherFailureCount: number,
  encryptedCount: number,
  unsupportedCount: number,
): string {
  const detailParts = [
    addedTags.length ? `Added ${addedTags.length} activity ${addedTags.length === 1 ? 'tag' : 'tags'}` : '',
    addedPeople.length ? `Added ${addedPeople.length} people ${addedPeople.length === 1 ? 'tag' : 'tags'}` : '',
    weatherFailureCount ? `${weatherFailureCount} weather ${weatherFailureCount === 1 ? 'fetch' : 'fetches'} failed` : '',
    encryptedCount ? `Skipped ${encryptedCount} encrypted ${encryptedCount === 1 ? 'note' : 'notes'}` : '',
    unsupportedCount ? `Skipped ${unsupportedCount} unsupported ${unsupportedCount === 1 ? 'note' : 'notes'}` : '',
  ].filter(Boolean)
  const details = detailParts.length ? ` ${detailParts.join('. ')}.` : ''

  return `Imported ${importedCount} ${importedCount === 1 ? 'entry' : 'entries'} from ${fileName}.${details} Click Push to upload.`
}

export function getEmptyImportStatusMessage(fileName: string, encryptedCount: number, unsupportedCount: number): string {
  if (encryptedCount)
    return `No entries imported from ${fileName}. ${encryptedCount} encrypted ${encryptedCount === 1 ? 'note uses' : 'notes use'} base64:aes, which cannot be read without the export key.`

  if (unsupportedCount)
    return `No entries imported from ${fileName}. ${unsupportedCount} unsupported ${unsupportedCount === 1 ? 'note' : 'notes'} found.`

  return `No importable notes found in ${fileName}.`
}
