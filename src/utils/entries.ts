import {
  DEFAULT_CITY,
  DEFAULT_LOCATION_COLOR,
  DEFAULT_TAG_COLOR,
  MAX_ACTIVITIES_PER_ENTRY,
  MAX_PEOPLE_PER_ENTRY,
  STORAGE_KEY,
  emptyMood,
} from '../domain/constants'
import { buildDiaryCatalog, deserializeDiaryCatalog } from '../domain/diaryCatalog'
import type { City, DiaryCatalog, DiaryEntry, NotebookGroup, RecentCity, RecentTag, WeatherSample } from '../domain/types'
import { getWeightedDailyPrecipitationMm } from '../domain/weatherSummary'
import { formatNotebookLabel, getNotebookKey, getNotebookYear, toDateInputValue } from './date'
import { normalizePersonTag, normalizePersonTags, normalizeTagColors, normalizeTags, sanitizeTag } from './tags'

export type DiaryMonthIndexItem = {
  key: string
  count: number
  entryIds: string[]
  updatedAt: string
}

export type DiaryMonthIndex = Record<string, DiaryMonthIndexItem>

export type InitialDiaryEntries = {
  entries: DiaryEntry[]
  monthIndex: DiaryMonthIndex
  monthKey: string | null
}

const MONTH_INDEX_KEY = 'lfx-diary.month-index.v1'
const MONTH_ENTRIES_KEY_PREFIX = 'lfx-diary.entries.month.v1:'
const DIARY_CATALOG_STORAGE_KEY = 'lfx-diary.catalog.v1'

export function makeBlankEntry(): DiaryEntry {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    diaryDate: toDateInputValue(new Date()),
    cities: [DEFAULT_CITY],
    locationColors: { [DEFAULT_CITY.id]: DEFAULT_LOCATION_COLOR },
    dailyWeatherCode: null,
    dailyWeatherText: 'Not fetched',
    dailyPrecipitationMm: 0,
    weatherSamples: [],
    mood: { ...emptyMood },
    tags: [],
    tagColors: {},
    people: [],
    personColors: {},
    content: '',
    createdAt: now,
    updatedAt: now,
    savedAt: null,
    syncedAt: null,
    isEdited: true,
  }
}

export function loadEntries(): DiaryEntry[] {
  return loadInitialDiaryEntries().entries
}

export function loadInitialDiaryEntries(): InitialDiaryEntries {
  const monthIndex = loadDiaryMonthIndex()
  const monthKey = getInitialMonthKey(monthIndex)

  return {
    entries: monthKey ? loadNotebookEntries(monthKey) : [],
    monthIndex,
    monthKey,
  }
}

export function loadDiaryMonthIndex(): DiaryMonthIndex {
  migrateLegacyEntriesToMonthStorage()

  const raw = localStorage.getItem(MONTH_INDEX_KEY)

  if (!raw)
    return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<DiaryMonthIndexItem>>

    if (!parsed || typeof parsed !== 'object')
      return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, item]) => [key, normalizeMonthIndexItem(key, item)] as const)
        .filter(([, item]) => item.count > 0),
    )
  } catch {
    return {}
  }
}

export function loadNotebookEntries(monthKey: string): DiaryEntry[] {
  const raw = localStorage.getItem(getMonthEntriesKey(monthKey))

  if (!raw)
    return []

  try {
    const entries = JSON.parse(raw) as DiaryEntry[]
    return Array.isArray(entries)
      ? entries.map(normalizeEntry).sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))
      : []
  } catch {
    return []
  }
}

export function loadAllStoredEntries(): DiaryEntry[] {
  const monthIndex = loadDiaryMonthIndex()

  return Object.keys(monthIndex)
    .flatMap((monthKey) => loadNotebookEntries(monthKey))
    .sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))
}

export function loadStoredDiaryCatalog(): DiaryCatalog {
  migrateLegacyEntriesToMonthStorage()

  const raw = localStorage.getItem(DIARY_CATALOG_STORAGE_KEY)
  const catalog = raw ? deserializeDiaryCatalog(raw) : null

  if (catalog)
    return catalog

  const rebuiltCatalog = buildDiaryCatalog(loadAllStoredEntries())
  saveStoredDiaryCatalog(rebuiltCatalog)
  return rebuiltCatalog
}

export function saveStoredDiaryCatalog(catalog: DiaryCatalog) {
  localStorage.setItem(DIARY_CATALOG_STORAGE_KEY, JSON.stringify(catalog))
}

export function saveLoadedEntries(entries: DiaryEntry[], loadedMonthKeys: Set<string>): DiaryMonthIndex {
  return saveEntriesToMonthStorage(entries, loadedMonthKeys, loadDiaryMonthIndex())
}

function saveEntriesToMonthStorage(
  entries: DiaryEntry[],
  loadedMonthKeys: Set<string>,
  monthIndex: DiaryMonthIndex,
): DiaryMonthIndex {
  const entriesByMonth = new Map<string, DiaryEntry[]>()
  const monthsToWrite = new Set(loadedMonthKeys)

  for (const entry of entries) {
    const monthKey = getNotebookKey(entry.diaryDate)
    monthsToWrite.add(monthKey)
    entriesByMonth.set(monthKey, [...(entriesByMonth.get(monthKey) ?? []), normalizeEntry(entry)])
  }

  for (const monthKey of monthsToWrite) {
    const monthEntries = (entriesByMonth.get(monthKey) ?? [])
      .sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))

    if (!monthEntries.length) {
      localStorage.removeItem(getMonthEntriesKey(monthKey))
      delete monthIndex[monthKey]
      continue
    }

    localStorage.setItem(getMonthEntriesKey(monthKey), JSON.stringify(monthEntries))
    monthIndex[monthKey] = {
      key: monthKey,
      count: monthEntries.length,
      entryIds: monthEntries.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)),
      updatedAt: new Date().toISOString(),
    }
  }

  localStorage.setItem(MONTH_INDEX_KEY, JSON.stringify(monthIndex))
  return monthIndex
}

export function groupEntriesByMonthIndex(monthIndex: DiaryMonthIndex, entries: DiaryEntry[]): NotebookGroup[] {
  const entriesByMonth = new Map<string, DiaryEntry[]>()

  for (const entry of entries) {
    const monthKey = getNotebookKey(entry.diaryDate)
    entriesByMonth.set(monthKey, [...(entriesByMonth.get(monthKey) ?? []), entry])
  }

  const years = new Map<string, Array<{ key: string; label: string; entries: DiaryEntry[]; entryCount: number; isLoaded: boolean }>>()

  for (const [monthKey, item] of Object.entries(monthIndex)) {
    const year = getNotebookYear(monthKey)
    const monthEntries = entriesByMonth.get(monthKey) ?? []

    years.set(year, [
      ...(years.get(year) ?? []),
      {
        key: monthKey,
        label: formatNotebookLabel(monthKey),
        entries: monthEntries,
        entryCount: monthEntries.length || item.count,
        isLoaded: entriesByMonth.has(monthKey),
      },
    ])
  }

  for (const [monthKey, monthEntries] of entriesByMonth) {
    if (monthIndex[monthKey])
      continue

    const year = getNotebookYear(monthKey)
    years.set(year, [
      ...(years.get(year) ?? []),
      {
        key: monthKey,
        label: formatNotebookLabel(monthKey),
        entries: monthEntries,
        entryCount: monthEntries.length,
        isLoaded: true,
      },
    ])
  }

  return Array.from(years.entries())
    .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => b.key.localeCompare(a.key)),
    }))
}

export function getMonthIndexEntryCount(monthIndex: DiaryMonthIndex, monthKey?: string | null): number {
  if (!monthKey)
    return Object.values(monthIndex).reduce((sum, item) => sum + item.count, 0)

  return monthIndex[monthKey]?.count ?? 0
}

export function getInitialMonthKey(monthIndex: DiaryMonthIndex, today = toDateInputValue(new Date())): string | null {
  const currentMonth = getNotebookKey(today)

  if (monthIndex[currentMonth]?.count)
    return currentMonth

  return Object.keys(monthIndex)
    .filter((monthKey) => monthKey < currentMonth)
    .sort((a, b) => b.localeCompare(a))[0]
    ?? Object.keys(monthIndex).sort((a, b) => b.localeCompare(a))[0]
    ?? null
}

function migrateLegacyEntriesToMonthStorage() {
  if (localStorage.getItem(MONTH_INDEX_KEY))
    return

  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw)
    return

  try {
    const entries = JSON.parse(raw) as DiaryEntry[]
    if (Array.isArray(entries))
      saveEntriesToMonthStorage(
        entries.map(normalizeEntry),
        new Set(entries.map((entry) => getNotebookKey(entry.diaryDate))),
        {},
      )
  } catch {
    // Ignore bad legacy storage; the new month index will start empty.
  }
}

function normalizeMonthIndexItem(key: string, item: Partial<DiaryMonthIndexItem> | undefined): DiaryMonthIndexItem {
  const entryIds = Array.isArray(item?.entryIds)
    ? item.entryIds.filter((entryId): entryId is string => typeof entryId === 'string')
    : []
  const count = typeof item?.count === 'number' ? item.count : entryIds.length

  return {
    key,
    count,
    entryIds,
    updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
  }
}

function getMonthEntriesKey(monthKey: string): string {
  return `${MONTH_ENTRIES_KEY_PREFIX}${monthKey}`
}

export function normalizeEntry(entry: DiaryEntry): DiaryEntry {
  const legacyEffortMigration = getLegacyEffortTagMigration(entry)
  const updatedAt = legacyEffortMigration ? new Date().toISOString() : entry.updatedAt ?? new Date().toISOString()
  const tags = normalizeTags(legacyEffortMigration?.tags ?? entry.tags).slice(0, MAX_ACTIVITIES_PER_ENTRY)
  const people = normalizePersonTags(entry.people ?? []).slice(0, MAX_PEOPLE_PER_ENTRY)
  const weatherSamples = normalizeWeatherSamples(entry.weatherSamples)
  const dailyWeatherCode =
    typeof entry.dailyWeatherCode === 'number'
      ? entry.dailyWeatherCode
      : weatherSamples.find((sample) => typeof sample.weatherCode === 'number')?.weatherCode ?? null
  const dailyWeatherText =
    entry.dailyWeatherText && entry.dailyWeatherText !== 'Not fetched'
      ? entry.dailyWeatherText
      : weatherSamples.find((sample) => sample.weatherText)?.weatherText ?? 'Not fetched'
  const dailyPrecipitationMm =
    weatherSamples.some((sample) => typeof sample.dailyPrecipitationMm === 'number')
      ? getWeightedDailyPrecipitationMm(weatherSamples)
      : typeof entry.dailyPrecipitationMm === 'number'
        ? entry.dailyPrecipitationMm
        : 0

  const syncedAt = entry.syncedAt ?? null

  return {
    ...entry,
    content: legacyEffortMigration?.content ?? entry.content,
    tags,
    people,
    dailyWeatherCode,
    dailyWeatherText,
    dailyPrecipitationMm,
    weatherSamples,
    tagColors: normalizeTagColors(entry.tagColors ?? {}, tags),
    personColors: normalizeTagColors(entry.personColors ?? {}, people, normalizePersonTag),
    locationColors: normalizeLocationColors(entry.locationColors ?? {}, entry.cities),
    updatedAt,
    savedAt: legacyEffortMigration ? updatedAt : entry.savedAt ?? updatedAt ?? null,
    syncedAt,
    isEdited: legacyEffortMigration ? true : entry.isEdited ?? (!syncedAt || syncedAt < updatedAt),
  }
}

function getLegacyEffortTagMigration(entry: DiaryEntry): { content: string, tags: string[] } | null {
  if (!isLegacyEffortTagDate(entry.diaryDate) || typeof entry.content !== 'string')
    return null

  const lines = entry.content.split(/\r?\n/)
  const effortLines = lines.filter((line) => /^\s*Effort:\s*/i.test(line))

  if (!effortLines.length)
    return null

  const rawEffort = effortLines.map((line) => line.replace(/^\s*Effort:\s*/i, '')).join(' & ')
  const effortTags = normalizeTags(parseLegacyEffortItems(rawEffort)).slice(0, MAX_ACTIVITIES_PER_ENTRY)
  const content = lines
    .filter((line) => !/^\s*Effort:\s*/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    content,
    tags: effortTags.length ? effortTags : entry.tags,
  }
}

function isLegacyEffortTagDate(diaryDate: string): boolean {
  return diaryDate >= '2025-01-01' && diaryDate < '2025-03-01'
}

function parseLegacyEffortItems(value: string): string[] {
  return value
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeWeatherSamples(samples: unknown): WeatherSample[] {
  if (!Array.isArray(samples))
    return []

  return samples
    .map((sample) => {
      if (!sample || typeof sample !== 'object')
        return null

      const weatherSample = sample as Partial<WeatherSample>

      if (!weatherSample.period)
        return null

      return {
        ...weatherSample,
        usAqi: typeof weatherSample.usAqi === 'number' ? weatherSample.usAqi : null,
        relativeHumidity: typeof weatherSample.relativeHumidity === 'number' ? weatherSample.relativeHumidity : null,
      } as WeatherSample
    })
    .filter((sample): sample is WeatherSample => Boolean(sample))
}

export function upsertEntry(entries: DiaryEntry[], entry: DiaryEntry): DiaryEntry[] {
  const index = entries.findIndex((item) => item.id === entry.id)

  if (index === -1)
    return [entry, ...entries]

  const next = [...entries]
  next[index] = entry
  return next
}

export function mergePulledEntries(entries: DiaryEntry[], pulledEntries: DiaryEntry[]): DiaryEntry[] {
  const pulledByDate = new Map(pulledEntries.map((entry) => [entry.diaryDate, normalizeEntry(entry)]))
  const mergedEntries = entries
    .filter((entry) => !pulledByDate.has(entry.diaryDate))
    .map(normalizeEntry)

  return [...pulledByDate.values(), ...mergedEntries]
}

export function groupEntriesByNotebook(entries: DiaryEntry[]): NotebookGroup[] {
  const years = new Map<string, Map<string, DiaryEntry[]>>()

  for (const entry of entries) {
    const year = getNotebookYear(entry.diaryDate)
    const month = getNotebookKey(entry.diaryDate)

    if (!years.has(year))
      years.set(year, new Map())

    const months = years.get(year)

    if (!months)
      continue

    months.set(month, [...(months.get(month) ?? []), entry])
  }

  return Array.from(years.entries())
    .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort(([monthA], [monthB]) => monthB.localeCompare(monthA))
        .map(([key, monthEntries]) => ({
          key,
          label: formatNotebookLabel(key),
          entries: monthEntries,
          entryCount: monthEntries.length,
          isLoaded: true,
        })),
    }))
}

export function getRecentCities(entries: DiaryEntry[]): RecentCity[] {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffDate = toDateInputValue(cutoff)
  const cities = new Map<string, RecentCity>()

  cities.set(DEFAULT_CITY.id, {
    city: DEFAULT_CITY,
    color: DEFAULT_LOCATION_COLOR,
  })

  for (const entry of entries) {
    if (entry.diaryDate < cutoffDate)
      continue

    for (const city of entry.cities) {
      cities.set(city.id, {
        city,
        color: entry.locationColors?.[city.id] ?? DEFAULT_LOCATION_COLOR,
      })
    }
  }

  return Array.from(cities.values()).sort((a, b) => a.city.name.localeCompare(b.city.name))
}

export function getRecentTags(entries: DiaryEntry[]): RecentTag[] {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffDate = toDateInputValue(cutoff)
  const tags = new Map<string, string>()

  for (const entry of entries) {
    if (entry.diaryDate < cutoffDate)
      continue

    for (const tag of entry.tags)
      tags.set(sanitizeTag(tag), entry.tagColors[tag] ?? DEFAULT_TAG_COLOR)
  }

  return Array.from(tags.entries())
    .map(([name, color]) => ({ name, color }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getRecentPeople(entries: DiaryEntry[]): RecentTag[] {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffDate = toDateInputValue(cutoff)
  const people = new Map<string, string>()

  for (const entry of entries) {
    if (entry.diaryDate < cutoffDate)
      continue

    for (const person of entry.people ?? [])
      people.set(normalizePersonTag(person), entry.personColors?.[person] ?? DEFAULT_TAG_COLOR)
  }

  return Array.from(people.entries())
    .map(([name, color]) => ({ name, color }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function normalizeLocationColors(locationColors: Record<string, string>, cities: City[]): Record<string, string> {
  const normalizedColors: Record<string, string> = {}

  for (const city of cities) {
    normalizedColors[city.id] =
      locationColors[city.id] ?? (city.id === DEFAULT_CITY.id ? DEFAULT_LOCATION_COLOR : DEFAULT_TAG_COLOR)
  }

  return normalizedColors
}
