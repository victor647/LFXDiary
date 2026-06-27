import {
  DEFAULT_CITY,
  DEFAULT_LOCATION_COLOR,
  DEFAULT_TAG_COLOR,
  MAX_ACTIVITIES_PER_ENTRY,
  STORAGE_KEY,
  emptyMood,
} from '../domain/constants'
import type { City, DiaryEntry, NotebookGroup, RecentCity, RecentTag, WeatherSample } from '../domain/types'
import { formatNotebookLabel, getNotebookKey, getNotebookYear, toDateInputValue } from './date'
import { normalizeTag, normalizeTagColors, normalizeTags } from './tags'

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
    content: '',
    createdAt: now,
    updatedAt: now,
    savedAt: null,
    syncedAt: null,
  }
}

export function loadEntries(): DiaryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw)
    return []

  try {
    const entries = JSON.parse(raw) as DiaryEntry[]
    return Array.isArray(entries) ? entries.map(normalizeEntry) : []
  } catch {
    return []
  }
}

export function normalizeEntry(entry: DiaryEntry): DiaryEntry {
  const tags = normalizeTags(entry.tags).slice(0, MAX_ACTIVITIES_PER_ENTRY)
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
    typeof entry.dailyPrecipitationMm === 'number'
      ? entry.dailyPrecipitationMm
      : weatherSamples.find((sample) => typeof sample.dailyPrecipitationMm === 'number')?.dailyPrecipitationMm ?? 0

  return {
    ...entry,
    tags,
    dailyWeatherCode,
    dailyWeatherText,
    dailyPrecipitationMm,
    weatherSamples,
    tagColors: normalizeTagColors(entry.tagColors ?? {}, tags),
    locationColors: normalizeLocationColors(entry.locationColors ?? {}, entry.cities),
    savedAt: entry.savedAt ?? entry.updatedAt ?? null,
    syncedAt: entry.syncedAt ?? null,
  }
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
      tags.set(normalizeTag(tag), entry.tagColors[tag] ?? DEFAULT_TAG_COLOR)
  }

  return Array.from(tags.entries())
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
