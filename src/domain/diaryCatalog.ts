import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR, weatherCodeText } from './constants'
import { normalizePersonTag, sanitizeTag } from './tags'
import type { AppSettings, City, DiaryCatalog, DiaryEntry } from './types'
import { getCityCatalogKey, isCity } from './metadata/locationMetadata'

export const DIARY_CATALOG_FILE_NAME = 'lfx-diary-catalog.json'
export const WEATHER_CODES_FILE_NAME = 'weather-codes.json'

type CatalogLocationMapValue = { city: City; color: string; pinned?: boolean; entries: Set<string> }
type CatalogNamedTagMapValue = { name: string; color: string; pinned?: boolean; entries: Set<string> }

export function buildDiaryCatalog(entries: DiaryEntry[]): DiaryCatalog {
  const locations = new Map<string, CatalogLocationMapValue>()
  const activities = new Map<string, CatalogNamedTagMapValue>()
  const people = new Map<string, CatalogNamedTagMapValue>()

  locations.set(getCityCatalogKey(DEFAULT_CITY), {
    city: DEFAULT_CITY,
    color: DEFAULT_LOCATION_COLOR,
    entries: new Set(),
  })

  for (const entry of entries)
    addEntryToCatalogMaps(locations, activities, people, entry)

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    locations: Object.fromEntries(
      Array.from(locations.entries())
        .sort((a, b) => a[1].city.name.localeCompare(b[1].city.name))
        .map(([key, location]) => [key, {
          city: location.city,
          color: location.color,
          pinned: location.pinned === true,
          entries: sortReferences(location.entries),
        }]),
    ),
    activities: Object.fromEntries(
      Array.from(activities.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((activity) => [activity.name, {
          color: activity.color,
          pinned: activity.pinned === true,
          entries: sortReferences(activity.entries),
        }]),
    ),
    people: Object.fromEntries(
      Array.from(people.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => [person.name, {
          color: person.color,
          pinned: person.pinned === true,
          entries: sortReferences(person.entries),
        }]),
    ),
  }
}

export function syncDiaryCatalogEntry(catalog: DiaryCatalog, entry: DiaryEntry): DiaryCatalog {
  return addEntryToDiaryCatalog(removeDiaryCatalogEntry(removeDiaryCatalogEntry(catalog, entry.id), entry.diaryDate), entry)
}

export function removeDiaryCatalogEntry(catalog: DiaryCatalog, diaryDate: string): DiaryCatalog {
  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    locations: removeEntryReferences(catalog.locations, diaryDate, (key) => key === getCityCatalogKey(DEFAULT_CITY)),
    activities: removeEntryReferences(catalog.activities, diaryDate),
    people: removeEntryReferences(catalog.people, diaryDate),
  }
}

export function updateDiaryCatalogLocationPin(catalog: DiaryCatalog, locationKey: string, pinned: boolean): DiaryCatalog {
  const location = catalog.locations[locationKey]

  if (!location || location.pinned === pinned)
    return catalog

  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    locations: {
      ...catalog.locations,
      [locationKey]: {
        ...location,
        pinned,
      },
    },
  }
}

export function updateDiaryCatalogLocationCity(
  catalog: DiaryCatalog,
  locationKey: string,
  nextCity: City,
  color: string,
  merge: boolean,
): DiaryCatalog {
  const sourceLocation = catalog.locations[locationKey]

  if (!sourceLocation)
    return catalog

  const nextLocationKey = getCityCatalogKey(nextCity)
  const targetLocation = catalog.locations[nextLocationKey]
  const shouldMerge = merge && nextLocationKey !== locationKey
  const locations = { ...catalog.locations }

  delete locations[locationKey]
  locations[nextLocationKey] = {
    city: shouldMerge ? targetLocation?.city ?? nextCity : nextCity,
    color,
    pinned: sourceLocation.pinned === true || (shouldMerge && targetLocation?.pinned === true),
    entries: shouldMerge
      ? mergeReferences(sourceLocation.entries, targetLocation?.entries ?? [])
      : sourceLocation.entries,
  }

  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    locations,
  }
}

function addEntryToDiaryCatalog(catalog: DiaryCatalog, entry: DiaryEntry): DiaryCatalog {
  return buildDiaryCatalogFromExisting(catalog, entry)
}

function buildDiaryCatalogFromExisting(catalog: DiaryCatalog, entry: DiaryEntry): DiaryCatalog {
  const locations = new Map<string, CatalogLocationMapValue>()
  const activities = new Map<string, CatalogNamedTagMapValue>()
  const people = new Map<string, CatalogNamedTagMapValue>()

  for (const [key, location] of Object.entries(catalog.locations)) {
    locations.set(key, {
      city: location.city,
      color: location.color,
      pinned: location.pinned === true,
      entries: new Set(location.entries),
    })
  }

  for (const [name, activity] of Object.entries(catalog.activities)) {
    activities.set(name, {
      name,
      color: activity.color,
      pinned: activity.pinned === true,
      entries: new Set(activity.entries),
    })
  }

  for (const [name, person] of Object.entries(catalog.people)) {
    people.set(name, {
      name,
      color: person.color,
      pinned: person.pinned === true,
      entries: new Set(person.entries),
    })
  }

  addEntryToCatalogMaps(locations, activities, people, entry)

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    locations: Object.fromEntries(
      Array.from(locations.entries())
        .sort((a, b) => a[1].city.name.localeCompare(b[1].city.name))
        .map(([key, location]) => [key, {
          city: location.city,
          color: location.color,
          pinned: location.pinned === true,
          entries: sortReferences(location.entries),
        }]),
    ),
    activities: Object.fromEntries(
      Array.from(activities.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((activity) => [activity.name, {
          color: activity.color,
          pinned: activity.pinned === true,
          entries: sortReferences(activity.entries),
        }]),
    ),
    people: Object.fromEntries(
      Array.from(people.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => [person.name, {
          color: person.color,
          pinned: person.pinned === true,
          entries: sortReferences(person.entries),
        }]),
    ),
  }
}

export function applySettingsToDiaryCatalog(catalog: DiaryCatalog, settings: AppSettings): DiaryCatalog {
  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    activities: applyNamedTagSettings(catalog.activities, settings.activityTags),
    people: applyNamedTagSettings(catalog.people, settings.peopleTags),
  }
}

export function applyDiaryCatalogToSettings(settings: AppSettings, catalog: DiaryCatalog): AppSettings {
  return {
    ...settings,
    activityTags: getNamedTagSettings(catalog.activities),
    peopleTags: getNamedTagSettings(catalog.people),
  }
}

export function serializeDiaryCatalog(source: DiaryEntry[] | DiaryCatalog, settings?: AppSettings): string {
  const catalog = Array.isArray(source) ? buildDiaryCatalog(source) : source
  return `${JSON.stringify(settings ? applySettingsToDiaryCatalog(catalog, settings) : catalog, null, 2)}\n`
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
        .map((location) => [getCityCatalogKey(location.city), normalizeCatalogLocation(location)]),
    )
  }

  if (!value || typeof value !== 'object')
    return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, DiaryCatalog['locations'][string]] => isCatalogLocation(entry[1]))
      .map(([name, location]) => [name, normalizeCatalogLocation(location)]),
  )
}

function normalizeCatalogActivities(value: unknown): DiaryCatalog['activities'] {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((activity): activity is { name: string; color: string; entries?: unknown } => {
          if (!activity || typeof activity !== 'object')
            return false

          const catalogActivity = activity as Partial<{ name: string; color: string }>
          return typeof catalogActivity.name === 'string' && typeof catalogActivity.color === 'string'
        })
        .map((activity) => [activity.name, normalizeCatalogActivity(activity)]),
    )
  }

  if (!value || typeof value !== 'object')
    return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, DiaryCatalog['activities'][string]] => isCatalogActivity(entry[1]))
      .map(([name, activity]) => [name, normalizeCatalogActivity(activity)]),
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

function normalizeCatalogLocation(location: DiaryCatalog['locations'][string]): DiaryCatalog['locations'][string] {
  return {
    city: location.city,
    color: location.color,
    pinned: location.pinned === true,
    entries: normalizeReferences(location.entries),
  }
}

function normalizeCatalogActivity(activity: { color: string; pinned?: boolean; entries?: unknown }): DiaryCatalog['activities'][string] {
  return {
    color: activity.color,
    pinned: activity.pinned === true,
    entries: normalizeReferences(activity.entries),
  }
}

function normalizeReferences(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
    .sort((a, b) => a.localeCompare(b))
}

function mergeReferences(first: string[], second: string[]): string[] {
  return Array.from(new Set([...first, ...second])).sort((a, b) => a.localeCompare(b))
}

function applyNamedTagSettings(
  catalogTags: DiaryCatalog['activities'],
  settingsTags: AppSettings['activityTags'],
): DiaryCatalog['activities'] {
  const tags = new Map<string, DiaryCatalog['activities'][string]>()

  for (const [name, tag] of Object.entries(catalogTags)) {
    tags.set(name, {
      ...tag,
      pinned: tag.pinned === true,
    })
  }

  for (const [name, tag] of Object.entries(settingsTags)) {
    const current = tags.get(name)
    tags.set(name, {
      color: tag.color || current?.color || DEFAULT_TAG_COLOR,
      pinned: tag.pinned === true,
      entries: current?.entries ?? [],
    })
  }

  return Object.fromEntries(
    Array.from(tags.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, tag]) => [name, {
        color: tag.color,
        pinned: tag.pinned === true,
        entries: normalizeReferences(tag.entries),
      }]),
  )
}

function getNamedTagSettings(catalogTags: DiaryCatalog['activities']): AppSettings['activityTags'] {
  return Object.fromEntries(
    Object.entries(catalogTags)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, tag]) => [name, {
        color: tag.color || DEFAULT_TAG_COLOR,
        pinned: tag.pinned === true,
      }]),
  )
}

function addEntryToCatalogMaps(
  locations: Map<string, CatalogLocationMapValue>,
  activities: Map<string, CatalogNamedTagMapValue>,
  people: Map<string, CatalogNamedTagMapValue>,
  entry: DiaryEntry,
) {
  const entryReference = getEntryCatalogReference(entry)

  for (const city of entry.cities) {
    const key = getCityCatalogKey(city)
    const current = locations.get(key)
    locations.set(key, {
      city,
      color: entry.locationColors[city.id] ?? current?.color ?? DEFAULT_LOCATION_COLOR,
      pinned: current?.pinned === true,
      entries: addReference(current?.entries, entryReference),
    })
  }

  for (const tag of entry.tags) {
    const normalizedTag = sanitizeTag(tag)

    if (!normalizedTag)
      continue

    const current = activities.get(normalizedTag)
    activities.set(normalizedTag, {
      name: normalizedTag,
      color: entry.tagColors[normalizedTag] ?? current?.color ?? DEFAULT_TAG_COLOR,
      pinned: current?.pinned === true,
      entries: addReference(current?.entries, entryReference),
    })
  }

  for (const person of entry.people ?? []) {
    const normalizedPerson = normalizePersonTag(person)

    if (!normalizedPerson)
      continue

    const current = people.get(normalizedPerson)
    people.set(normalizedPerson, {
      name: normalizedPerson,
      color: entry.personColors?.[normalizedPerson] ?? current?.color ?? DEFAULT_TAG_COLOR,
      pinned: current?.pinned === true,
      entries: addReference(current?.entries, entryReference),
    })
  }
}

function getEntryCatalogReference(entry: DiaryEntry): string {
  return entry.diaryDate
}

function addReference(references: Set<string> | undefined, entryId: string): Set<string> {
  const nextReferences = new Set(references)
  nextReferences.add(entryId)
  return nextReferences
}

function sortReferences(references: Set<string>): string[] {
  return Array.from(references).sort((a, b) => a.localeCompare(b))
}

function removeEntryReferences<TValue extends { entries: string[] }>(
  values: Record<string, TValue>,
  entryId: string,
  keepEmpty: (key: string, value: TValue) => boolean = () => false,
): Record<string, TValue> {
  const nextValues: Record<string, TValue> = {}

  for (const [key, value] of Object.entries(values)) {
    const entries = value.entries.filter((item) => item !== entryId)

    if (entries.length || keepEmpty(key, value))
      nextValues[key] = { ...value, entries }
  }

  return nextValues
}
