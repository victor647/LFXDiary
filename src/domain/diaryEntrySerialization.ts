import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR } from './constants'
import type { City, DiaryCatalog, DiaryEntry } from './types'
import {
  deserializeActivitiesMetadata,
  getCatalogActivityColorMap,
  normalizeActivitiesMetadata,
  serializeActivitiesMetadata,
} from './metadata/activitiesMetadata'
import { deserializeDateMetadata, serializeDateMetadata } from './metadata/dateMetadata'
import {
  deserializeLocationMetadata,
  findCatalogCity,
  getCatalogLocationColorMap,
  isCity,
  serializeLocationMetadata,
} from './metadata/locationMetadata'
import {
  deserializeMoodMetadata,
  normalizeMoodMetadata,
  serializeMoodMetadata,
} from './metadata/moodMetadata'
import {
  deserializeWeatherMetadata,
  normalizeWeatherMetadata,
  serializeWeatherMetadata,
} from './metadata/weatherMetadata'

const metadataStart = '<!-- lfx-diary'
const metadataEnd = '-->'

export function serializeDiaryEntryHeader(entry: DiaryEntry): string[] {
  return [
    serializeDateMetadata(entry),
    serializeLocationMetadata(entry),
    ...serializeWeatherMetadata(entry),
    serializeMoodMetadata(entry),
    serializeActivitiesMetadata(entry),
  ]
}

export function serializeDiaryEntryMarkdown(entry: DiaryEntry): string {
  return `${serializeDiaryEntryHeader(entry).join('\n')}\n\n${entry.content}\n`
}

export function deserializeDiaryEntryMarkdown(
  markdown: string,
  fileName: string,
  catalog?: DiaryCatalog,
): DiaryEntry | null {
  const metadataEntry = deserializeMetadataEntry(markdown)

  if (metadataEntry)
    return applyCatalogToEntry(metadataEntry, catalog)

  return deserializeLegacyDiaryEntry(markdown, fileName, catalog)
}

function deserializeMetadataEntry(markdown: string): DiaryEntry | null {
  const startIndex = markdown.indexOf(metadataStart)

  if (startIndex === -1)
    return null

  const jsonStartIndex = markdown.indexOf('\n', startIndex)
  const endIndex = markdown.indexOf(metadataEnd, jsonStartIndex)

  if (jsonStartIndex === -1 || endIndex === -1)
    return null

  try {
    const raw = JSON.parse(markdown.slice(jsonStartIndex + 1, endIndex).trim()) as { entry?: Partial<DiaryEntry> }

    if (!raw.entry?.diaryDate)
      return null

    return normalizeDeserializedEntry(raw.entry, raw.entry.diaryDate)
  } catch {
    return null
  }
}

function deserializeLegacyDiaryEntry(markdown: string, fileName: string, catalog?: DiaryCatalog): DiaryEntry | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const contentStartIndex = lines.findIndex((line) => line.trim() === '')
  const headerLines = contentStartIndex === -1 ? lines : lines.slice(0, contentStartIndex)
  const content = contentStartIndex === -1 ? '' : lines.slice(contentStartIndex + 1).join('\n').replace(/\n$/g, '')
  const diaryDate = deserializeDateMetadata(headerLines[0], fileName)

  if (!diaryDate)
    return null

  const cities = deserializeLocationMetadata(headerLines.find((line) => line.startsWith('Location:')), catalog)

  return normalizeDeserializedEntry(
    {
      diaryDate,
      cities,
      ...deserializeWeatherMetadata(
        headerLines.find((line) => line.startsWith('Weather:')),
        headerLines.find((line) => line.startsWith('Weather Code:')),
        headerLines.find((line) => line.startsWith('Precipitation:')),
        headerLines.find((line) => line.startsWith('Weather Samples:')),
        cities,
      ),
      mood: deserializeMoodMetadata(headerLines.find((line) => line.startsWith('Mood:'))),
      tags: deserializeActivitiesMetadata(headerLines.find((line) => line.startsWith('Tags:'))),
      content,
    },
    diaryDate,
    catalog,
  )
}

function normalizeDeserializedEntry(entry: Partial<DiaryEntry>, diaryDate: string, catalog?: DiaryCatalog): DiaryEntry {
  const now = new Date().toISOString()
  const cities = normalizeDeserializedCities(entry.cities)
  const tags = normalizeActivitiesMetadata(entry.tags)
  const weather = normalizeWeatherMetadata(
    entry.dailyWeatherCode,
    entry.dailyWeatherText,
    entry.dailyPrecipitationMm,
    entry.weatherSamples,
  )

  return {
    id: entry.id || `nas-${diaryDate}`,
    diaryDate,
    cities,
    locationColors: normalizeDeserializedColors(
      entry.locationColors,
      cities.map((city) => city.id),
      DEFAULT_LOCATION_COLOR,
      getCatalogLocationColorMap(catalog),
    ),
    ...weather,
    mood: normalizeMoodMetadata(entry.mood),
    tags,
    tagColors: normalizeDeserializedColors(entry.tagColors, tags, DEFAULT_TAG_COLOR, getCatalogActivityColorMap(catalog)),
    content: entry.content ?? '',
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    savedAt: entry.savedAt ?? entry.updatedAt ?? now,
    syncedAt: entry.syncedAt ?? null,
  }
}

function normalizeDeserializedCities(cities: unknown): City[] {
  if (!Array.isArray(cities))
    return [DEFAULT_CITY]

  const parsedCities = cities.filter(isCity)
  return parsedCities.length ? parsedCities : [DEFAULT_CITY]
}

function normalizeDeserializedColors(
  colors: unknown,
  keys: string[],
  fallback: string,
  catalogColors: Record<string, string> = {},
): Record<string, string> {
  const source = colors && typeof colors === 'object' ? colors as Record<string, string> : {}

  return Object.fromEntries(
    keys.map((key) => [key, typeof source[key] === 'string' ? source[key] : catalogColors[key] ?? fallback]),
  )
}

function applyCatalogToEntry(entry: DiaryEntry, catalog: DiaryCatalog | undefined): DiaryEntry {
  if (!catalog)
    return entry

  const cities = entry.cities.map((city) => findCatalogCity(city.name, catalog) ?? city)
  const locationColors = {
    ...entry.locationColors,
    ...normalizeDeserializedColors(
      {},
      cities.map((city) => city.id),
      DEFAULT_LOCATION_COLOR,
      getCatalogLocationColorMap(catalog),
    ),
  }
  const tagColors = {
    ...entry.tagColors,
    ...normalizeDeserializedColors({}, entry.tags, DEFAULT_TAG_COLOR, getCatalogActivityColorMap(catalog)),
  }

  return {
    ...entry,
    cities,
    locationColors,
    tagColors,
  }
}
