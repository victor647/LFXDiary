import type { AppSettings, DiaryEntry } from '../domain/types'
import {
  DIARY_CATALOG_FILE_NAME,
  WEATHER_CODES_FILE_NAME,
  deserializeDiaryCatalog,
  serializeDiaryCatalog,
  serializeWeatherCodes,
} from '../domain/diaryCatalog'
import {
  deserializeDiaryEntryMarkdown,
  serializeDiaryEntryMarkdown,
} from '../domain/diaryEntrySerialization'
import {
  getEntryMarkdownFolder,
  getEntryNasMarkdownFileName,
} from './files'
import { getRuntimeNasProxyBasePath, getRuntimeNasProxyMode } from './runtimeConfig'
import { getActiveNasUrl } from './settings'

type SynologyResponse<T = unknown> = {
  success: boolean
  data?: T
  error?: { code: number }
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

export async function uploadEntriesToSynology(entries: DiaryEntry[], settings: AppSettings, catalogEntries: DiaryEntry[]) {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  if (!entries.length)
    return

  const baseUrl = getSynologyApiBaseUrl(settings)
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword)

  try {
    for (const entry of entries) {
      await uploadMarkdownFile(
        baseUrl,
        session,
        getEntryMarkdownFolder(settings.markdownFolder, entry),
        getEntryNasMarkdownFileName(entry),
        serializeDiaryEntryMarkdown(entry),
      )
    }

    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      DIARY_CATALOG_FILE_NAME,
      serializeDiaryCatalog(catalogEntries),
      'application/json;charset=utf-8',
    )
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      WEATHER_CODES_FILE_NAME,
      serializeWeatherCodes(),
      'application/json;charset=utf-8',
    )
  } finally {
    await logoutFromSynology(baseUrl, session)
  }
}

export async function deleteEntryFromSynology(entry: DiaryEntry, settings: AppSettings, catalogEntries: DiaryEntry[]) {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  const baseUrl = getSynologyApiBaseUrl(settings)
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword)

  try {
    await deleteFileFromSynology(baseUrl, session, getEntryMarkdownPath(settings.markdownFolder, entry))
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      DIARY_CATALOG_FILE_NAME,
      serializeDiaryCatalog(catalogEntries),
      'application/json;charset=utf-8',
    )
    await uploadTextFile(
      baseUrl,
      session,
      settings.markdownFolder,
      WEATHER_CODES_FILE_NAME,
      serializeWeatherCodes(),
      'application/json;charset=utf-8',
    )
  } finally {
    await logoutFromSynology(baseUrl, session)
  }
}

export async function downloadEntriesFromSynology(settings: AppSettings): Promise<DiaryEntry[]> {
  if (!settings.nasUsername.trim() || !settings.nasPassword)
    throw new Error('Enter your NAS username and password in Settings first.')

  const baseUrl = getSynologyApiBaseUrl(settings)
  const session = await loginToSynology(baseUrl, settings.nasUsername, settings.nasPassword)

  try {
    const catalog = await downloadDiaryCatalog(baseUrl, session, settings.markdownFolder)
    const markdownFiles = await listMarkdownFiles(baseUrl, session, settings.markdownFolder, 0)
    const entries = await Promise.all(
      markdownFiles.map(async (file) =>
        deserializeDiaryEntryMarkdown(await downloadMarkdownFile(baseUrl, session, file.path), file.name, catalog),
      ),
    )

    return entries.filter((entry): entry is DiaryEntry => Boolean(entry))
  } finally {
    await logoutFromSynology(baseUrl, session)
  }
}

export function getSynologyDisplayUrl(settings: AppSettings): string {
  return getActiveNasUrl(settings)
}

function getSynologyApiBaseUrl(settings: AppSettings): string {
  if (usesSynologyProxy())
    return new URL(getRuntimeNasProxyBasePath(settings.nasMode), window.location.href).toString()

  return getActiveNasUrl(settings)
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

async function loginToSynology(baseUrl: string, username: string, password: string): Promise<SynologySession> {
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
  const response = await fetchSynology(url, { method: 'POST', body }, 'login')
  const payload = (await parseSynologyResponse<SynologyLoginData>(response, 'login', url.toString()))

  if (!payload.success || !payload.data?.sid)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'NAS login failed.'),
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
) {
  await uploadTextFile(baseUrl, session, folder, fileName, markdown, 'text/markdown;charset=utf-8')
}

async function uploadTextFile(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  fileName: string,
  content: string,
  contentType: string,
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

  const response = await fetchSynology(url, { method: 'POST', body }, 'upload')
  const payload = await parseSynologyResponse(response, 'upload', url.toString())

  if (!payload.success)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'Markdown upload failed.'),
      'upload',
      url.toString(),
      payload.error?.code,
    )
}

async function downloadDiaryCatalog(
  baseUrl: string,
  session: SynologySession,
  folder: string,
) {
  const payload = await listFolder(baseUrl, session, folder)
  const catalogFile = (payload.data?.files ?? []).find((file) => !file.isdir && file.name === DIARY_CATALOG_FILE_NAME)

  if (!catalogFile)
    return undefined

  return deserializeDiaryCatalog(await downloadTextFile(baseUrl, session, catalogFile.path)) ?? undefined
}

async function listMarkdownFiles(
  baseUrl: string,
  session: SynologySession,
  folder: string,
  depth: number,
): Promise<SynologyListFile[]> {
  const payload = await listFolder(baseUrl, session, folder)
  const markdownFiles = (payload.data?.files ?? []).filter((file) => !file.isdir && file.name.toLowerCase().endsWith('.md'))
  const childFolders = (payload.data?.files ?? []).filter((file) => file.isdir)

  if (depth >= 2)
    return markdownFiles

  const childFiles = await Promise.all(
    childFolders.map((childFolder) => listMarkdownFiles(baseUrl, session, childFolder.path, depth + 1)),
  )

  return [...markdownFiles, ...childFiles.flat()]
}

async function listFolder(baseUrl: string, session: SynologySession, folder: string): Promise<SynologyResponse<SynologyListData>> {
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

  const response = await fetchSynology(url, { method: 'POST', body }, 'list')
  const payload = await parseSynologyResponse<SynologyListData>(response, 'list', url.toString())

  if (!payload.success)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'Markdown list failed.'),
      'list',
      url.toString(),
      payload.error?.code,
    )

  return payload
}

async function downloadMarkdownFile(baseUrl: string, session: SynologySession, filePath: string): Promise<string> {
  return downloadTextFile(baseUrl, session, filePath)
}

async function deleteFileFromSynology(baseUrl: string, session: SynologySession, filePath: string) {
  const url = makeAuthedSynologyUrl(baseUrl, session)
  const body = new URLSearchParams({
    api: 'SYNO.FileStation.Delete',
    version: '2',
    method: 'delete',
    path: JSON.stringify([filePath]),
  })

  const response = await fetchSynology(url, { method: 'POST', body }, 'delete')
  const payload = await parseSynologyResponse(response, 'delete', url.toString())

  if (!payload.success)
    throw new SynologySyncError(
      getSynologyErrorMessage(payload.error?.code, 'Markdown delete failed.'),
      'delete',
      url.toString(),
      payload.error?.code,
    )
}

async function downloadTextFile(baseUrl: string, session: SynologySession, filePath: string): Promise<string> {
  const url = makeAuthedSynologyUrl(baseUrl, session)
  const body = new URLSearchParams({
    api: 'SYNO.FileStation.Download',
    version: '2',
    method: 'download',
    path: filePath,
    mode: 'open',
  })

  const response = await fetchSynology(url, { method: 'POST', body }, 'download')
  const text = await response.text()

  if (!response.ok)
    throw new SynologySyncError(`Markdown download failed. HTTP ${response.status}.`, 'download', url.toString(), response.status)

  try {
    const payload = JSON.parse(text) as SynologyResponse

    if (payload && payload.success === false)
      throw new SynologySyncError(
        getSynologyErrorMessage(payload.error?.code, 'Markdown download failed.'),
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

async function logoutFromSynology(baseUrl: string, session: SynologySession) {
  const url = makeAuthedSynologyUrl(baseUrl, session)

  const body = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: '6',
    method: 'logout',
    session: 'FileStation',
  })

  try {
    await fetchSynology(url, { method: 'POST', body }, 'logout')
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

function getEntryMarkdownPath(baseFolder: string, entry: DiaryEntry): string {
  return `${getEntryMarkdownFolder(baseFolder, entry)}/${getEntryNasMarkdownFileName(entry)}`
}

async function fetchSynology(url: URL, init: RequestInit, phase: string): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    throw new SynologySyncError(
      getFetchFailureMessage(error),
      phase,
      url.toString(),
      undefined,
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function parseSynologyResponse<T>(response: Response, phase: string, endpoint: string): Promise<SynologyResponse<T>> {
  try {
    return (await response.json()) as SynologyResponse<T>
  } catch (error) {
    throw new SynologySyncError(
      `NAS returned a non-JSON response during ${phase}. HTTP ${response.status}.`,
      phase,
      endpoint,
      response.status,
      error instanceof Error ? error.message : String(error),
    )
  }
}

function getFetchFailureMessage(error: unknown): string {
  if (error instanceof TypeError)
    return 'Network request failed. This is commonly caused by CORS, TLS/certificate errors, or an unreachable NAS endpoint.'

  return error instanceof Error ? error.message : 'Network request failed.'
}

function getSynologyErrorMessage(code: number | undefined, fallback: string): string {
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
      return code ? `${fallback} Synology error code: ${code}.` : fallback
  }
}
