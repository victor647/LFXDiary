import type { City, DiaryEntry } from '../domain/types'
import { getDailyWeatherFields, getWeightedDailyPrecipitationMm } from '../domain/weatherSummary'
export { getDailyWeatherFields, getWeightedDailyPrecipitationMm }
import { updateEntryActivity, updateEntryPerson } from '../domain/entryTags'
import { formatCityDisplayName } from './city'
import { upsertEntry } from './entries'
export { updateEntryActivity, updateEntryPerson }

export function clampMood(value: number): number {
  if (Number.isNaN(value))
    return 5

  return Math.max(0, Math.min(10, Math.round(value)))
}

export function getNormalizedDailyWeatherFields(
  entry: DiaryEntry,
): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm'> {
  if (entry.dailyWeatherCode !== null && entry.dailyWeatherText)
    return {
      dailyWeatherCode: entry.dailyWeatherCode,
      dailyWeatherText: entry.dailyWeatherText,
      dailyPrecipitationMm: entry.weatherSamples.length
        ? getWeightedDailyPrecipitationMm(entry.weatherSamples)
        : entry.dailyPrecipitationMm,
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
    isEdited: true,
  }
}

export function getLocationNameKey(city: City): string {
  return city.name.trim().toLowerCase() || formatCityDisplayName(city).toLowerCase()
}

export function isEntryUnsynced(entry: DiaryEntry): boolean {
  return entry.isEdited || !entry.syncedAt || entry.syncedAt < entry.updatedAt
}

export function hasCloudCopy(entry: DiaryEntry): boolean {
  return Boolean(entry.syncedAt)
}

export function upsertEntries(entries: DiaryEntry[], updatedEntries: DiaryEntry[]): DiaryEntry[] {
  return updatedEntries.reduce((current, entry) => upsertEntry(current, entry), entries)
}
