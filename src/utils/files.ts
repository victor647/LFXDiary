import {
  DIARY_CATALOG_FILE_NAME,
  WEATHER_CODES_FILE_NAME,
  buildDiaryCatalog,
  deserializeDiaryCatalog,
  serializeDiaryCatalog,
  serializeWeatherCodes,
} from '../domain/diaryCatalog'
import {
  deserializeDiaryEntryMarkdown,
  serializeDiaryEntryHeader,
  serializeDiaryEntryMarkdown,
} from '../domain/diaryEntrySerialization'
import type { DiaryCatalog, DiaryEntry } from '../domain/types'
import { getNotebookKey } from './date'

export { DIARY_CATALOG_FILE_NAME, WEATHER_CODES_FILE_NAME, buildDiaryCatalog }

export function renderHeader(entry: DiaryEntry): string[] {
  return serializeDiaryEntryHeader(entry)
}

export function getEntryMarkdownFileName(entry: DiaryEntry): string {
  return `lfx-diary-${entry.diaryDate}.md`
}

export function getEntryNasMarkdownFileName(entry: DiaryEntry): string {
  return `${entry.diaryDate}.md`
}

export function getEntryMarkdownFolder(baseFolder: string, entry: DiaryEntry): string {
  return getNotebookMarkdownFolder(baseFolder, getNotebookKey(entry.diaryDate))
}

export function getNotebookMarkdownFolder(baseFolder: string, notebookKey: string): string {
  const [year, month] = notebookKey.split('-')
  const normalizedBaseFolder = normalizeRemoteFolder(baseFolder)

  return `${normalizedBaseFolder}/${year}/${month}`
}

export function renderEntryMarkdown(entry: DiaryEntry): string {
  return serializeDiaryEntryMarkdown(entry)
}

export function parseEntryMarkdown(markdown: string, fileName: string, catalog?: DiaryCatalog): DiaryEntry | null {
  return deserializeDiaryEntryMarkdown(markdown, fileName, catalog)
}

export function renderDiaryCatalog(entries: DiaryEntry[]): string {
  return serializeDiaryCatalog(entries)
}

export function renderWeatherCodes(): string {
  return serializeWeatherCodes()
}

export function parseDiaryCatalog(raw: string): DiaryCatalog | null {
  return deserializeDiaryCatalog(raw)
}

export function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function normalizeRemoteFolder(folder: string): string {
  const trimmed = folder.trim().replace(/\/+$/g, '')

  if (!trimmed)
    return ''

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
