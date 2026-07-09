import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR } from './constants'
import type { City, DiaryCatalog, DiaryEntry } from './types'
import {
  deserializeActivitiesMetadata,
  getCatalogActivityColorMap,
  normalizeActivitiesMetadata,
} from './metadata/activitiesMetadata'
import { deserializeDateMetadata, serializeDateMetadata } from './metadata/dateMetadata'
import {
  deserializeLocationMetadata,
  findCatalogCity,
  getCatalogLocationColorMap,
  isCity,
} from './metadata/locationMetadata'
import {
  deserializeMoodMetadata,
  normalizeMoodMetadata,
  serializeMoodMetadata,
} from './metadata/moodMetadata'
import {
  deserializePeopleMetadata,
  getCatalogPersonColorMap,
  normalizePeopleMetadata,
} from './metadata/peopleMetadata'
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
    serializeEntryIdMetadata(entry),
    ...serializeWeatherMetadata(entry),
    serializeMoodMetadata(entry),
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

  const entryId = deserializeEntryIdMetadata(headerLines.find((line) => line.startsWith('Entry ID:')))
  const catalogMetadata = getCatalogEntryMetadata(catalog, getCatalogReferenceCandidates(diaryDate, entryId))
  const cities = catalogMetadata.cities.length
    ? catalogMetadata.cities
    : deserializeLocationMetadata(headerLines.find((line) => line.startsWith('Location:')), catalog)

  return normalizeDeserializedEntry(
    {
      id: entryId,
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
      tags: catalogMetadata.tags ?? deserializeActivitiesMetadata(headerLines.find((line) => line.startsWith('Tags:'))),
      people: catalogMetadata.people ?? deserializePeopleMetadata(headerLines.find((line) => line.startsWith('People:'))),
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
  const people = normalizePeopleMetadata(entry.people)
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
    people,
    personColors: normalizeDeserializedColors(entry.personColors, people, DEFAULT_TAG_COLOR, getCatalogPersonColorMap(catalog)),
    content: entry.content ?? '',
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    savedAt: entry.savedAt ?? entry.updatedAt ?? now,
    syncedAt: entry.syncedAt ?? null,
    isEdited: entry.isEdited ?? false,
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

  const catalogMetadata = getCatalogEntryMetadata(catalog, getCatalogReferenceCandidates(entry.diaryDate, entry.id))
  const cities = catalogMetadata.cities.length
    ? catalogMetadata.cities
    : entry.cities.map((city) => findCatalogCity(city.name, catalog) ?? city)
  const tags = catalogMetadata.tags ?? entry.tags
  const people = catalogMetadata.people ?? entry.people
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
    ...normalizeDeserializedColors({}, tags, DEFAULT_TAG_COLOR, getCatalogActivityColorMap(catalog)),
  }
  const personColors = {
    ...entry.personColors,
    ...normalizeDeserializedColors({}, people, DEFAULT_TAG_COLOR, getCatalogPersonColorMap(catalog)),
  }

  return {
    ...entry,
    cities,
    tags,
    people,
    locationColors,
    tagColors,
    personColors,
  }
}

function serializeEntryIdMetadata(entry: DiaryEntry): string {
  return `Entry ID: ${entry.id}`
}

function deserializeEntryIdMetadata(line: string | undefined): string | undefined {
  const entryId = line?.replace(/^Entry ID:\s*/, '').trim()
  return entryId || undefined
}

function getCatalogReferenceCandidates(diaryDate: string, entryId: string | undefined): string[] {
  return Array.from(new Set([diaryDate, entryId, `nas-${diaryDate}`].filter((item): item is string => Boolean(item))))
}

function getCatalogEntryMetadata(catalog: DiaryCatalog | undefined, entryReferences: string[]): {
  cities: City[]
  tags: string[] | undefined
  people: string[] | undefined
} {
  if (!catalog || !entryReferences.length)
    return { cities: [], tags: undefined, people: undefined }

  const entryReferenceSet = new Set(entryReferences)
  const hasCatalogReference = Object.values(catalog.locations).some((location) => hasAnyEntryReference(location.entries, entryReferenceSet))
    || Object.values(catalog.activities).some((activity) => hasAnyEntryReference(activity.entries, entryReferenceSet))
    || Object.values(catalog.people).some((person) => hasAnyEntryReference(person.entries, entryReferenceSet))
  const cities = Object.values(catalog.locations)
    .filter((location) => hasAnyEntryReference(location.entries, entryReferenceSet))
    .map((location) => location.city)
  const tags = Object.entries(catalog.activities)
    .filter(([, activity]) => hasAnyEntryReference(activity.entries, entryReferenceSet))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))
  const people = Object.entries(catalog.people)
    .filter(([, person]) => hasAnyEntryReference(person.entries, entryReferenceSet))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))

  return {
    cities,
    tags: hasCatalogReference ? tags : undefined,
    people: hasCatalogReference ? people : undefined,
  }
}

function hasAnyEntryReference(entries: string[], entryReferences: Set<string>): boolean {
  return entries.some((entry) => entryReferences.has(entry))
}
