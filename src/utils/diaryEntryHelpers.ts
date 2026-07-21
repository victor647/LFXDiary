import type { City, DiaryEntry } from '../domain/types'
import { getDailyWeatherFields, getWeightedDailyPrecipitationMm } from '../domain/weatherSummary'
export { getDailyWeatherFields, getWeightedDailyPrecipitationMm }
import { updateEntryActivity, updateEntryPerson } from '../domain/entryTags'
import { upsertEntry } from './entries'
export { updateEntryActivity, updateEntryPerson }
export { getLocationTagKey as getLocationNameKey } from '../domain/tagModels'

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

export function updateEntryLocationCity(entry: DiaryEntry, locationKey: string, nextCity: City, color: string): DiaryEntry {
  let colorOnlyChanged = false
  let cityChanged = false
  const locationColors = { ...entry.locationColors }
  const weatherSamples = entry.weatherSamples.map((sample) => ({ ...sample }))
  const cities = entry.cities.map((city) => {
    if (getLocationNameKey(city) !== locationKey)
      return city

    if (city.id === nextCity.id) {
      colorOnlyChanged = true
      locationColors[city.id] = color
      return city
    }

    cityChanged = true
    delete locationColors[city.id]
    locationColors[nextCity.id] = color

    for (const sample of weatherSamples) {
      if (sample.cityId === city.id)
        sample.cityId = nextCity.id
    }

    return nextCity
  })

  if (!colorOnlyChanged && !cityChanged)
    return entry

  if (colorOnlyChanged && !cityChanged) {
    return {
      ...entry,
      locationColors,
    }
  }

  return {
    ...entry,
    cities,
    locationColors,
    weatherSamples,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}

export function mergeEntryLocations(entry: DiaryEntry, sourceLocationKey: string, targetName: string, color: string): DiaryEntry {
  const targetKey = targetName.trim().toLowerCase()

  if (!targetKey)
    return entry

  if (!entry.cities.some((city) => getLocationNameKey(city) === sourceLocationKey))
    return entry

  const hasTargetLocation = entry.cities.some((city) => getLocationNameKey(city) === targetKey && getLocationNameKey(city) !== sourceLocationKey)
  const locationColors = { ...entry.locationColors }
  const cities: City[] = []

  for (const city of entry.cities) {
    const cityKey = getLocationNameKey(city)

    if (cityKey === sourceLocationKey) {
      delete locationColors[city.id]

      if (!hasTargetLocation) {
        cities.push({ ...city, name: targetName })
        locationColors[city.id] = color
      }

      continue
    }

    if (cityKey === targetKey && hasTargetLocation)
      locationColors[city.id] = color

    cities.push(city)
  }

  return {
    ...entry,
    cities,
    locationColors,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}

export function mergeEntryLocationCity(entry: DiaryEntry, sourceLocationKey: string, targetCity: City, color: string): DiaryEntry {
  const targetKey = getLocationNameKey(targetCity)

  if (!entry.cities.some((city) => getLocationNameKey(city) === sourceLocationKey))
    return entry

  const targetCityInEntry = entry.cities.find((city) => getLocationNameKey(city) === targetKey && getLocationNameKey(city) !== sourceLocationKey)
  const locationColors = { ...entry.locationColors }
  const weatherSamples = entry.weatherSamples.map((sample) => ({ ...sample }))
  const cities: City[] = []
  let sameCityColorOnly = false

  for (const city of entry.cities) {
    const cityKey = getLocationNameKey(city)

    if (cityKey === sourceLocationKey) {
      if (!targetCityInEntry && targetCity.id === city.id) {
        sameCityColorOnly = true
        locationColors[city.id] = color
        cities.push(city)
        continue
      }

      delete locationColors[city.id]

      const replacementCity = targetCityInEntry ?? targetCity

      for (const sample of weatherSamples) {
        if (sample.cityId === city.id)
          sample.cityId = replacementCity.id
      }

      if (!targetCityInEntry) {
        cities.push(replacementCity)
        locationColors[replacementCity.id] = color
      }

      continue
    }

    if (cityKey === targetKey && targetCityInEntry)
      locationColors[city.id] = color

    cities.push(city)
  }

  if (sameCityColorOnly) {
    return {
      ...entry,
      locationColors,
    }
  }

  return {
    ...entry,
    cities,
    locationColors,
    weatherSamples,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
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

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length)
    return false

  return left.every((value, index) => value === right[index])
}

export function areRecordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)

  if (leftEntries.length !== rightEntries.length)
    return false

  return leftEntries.every(([key, value]) => right[key] === value)
}

export function getEditedEntryCount(entries: DiaryEntry[], draft: DiaryEntry): number {
  const editedEntryIds = new Set(entries.filter(isEntryUnsynced).map((entry) => entry.id))

  if (draft.isEdited || !entries.some((entry) => entry.id === draft.id && entry.updatedAt === draft.updatedAt))
    editedEntryIds.add(draft.id)

  return editedEntryIds.size
}

export function getUnsavedEntryIds(entries: DiaryEntry[], draft: DiaryEntry): Set<string> {
  return new Set(getEntriesWithDraft(entries, draft).filter(isEntryUnsaved).map((entry) => entry.id))
}

export function getUnuploadedEntryCount(entries: DiaryEntry[], draft: DiaryEntry): number {
  return getEntriesWithDraft(entries, draft).filter(isEntryUnsynced).length
}

export function getEntriesWithDraft(entries: DiaryEntry[], draft: DiaryEntry): DiaryEntry[] {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  entriesById.set(draft.id, draft)
  return Array.from(entriesById.values())
}

export function isEntryUnsaved(entry: DiaryEntry): boolean {
  return !entry.savedAt || entry.savedAt < entry.updatedAt
}

export function getSidebarStatusMessage(unsavedCount: number, unuploadedCount: number): string | null {
  if (!unsavedCount && !unuploadedCount)
    return null

  return `Unsaved ${unsavedCount} · Unuploaded ${unuploadedCount}`
}
