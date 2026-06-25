import { weatherCodeText } from '../domain/constants'
import type { City, DiaryEntry, WeatherSample } from '../domain/types'
import { formatCityDisplayName } from './city'
import { upsertEntry } from './entries'
import { normalizeTags } from './tags'

export function clampMood(value: number): number {
  if (Number.isNaN(value))
    return 5

  return Math.max(0, Math.min(10, Math.round(value)))
}

export function getDailyWeatherFields(
  samples: WeatherSample[],
): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm'> {
  const sample = samples.find((item) => typeof item.weatherCode === 'number')
  const dailyWeatherCode = sample?.dailyWeatherCode ?? sample?.weatherCode ?? null

  return {
    dailyWeatherCode,
    dailyWeatherText: dailyWeatherCode === null ? sample?.weatherText ?? 'Not fetched' : getWeatherCodeText(dailyWeatherCode),
    dailyPrecipitationMm: sample?.dailyPrecipitationMm ?? 0,
  }
}

export function getNormalizedDailyWeatherFields(
  entry: DiaryEntry,
): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm'> {
  if (entry.dailyWeatherCode !== null && entry.dailyWeatherText)
    return {
      dailyWeatherCode: entry.dailyWeatherCode,
      dailyWeatherText: entry.dailyWeatherText,
      dailyPrecipitationMm: entry.dailyPrecipitationMm,
    }

  return getDailyWeatherFields(entry.weatherSamples)
}

export function updateEntryLocations(entry: DiaryEntry, locationKey: string, nextName: string, color: string): DiaryEntry {
  let changed = false
  const locationColors = { ...entry.locationColors }
  const cities = entry.cities.map((city) => {
    if (getLocationNameKey(city) !== locationKey)
      return city

    changed = true
    locationColors[city.id] = color
    return {
      ...city,
      name: nextName,
    }
  })

  if (!changed)
    return entry

  return {
    ...entry,
    cities,
    locationColors,
    updatedAt: new Date().toISOString(),
  }
}

export function updateEntryActivity(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
  if (!entry.tags.includes(oldTag))
    return entry

  const tagColors = { ...entry.tagColors }
  delete tagColors[oldTag]
  tagColors[nextTag] = color

  return {
    ...entry,
    tags: normalizeTags(entry.tags.map((tag) => (tag === oldTag ? nextTag : tag))),
    tagColors,
    updatedAt: new Date().toISOString(),
  }
}

export function getLocationNameKey(city: City): string {
  return city.name.trim().toLowerCase() || formatCityDisplayName(city).toLowerCase()
}

export function isEntryUnsynced(entry: DiaryEntry): boolean {
  return !entry.syncedAt || entry.syncedAt < entry.updatedAt
}

export function hasCloudCopy(entry: DiaryEntry): boolean {
  return Boolean(entry.syncedAt)
}

export function upsertEntries(entries: DiaryEntry[], updatedEntries: DiaryEntry[]): DiaryEntry[] {
  return updatedEntries.reduce((current, entry) => upsertEntry(current, entry), entries)
}

function getWeatherCodeText(code: number): string {
  return weatherCodeText[code] ?? 'Unknown'
}
