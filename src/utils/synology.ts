import type { AppSettings, DiaryCatalog, DiaryEntry, NasConnectionMode } from '../domain/types'
import {
  DIARY_CATALOG_FILE_NAME,

  WEATHER_CODES_FILE_NAME,

  buildDiaryCatalog,

  deserializeDiaryCatalog,
  mergeDiaryCatalogs,
  serializeDiaryCatalog,
  serializeWeatherCodes,
  stripGuidTagKeys,

} from '../domain/diaryCatalog'
import {
  deserializeDiaryEntryMarkdown,
  serializeDiaryEntryMarkdown,
} from '../domain/diaryEntrySerialization'
import {
  getEntryMarkdownFolder,
  getEntryNasMarkdownFileName,
  getNotebookMarkdownFolder,
} from './files'
import { getRuntimeNasProxyBasePath, getRuntimeNasProxyMode } from './runtimeConfig'
import { getActiveNasUrl } from './settings'
import type { DiaryPullOptions } from '../application/diarySync'

type SynologyResponse<T = unknown> = {
  success: boolean
  data?: T
  error?: { code: number; message?: string }
}

type SynologyLoginData = {
  sid: string
  synotoken?: string
}

type SynologySession = {
  sid: string
  synoToken?: string
}

type SynologyListFile = {
  name: string
  path: string
  isdir: boolean
}

type SynologyListData = {
  files?: SynologyListFile[]
}

const SYNC_REQUEST_TIMEOUT_MS = 10000
const PULL_REQUEST_TIMEOUT_MS = 30000
const CATALOG_SYNC_REQUEST_TIMEOUT_MS = 30000
const PULL_FALLBACK_DELAY_MS = 5000

type SyncProgressCallback = (current: number, total: number, label?: string) => void

type SynologyRequestOptions = {
  requestTimeoutMs?: number
}

type SynologyPullResult =
  | { status: 'fulfilled'; mode: NasConnectionMode; entries: DiaryEntry[] }
  | { status: 'rejected'; mode: NasConnectionMode; error: unknown }

export class SynologySyncError extends Error {
  phase: string
  endpoint: string
  code?: number
  originalMessage?: string

  constructor(message: string, phase: string, endpoint: string, code?: number, originalMessage?: string) {
    super(message)
    this.name = 'SynologySyncError'
    this.phase = phase
    this.endpoint = endpoint
    this.code = code
    this.originalMessage = originalMessage
  }
}

export async function uploadEntriesToSynology(
  entries: DiaryEntry[],
  settings: AppSettings,
  catalogEntries: DiaryEntry[],
  onProgress?: SyncProgressCallback,
) {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  if (!entries.length)
    return

  onProgress?.(0, 0, 'Logging into NAS...')
  const baseUrl = getSynologyApiBaseUrl(settings)
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword)

  try {
    onProgress?.(0, entries.length, 'Uploading entry files...')
    for (const [index, entry] of entries.entries()) {
      await uploadMarkdownFile(
        baseUrl,
        session,
        getEntryMarkdownFolder(settings.markdownFolder, entry),
        getEntryNasMarkdownFileName(entry),
        serializeDiaryEntryMarkdown(entry),
      )
      onProgress?.(index + 1, entries.length)
    }
    onProgress?.(entries.length, entries.length, 'Entry upload complete.')

    // Download remote catalog for merge, then backup
    onProgress?.(0, 0, 'Downloading remote catalog for merge...')
    const remoteCatalog = await downloadDiaryCatalog(baseUrl, session, settings.markdownFolder)
    onProgress?.(0, 0, 'Backing up existing catalog...')
    await backupExistingCatalogOnNas(baseUrl, session, settings)

    onProgress?.(0, 0, 'Merging and uploading catalog...')
    const localCatalog = buildDiaryCatalog(catalogEntries)
    const mergedCatalog = stripGuidTagKeys(remoteCatalog ? mergeDiaryCatalogs(localCatalog, remoteCatalog) : localCatalog)
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      DIARY_CATALOG_FILE_NAME,
      serializeDiaryCatalog(mergedCatalog, settings),
      'application/json;charset=utf-8',
    )
    onProgress?.(0, 0, 'Uploading weather codes...')
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      WEATHER_CODES_FILE_NAME,
      serializeWeatherCodes(),
      'application/json;charset=utf-8',
    )
  } finally {
    onProgress?.(0, 0, 'Logging out...')
    await logoutFromSynology(baseUrl, session)
  }
}

export async function uploadDiaryCatalogToSynology(
  catalog: DiaryCatalog,
  settings: AppSettings,
  onProgress?: SyncProgressCallback,
) {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  const uploadModes = getSynologyPullModes(settings)
  const primaryMode = uploadModes[0]

  if (uploadModes.length === 1)
    return uploadDiaryCatalogToSynologyMode(catalog, { ...settings, nasMode: primaryMode }, onProgress)

  const fallbackMode = uploadModes[1]

  try {
    await uploadDiaryCatalogToSynologyMode(catalog, { ...settings, nasMode: primaryMode }, onProgress)
  } catch (error) {
    if (!shouldFallbackSynologyPull(error))
      throw error

    onProgress?.(0, 2, `Retrying through ${fallbackMode} NAS connection`)

    try {
      await uploadDiaryCatalogToSynologyMode(catalog, { ...settings, nasMode: fallbackMode }, onProgress)
    } catch (fallbackError) {
      throw getSynologyPullFallbackError(fallbackError, error, primaryMode, fallbackMode)
    }
  }
}


export async function downloadDiaryCatalogFromSynology(
  settings: AppSettings,
  onProgress?: SyncProgressCallback,
): Promise<DiaryCatalog | null> {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  const pullModes = getSynologyPullModes(settings)
  const primaryMode = pullModes[0]

  if (pullModes.length === 1)
    return downloadDiaryCatalogFromSynologyMode({ ...settings, nasMode: primaryMode }, onProgress)

  const fallbackMode = pullModes[1]

  try {
    return await downloadDiaryCatalogFromSynologyMode({ ...settings, nasMode: primaryMode }, onProgress)
  } catch (error) {
    if (!shouldFallbackSynologyPull(error))
      throw error

    onProgress?.(0, 1, `Retrying through ${fallbackMode} NAS connection`)

    try {
      return await downloadDiaryCatalogFromSynologyMode({ ...settings, nasMode: fallbackMode }, onProgress)
    } catch (fallbackError) {
      throw getSynologyPullFallbackError(fallbackError, error, primaryMode, fallbackMode)
    }
  }
}

async function downloadDiaryCatalogFromSynologyMode(
  settings: AppSettings,
  onProgress?: SyncProgressCallback,
): Promise<DiaryCatalog | null> {
  const baseUrl = getSynologyApiBaseUrl(settings)
  const requestOptions = { requestTimeoutMs: CATALOG_SYNC_REQUEST_TIMEOUT_MS }
  onProgress?.(0, 0, 'Logging into NAS...')
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword, requestOptions)

  try {
    onProgress?.(0, 1, 'Pulling catalog from NAS')
    const catalog = await downloadDiaryCatalog(baseUrl, session, settings.markdownFolder, requestOptions)
    onProgress?.(1, 1, DIARY_CATALOG_FILE_NAME)

    return catalog ?? null
  } finally {
    onProgress?.(0, 0, 'Logging out...')
    await logoutFromSynology(baseUrl, session, requestOptions)
  }
}

async function uploadDiaryCatalogToSynologyMode(
  catalog: DiaryCatalog,
  settings: AppSettings,
  onProgress?: SyncProgressCallback,
) {
  const baseUrl = getSynologyApiBaseUrl(settings)
  const requestOptions = { requestTimeoutMs: CATALOG_SYNC_REQUEST_TIMEOUT_MS }
  onProgress?.(0, 0, 'Logging into NAS...')
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword, requestOptions)

  try {
    // Download remote catalog for merge, then backup
    onProgress?.(0, 0, 'Downloading remote catalog for merge...')
    const remoteCatalog = await downloadDiaryCatalog(baseUrl, session, settings.markdownFolder, requestOptions)
    onProgress?.(0, 0, 'Backing up existing catalog...')
    await backupExistingCatalogOnNas(baseUrl, session, settings, requestOptions)

    onProgress?.(0, 0, 'Merging and uploading catalog...')
    const mergedCatalog = stripGuidTagKeys(remoteCatalog ? mergeDiaryCatalogs(catalog, remoteCatalog) : catalog)
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      DIARY_CATALOG_FILE_NAME,
      serializeDiaryCatalog(mergedCatalog, settings),
      'application/json;charset=utf-8',
      requestOptions,
    )
    onProgress?.(1, 2, DIARY_CATALOG_FILE_NAME)
    onProgress?.(0, 0, 'Uploading weather codes...')
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      WEATHER_CODES_FILE_NAME,
      serializeWeatherCodes(),
      'application/json;charset=utf-8',
      requestOptions,
    )
    onProgress?.(2, 2, WEATHER_CODES_FILE_NAME)
  } finally {
    onProgress?.(0, 0, 'Logging out...')
    await logoutFromSynology(baseUrl, session, requestOptions)
  }
}

export async function downloadEntriesFromSynology(
  settings: AppSettings,
  notebookKey?: string,
  onProgress?: SyncProgressCallback,
): Promise<DiaryEntry[]> {
  return downloadNotebookEntriesFromSynology(settings, notebookKey ? [notebookKey] : undefined, onProgress ? { onProgress } : undefined)
}

export async function pullEntryFromSynology(
  settings: AppSettings,
  entry: DiaryEntry,
  onProgress?: SyncProgressCallback,
): Promise<DiaryEntry | null> {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  const baseUrl = getSynologyApiBaseUrl(settings)
  const requestOptions = { requestTimeoutMs: PULL_REQUEST_TIMEOUT_MS }
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword, requestOptions)

  try {
    const catalog = await downloadDiaryCatalog(baseUrl, session, settings.markdownFolder, requestOptions)
    const filePath = `${getEntryMarkdownFolder(settings.markdownFolder, entry)}/${getEntryNasMarkdownFileName(entry)}`
    onProgress?.(0, 1, entry.diaryDate)
    const text = await downloadTextFile(baseUrl, session, filePath, requestOptions)
    const result = deserializeDiaryEntryMarkdown(text, getEntryNasMarkdownFileName(entry), catalog)
    onProgress?.(1, 1, result?.diaryDate ?? entry.diaryDate)
    return result
  } finally {
    await logoutFromSynology(baseUrl, session, requestOptions)
  }
}

export async function downloadNotebookEntriesFromSynology(
  settings: AppSettings,
  notebookKeys?: string[],
  options?: DiaryPullOptions,
): Promise<DiaryEntry[]> {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  const pullModes = getSynologyPullModes(settings)
  const primaryMode = pullModes[0]

  if (pullModes.length === 1)
    return downloadEntriesFromSynologyMode({ ...settings, nasMode: primaryMode }, PULL_REQUEST_TIMEOUT_MS, notebookKeys, options)

  const fallbackMode = pullModes[1]
  const primaryPull = settleSynologyPull(
    primaryMode,
    downloadEntriesFromSynologyMode({ ...settings, nasMode: primaryMode }, PULL_REQUEST_TIMEOUT_MS, notebookKeys, options),
  )
  const firstResult = await Promise.race([
    primaryPull,
    delay(PULL_FALLBACK_DELAY_MS).then(() => null),
  ])

  if (firstResult?.status === 'fulfilled')
    return firstResult.entries

  if (firstResult?.status === 'rejected') {
    if (!shouldFallbackSynologyPull(firstResult.error))
      throw firstResult.error

    const fallbackResult = await settleSynologyPull(
      fallbackMode,
      downloadEntriesFromSynologyMode({ ...settings, nasMode: fallbackMode }, PULL_REQUEST_TIMEOUT_MS, notebookKeys, options),
    )

    if (fallbackResult.status === 'fulfilled')
      return fallbackResult.entries

    throw getSynologyPullFallbackError(fallbackResult.error, firstResult.error, primaryMode, fallbackMode)
  }

  return downloadEntriesWithFallbackRace(settings, primaryPull, primaryMode, fallbackMode, notebookKeys, options)
}

async function downloadEntriesFromSynologyMode(
  settings: AppSettings,
  requestTimeoutMs: number,
  notebookKeys?: string[],
  options?: DiaryPullOptions,
): Promise<DiaryEntry[]> {
  const baseUrl = getSynologyApiBaseUrl(settings)
  const requestOptions = { requestTimeoutMs }
  const markdownFolders = notebookKeys?.length
    ? notebookKeys.map((notebookKey) => getNotebookMarkdownFolder(settings.markdownFolder, notebookKey))
    : [settings.markdownFolder]
  options?.onProgress?.(0, 0, 'Logging into NAS...')
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword, requestOptions)

  try {
    options?.onProgress?.(0, 0, 'Downloading catalog...')
    const catalog = await downloadDiaryCatalog(baseUrl, session, settings.markdownFolder, requestOptions)
    options?.onProgress?.(0, 0, 'Listing markdown files...')
    const markdownFiles = (await Promise.all(
      markdownFolders.map((markdownFolder) => listMarkdownFiles(baseUrl, session, markdownFolder, 0, requestOptions)),
    )).flat()
    const entries: DiaryEntry[] = []

    options?.onProgress?.(0, markdownFiles.length, 'Downloading entries...')
    for (const [index, file] of markdownFiles.entries()) {
      const entry = deserializeDiaryEntryMarkdown(await downloadMarkdownFile(baseUrl, session, file.path, requestOptions), file.name, catalog)

      if (entry) {
        entries.push(entry)
        options?.onEntry?.(entry)
      }

      options?.onProgress?.(index + 1, markdownFiles.length)
    }
    options?.onProgress?.(markdownFiles.length, markdownFiles.length, 'Entry download complete.')

    return entries
  } finally {
    options?.onProgress?.(0, 0, 'Logging out...')
    await logoutFromSynology(baseUrl, session, requestOptions)
  }
}

async function downloadEntriesWithFallbackRace(
  settings: AppSettings,
  primaryPull: Promise<SynologyPullResult>,
  primaryMode: NasConnectionMode,
  fallbackMode: NasConnectionMode,
  notebookKeys?: string[],
  options?: DiaryPullOptions,
): Promise<DiaryEntry[]> {
  const fallbackPull = settleSynologyPull(
    fallbackMode,
    downloadEntriesFromSynologyMode({ ...settings, nasMode: fallbackMode }, PULL_REQUEST_TIMEOUT_MS, notebookKeys, options),
  )
  const firstResult = await Promise.race([primaryPull, fallbackPull])

  if (firstResult.status === 'fulfilled')
    return firstResult.entries

  const secondResult = await (firstResult.mode === primaryMode ? fallbackPull : primaryPull)

  if (secondResult.status === 'fulfilled')
    return secondResult.entries

  const primaryError = firstResult.mode === primaryMode ? firstResult.error : secondResult.error
  const fallbackError = firstResult.mode === fallbackMode ? firstResult.error : secondResult.error

  throw getSynologyPullFallbackError(fallbackError, primaryError, primaryMode, fallbackMode)
}

async function settleSynologyPull(
  mode: NasConnectionMode,
  pull: Promise<DiaryEntry[]>,
): Promise<SynologyPullResult> {
  try {
    return {
      status: 'fulfilled',
      mode,
      entries: await pull,
    }
  } catch (error) {
    return {
      status: 'rejected',
      mode,
      error,
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function getSynologyDisplayUrl(settings: AppSettings): string {
  return getActiveNasUrl(settings)
}

function getSynologyApiBaseUrl(settings: AppSettings): string {
  if (usesSynologyProxy())
    return new URL(getRuntimeNasProxyBasePath(settings.nasMode), window.location.href).toString()

  return getActiveNasUrl(settings)
}

function getSynologyPullModes(settings: AppSettings): NasConnectionMode[] {
  const primaryMode = settings.nasMode
  const fallbackMode: NasConnectionMode = primaryMode === 'lan' ? 'public' : 'lan'

  if (!isNasModeConfigured(settings, fallbackMode))
    return [primaryMode]

  if (getSynologyApiBaseUrl({ ...settings, nasMode: primaryMode }) === getSynologyApiBaseUrl({ ...settings, nasMode: fallbackMode }))
    return [primaryMode]

  return [primaryMode, fallbackMode]
}

function isNasModeConfigured(settings: AppSettings, mode: NasConnectionMode): boolean {
  return getNasModeUrl(settings, mode).trim().length > 0
}

function getNasModeUrl(settings: AppSettings, mode: NasConnectionMode): string {
  return mode === 'lan' ? settings.lanNasUrl : settings.publicNasUrl
}

function shouldFallbackSynologyPull(error: unknown): boolean {
  if (!(error instanceof SynologySyncError))
    return false

  if (error.code === 502 || error.code === 503 || error.code === 504)
    return true

  return error.code === undefined && (
    error.message.includes('timed out')
    || error.message.includes('Network request failed')
    || Boolean(error.originalMessage?.includes('AbortError'))
    || Boolean(error.originalMessage?.includes('Failed to fetch'))
  )
}

function getSynologyPullFallbackError(
  fallbackError: unknown,
  primaryError: unknown,
  primaryMode: NasConnectionMode,
  fallbackMode: NasConnectionMode,
): unknown {
  const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError)
  const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
  const originalMessage = `Primary ${primaryMode} pull failed before fallback: ${primaryMessage}`

  if (fallbackError instanceof SynologySyncError) {
    return new SynologySyncError(
      fallbackMessage,
      fallbackError.phase,
      fallbackError.endpoint,
      fallbackError.code,
      fallbackError.originalMessage
        ? `${originalMessage}. Fallback ${fallbackMode} error: ${fallbackMessage}. Fallback ${fallbackMode} original error: ${fallbackError.originalMessage}`
        : originalMessage,
    )
  }

  return new Error(`NAS pull failed after ${primaryMode} fallback to ${fallbackMode}. ${fallbackMessage}. ${originalMessage}`)
}

function usesSynologyProxy(): boolean {
  if (typeof window === 'undefined')
    return false

  const proxyMode = getRuntimeNasProxyMode()

  if (proxyMode === 'same-origin')
    return true

  if (proxyMode === 'direct')
    return false

  return window.location.protocol === 'app:' || ['127.0.0.1', 'localhost'].includes(window.location.hostname)
}

async function loginToSynology(
  baseUrl: string,
  username: string,
  password: string,
  options: SynologyRequestOptions = {},
): Promise<SynologySession> {
  const url = new URL('webapi/entry.cgi', baseUrl)
  const body = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: '6',
    method: 'login',
    account: username,
    passwd: password,
    session: 'FileStation',
    format: 'sid',
    enable_syno_token: 'yes',
  })
  const response = await fetchSynology(url, { method: 'POST', body }, 'login', options)
  const payload = (await parseSynologyResponse<SynologyLoginData>(response, 'login', url.toString()))

  if (!payload.success || !payload.data?.sid)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'NAS login failed.', payload.error?.message),
      'login',
      url.toString(),
      payload.error?.code,
    )

  return {
    sid: payload.data.sid,
    synoToken: payload.data.synotoken,
  }
}

async function uploadMarkdownFile(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  fileName: string,
  markdown: string,
  options: SynologyRequestOptions = {},
) {
  await uploadTextFile(baseUrl, session, folder, fileName, markdown, 'text/markdown;charset=utf-8', options)
}

async function uploadTextFile(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  fileName: string,
  content: string,
  contentType: string,
  options: SynologyRequestOptions = {},
) {
  const url = new URL('webapi/entry.cgi', baseUrl)
  url.searchParams.set('_sid', session.sid)

  if (session.synoToken)
    url.searchParams.set('SynoToken', session.synoToken)

  const body = new FormData()
  body.append('api', 'SYNO.FileStation.Upload')
  body.append('version', '2')
  body.append('method', 'upload')
  body.append('path', folder)
  body.append('create_parents', 'true')
  body.append('overwrite', 'true')
  body.append('file', new Blob([content], { type: contentType }), fileName)

  const response = await fetchSynology(url, { method: 'POST', body }, 'upload', options)
  const payload = await parseSynologyResponse(response, 'upload', url.toString())

  if (!payload.success)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'Markdown upload failed.', payload.error?.message),
      'upload',
      url.toString(),
      payload.error?.code,
    )
}

async function downloadDiaryCatalog(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  options: SynologyRequestOptions = {},
) {
  const payload = await listFolder(baseUrl, session, folder, options)
  const catalogFile = (payload.data?.files ?? []).find((file) => !file.isdir && file.name === DIARY_CATALOG_FILE_NAME)

  if (!catalogFile)
    return undefined

  return deserializeDiaryCatalog(await downloadTextFile(baseUrl, session, catalogFile.path, options)) ?? undefined
}

async function listMarkdownFiles(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  depth: number,
  options: SynologyRequestOptions = {},
): Promise<SynologyListFile[]> {
  const payload = await listFolder(baseUrl, session, folder, options)
  const markdownFiles = (payload.data?.files ?? []).filter((file) => !file.isdir && file.name.toLowerCase().endsWith('.md'))
  const childFolders = (payload.data?.files ?? []).filter((file) => file.isdir)

  if (depth >= 2)
    return markdownFiles

  const childFiles = await Promise.all(
    childFolders.map((childFolder) => listMarkdownFiles(baseUrl, session, childFolder.path, depth + 1, options)),
  )

  return [...markdownFiles, ...childFiles.flat()]
}

async function listFolder(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  options: SynologyRequestOptions = {},
): Promise<SynologyResponse<SynologyListData>> {
  const url = makeAuthedSynologyUrl(baseUrl, session)
  const body = new URLSearchParams({
    api: 'SYNO.FileStation.List',
    version: '2',
    method: 'list',
    folder_path: folder,
    additional: 'real_path',
    filetype: 'all',
    limit: '1000',
    offset: '0',
    sort_by: 'name',
    sort_direction: 'asc',
  })

  const response = await fetchSynology(url, { method: 'POST', body }, 'list', options)
  const payload = await parseSynologyResponse<SynologyListData>(response, 'list', url.toString())

  if (!payload.success && isMissingRemoteFolderCode(payload.error?.code))
    return { ...payload, data: { files: [] } }

  if (!payload.success)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'Markdown list failed.', payload.error?.message),
      'list',
      url.toString(),
      payload.error?.code,
    )

  return payload
}

function isMissingRemoteFolderCode(code: number | undefined): boolean {
  return code === 408 || code === 414
}

async function downloadMarkdownFile(
  baseUrl: string,
  session: SynologySession,
  filePath: string,
  options: SynologyRequestOptions = {},
): Promise<string> {
  return downloadTextFile(baseUrl, session, filePath, options)
}

async function downloadTextFile(
  baseUrl: string,
  session: SynologySession,
  filePath: string,
  options: SynologyRequestOptions = {},
): Promise<string> {
  const url = makeAuthedSynologyUrl(baseUrl, session)
  const body = new URLSearchParams({
    api: 'SYNO.FileStation.Download',
    version: '2',
    method: 'download',
    path: filePath,
    mode: 'open',
  })

  const response = await fetchSynology(url, { method: 'POST', body }, 'download', options)
  const text = await response.text()

  if (!response.ok)
    throw new SynologySyncError(`Markdown download failed. HTTP ${response.status}.`, 'download', url.toString(), response.status)

  try {
    const payload = JSON.parse(text) as SynologyResponse

    if (payload && payload.success === false)
      throw new SynologySyncError(
        getSynologyErrorMessage(payload.error?.code, 'Markdown download failed.', payload.error?.message),
        'download',
        url.toString(),
        payload.error?.code,
      )
  } catch (error) {
    if (error instanceof SynologySyncError)
      throw error
  }

  return text
}

async function logoutFromSynology(
  baseUrl: string,
  session: SynologySession,
  options: SynologyRequestOptions = {},
) {
  const url = makeAuthedSynologyUrl(baseUrl, session)

  const body = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: '6',
    method: 'logout',
    session: 'FileStation',
  })

  try {
    await fetchSynology(url, { method: 'POST', body }, 'logout', options)
  } catch {
    // Logout is best-effort; upload/login errors should stay visible to the user.
  }
}

function makeAuthedSynologyUrl(baseUrl: string, session: SynologySession): URL {
  const url = new URL('webapi/entry.cgi', baseUrl)
  url.searchParams.set('_sid', session.sid)

  if (session.synoToken)
    url.searchParams.set('SynoToken', session.synoToken)

  return url
}

async function fetchSynology(
  url: URL,
  init: RequestInit,
  phase: string,
  options: SynologyRequestOptions = {},
): Promise<Response> {
  const controller = new AbortController()
  const requestTimeoutMs = options.requestTimeoutMs ?? SYNC_REQUEST_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    throw new SynologySyncError(
      getFetchFailureMessage(error, requestTimeoutMs),
      phase,
      url.toString(),
      undefined,
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

async function parseSynologyResponse<T>(response: Response, phase: string, endpoint: string): Promise<SynologyResponse<T>> {
  const text = await response.text()

  if (!text.trim())
    throw new SynologySyncError(
      `NAS returned an empty response during ${phase}. HTTP ${response.status}.`,
      phase,
      endpoint,
      response.status,
      getNonJsonResponseSummary(response, text),
    )

  try {
    return JSON.parse(text) as SynologyResponse<T>
  } catch (error) {
    throw new SynologySyncError(
      `NAS returned a non-JSON response during ${phase}. HTTP ${response.status}.`,
      phase,
      endpoint,
      response.status,
      `${error instanceof Error ? error.message : String(error)}. ${getNonJsonResponseSummary(response, text)}`,
    )
  }
}

const CATALOG_BACKUP_FOLDER = '.backup'

async function backupExistingCatalogOnNas(
  baseUrl: string,
  session: SynologySession,
  settings: AppSettings,
  options: SynologyRequestOptions = {},
) {
  const catalogPath = `${settings.markdownFolder}/${DIARY_CATALOG_FILE_NAME}`
  const backupFolder = `${settings.markdownFolder}/${CATALOG_BACKUP_FOLDER}`
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `${DIARY_CATALOG_FILE_NAME}.${timestamp}.json`

  try {
    // Ensure .backup folder exists (best-effort)
    await createFolderOnNas(baseUrl, session, backupFolder, options)
  } catch {
    // Folder may already exist; proceed
  }

  try {
    // Copy existing catalog to .backup/<name>.<timestamp>.json
    await copyFileOnNas(baseUrl, session, catalogPath, `${backupFolder}/${backupName}`, options)
  } catch {
    // If catalog doesn't exist yet (first push), that's fine
  }
}

async function createFolderOnNas(
  baseUrl: string,
  session: SynologySession,
  folderPath: string,
  options: SynologyRequestOptions = {},
) {
  const url = makeAuthedSynologyUrl(baseUrl, session)
  const body = new URLSearchParams({
    api: 'SYNO.FileStation.CreateFolder',
    version: '2',
    method: 'create',
    folder_path: folderPath,
    name: '',
    force_parent: 'true',
  })
  const response = await fetchSynology(url, { method: 'POST', body }, 'create folder', options)
  await parseSynologyResponse(response, 'create folder', url.toString())
}

async function copyFileOnNas(
  baseUrl: string,
  session: SynologySession,
  srcPath: string,
  destPath: string,
  options: SynologyRequestOptions = {},
) {
  const url = makeAuthedSynologyUrl(baseUrl, session)
  const body = new URLSearchParams({
    api: 'SYNO.FileStation.CopyMove',
    version: '2',
    method: 'start',
    path: srcPath,
    dest_folder_path: destPath.substring(0, destPath.lastIndexOf('/')),
    remove_src: 'false',
    overwrite: 'true',
    accurate_progress: 'false',
  })
  const response = await fetchSynology(url, { method: 'POST', body }, 'copy file', options)
  await parseSynologyResponse(response, 'copy file', url.toString())
}

function getNonJsonResponseSummary(response: Response, text: string): string {
  const contentType = response.headers.get('content-type') || 'not provided'
  const preview = text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)

  return preview
    ? `Content-Type: ${contentType}. Response starts with: ${preview}`
    : `Content-Type: ${contentType}. Response body was empty.`
}

function getFetchFailureMessage(error: unknown, requestTimeoutMs: number): string {
  if (error instanceof DOMException && error.name === 'AbortError')
    return `Network request timed out after ${requestTimeoutMs / 1000} seconds.`

  if (error instanceof Error && error.name === 'AbortError')
    return `Network request timed out after ${requestTimeoutMs / 1000} seconds.`

  if (error instanceof TypeError)
    return 'Network request failed. This is commonly caused by CORS, TLS/certificate errors, or an unreachable NAS endpoint.'

  return error instanceof Error ? error.message : 'Network request failed.'
}

function getSynologyErrorMessage(code: number | undefined, fallback: string, detail?: string): string {
  const detailText = detail ? ` ${detail}` : ''

  switch (code) {
    case 400:
      return 'No such NAS account or incorrect password.'
    case 401:
      return 'NAS account is disabled.'
    case 402:
      return 'NAS account does not have permission.'
    case 403:
      return 'Two-step verification is required for this NAS account.'
    case 404:
      return 'Two-step verification failed.'
    default:
      return code ? `${fallback} Synology error code: ${code}.${detailText}` : `${fallback}${detailText}`
  }
}
