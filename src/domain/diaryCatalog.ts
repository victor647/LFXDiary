import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR, weatherCodeText } from './constants'
import { normalizePersonTag, normalizeTag } from './tags'
import type { City, DiaryCatalog, DiaryEntry } from './types'
import { getCityCatalogKey, isCity } from './metadata/locationMetadata'

export const DIARY_CATALOG_FILE_NAME = 'lfx-diary-catalog.json'
export const WEATHER_CODES_FILE_NAME = 'weather-codes.json'

export function buildDiaryCatalog(entries: DiaryEntry[]): DiaryCatalog {
  const locations = new Map<string, { city: City; color: string }>()
  const activities = new Map<string, { name: string; color: string }>()
  const people = new Map<string, { name: string; color: string }>()

  locations.set(getCityCatalogKey(DEFAULT_CITY), {
    city: DEFAULT_CITY,
    color: DEFAULT_LOCATION_COLOR,
  })

  for (const entry of entries) {
    for (const city of entry.cities) {
      locations.set(getCityCatalogKey(city), {
        city,
        color: entry.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR,
      })
    }

    for (const tag of entry.tags) {
      const normalizedTag = normalizeTag(tag)

      if (!normalizedTag)
        continue

      activities.set(normalizedTag, {
        name: normalizedTag,
        color: entry.tagColors[normalizedTag] ?? DEFAULT_TAG_COLOR,
      })
    }

    for (const person of entry.people ?? []) {
      const normalizedPerson = normalizePersonTag(person)

      if (!normalizedPerson)
        continue

      people.set(normalizedPerson, {
        name: normalizedPerson,
        color: entry.personColors?.[normalizedPerson] ?? DEFAULT_TAG_COLOR,
      })
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    locations: Object.fromEntries(
      Array.from(locations.values())
        .sort((a, b) => a.city.name.localeCompare(b.city.name))
        .map((location) => [location.city.name, location]),
    ),
    activities: Object.fromEntries(
      Array.from(activities.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((activity) => [activity.name, { color: activity.color }]),
    ),
    people: Object.fromEntries(
      Array.from(people.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => [person.name, { color: person.color }]),
    ),
  }
}

export function serializeDiaryCatalog(entries: DiaryEntry[]): string {
  return `${JSON.stringify(buildDiaryCatalog(entries), null, 2)}\n`
}

export function serializeWeatherCodes(): string {
  return `${JSON.stringify(weatherCodeText, null, 2)}\n`
}

export function deserializeDiaryCatalog(raw: string): DiaryCatalog | null {
  try {
    const catalog = JSON.parse(raw) as Partial<DiaryCatalog>

    if (catalog.version !== 1)
      return null

    return {
      version: 1,
      updatedAt: typeof catalog.updatedAt === 'string' ? catalog.updatedAt : new Date().toISOString(),
      locations: normalizeCatalogLocations(catalog.locations),
      activities: normalizeCatalogActivities(catalog.activities),
      people: normalizeCatalogActivities(catalog.people),
    }
  } catch {
    return null
  }
}

function normalizeCatalogLocations(value: unknown): DiaryCatalog['locations'] {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter(isCatalogLocation)
        .map((location) => [location.city.name, location]),
    )
  }

  if (!value || typeof value !== 'object')
    return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, DiaryCatalog['locations'][string]] => isCatalogLocation(entry[1]))
      .map(([name, location]) => [name, location]),
  )
}

function normalizeCatalogActivities(value: unknown): DiaryCatalog['activities'] {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((activity): activity is { name: string; color: string } => {
          if (!activity || typeof activity !== 'object')
            return false

          const catalogActivity = activity as Partial<{ name: string; color: string }>
          return typeof catalogActivity.name === 'string' && typeof catalogActivity.color === 'string'
        })
        .map((activity) => [activity.name, { color: activity.color }]),
    )
  }

  if (!value || typeof value !== 'object')
    return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, { color: string }] => isCatalogActivity(entry[1]))
      .map(([name, activity]) => [name, activity]),
  )
}

function isCatalogLocation(value: unknown): value is DiaryCatalog['locations'][string] {
  if (!value || typeof value !== 'object')
    return false

  const location = value as Partial<DiaryCatalog['locations'][string]>
  return isCity(location.city) && typeof location.color === 'string'
}

function isCatalogActivity(value: unknown): value is DiaryCatalog['activities'][string] {
  if (!value || typeof value !== 'object')
    return false

  const activity = value as Partial<DiaryCatalog['activities'][string]>
  return typeof activity.color === 'string'
}
