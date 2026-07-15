import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR, weatherCodeText } from './constants'
import { normalizePersonTag, normalizePointOfInterestTag, sanitizeTag } from './tags'
import type { AppSettings, City, DiaryCatalog, DiaryEntry, YearCatalog } from './types'
import { getCityCatalogKey, isCity } from './metadata/locationMetadata'

export const DIARY_CATALOG_FILE_NAME = 'lfx-diary-catalog.json'
export const YEAR_CATALOG_FILE_NAME = 'lfx-diary-year-catalog.json'
export const WEATHER_CODES_FILE_NAME = 'weather-codes.json'

type CatalogLocationMapValue = { city: City; color: string; pinned?: boolean; entries: Set<string> }
type CatalogNamedTagMapValue = { name: string; color: string; pinned?: boolean; entries: Set<string> }

export function buildDiaryCatalog(entries: DiaryEntry[]): DiaryCatalog {
  const locations = new Map<string, CatalogLocationMapValue>()
  const activities = new Map<string, CatalogNamedTagMapValue>()
  const people = new Map<string, CatalogNamedTagMapValue>()
  const pointsOfInterest = new Map<string, CatalogNamedTagMapValue>()

  locations.set(getCityCatalogKey(DEFAULT_CITY), {
    city: DEFAULT_CITY,
    color: DEFAULT_LOCATION_COLOR,
    entries: new Set(),
  })

  for (const entry of entries)
    addEntryToCatalogMaps(locations, activities, people, pointsOfInterest, entry)

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
    pointsOfInterest: Object.fromEntries(
      Array.from(pointsOfInterest.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((pointOfInterest) => [pointOfInterest.name, {
          color: pointOfInterest.color,
          pinned: pointOfInterest.pinned === true,
          entries: sortReferences(pointOfInterest.entries),
        }]),
    ),
    colorNames: {
      activities: {},
      people: {},
      pointsOfInterest: {},
      locations: {},
    },
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
    pointsOfInterest: removeEntryReferences(catalog.pointsOfInterest, diaryDate),
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
  const pointsOfInterest = new Map<string, CatalogNamedTagMapValue>()

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

  for (const [name, pointOfInterest] of Object.entries(catalog.pointsOfInterest)) {
    pointsOfInterest.set(name, {
      name,
      color: pointOfInterest.color,
      pinned: pointOfInterest.pinned === true,
      entries: new Set(pointOfInterest.entries),
    })
  }

  addEntryToCatalogMaps(locations, activities, people, pointsOfInterest, entry)

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
    pointsOfInterest: Object.fromEntries(
      Array.from(pointsOfInterest.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((pointOfInterest) => [pointOfInterest.name, {
          color: pointOfInterest.color,
          pinned: pointOfInterest.pinned === true,
          entries: sortReferences(pointOfInterest.entries),
        }]),
    ),
    colorNames: catalog.colorNames ?? {
      activities: {},
      people: {},
      pointsOfInterest: {},
      locations: {},
    },
  }
}

export function applySettingsToDiaryCatalog(catalog: DiaryCatalog, settings: AppSettings): DiaryCatalog {
  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    activities: applyNamedTagSettings(catalog.activities, settings.activityTags),
    people: applyNamedTagSettings(catalog.people, settings.peopleTags),
    pointsOfInterest: applyNamedTagSettings(catalog.pointsOfInterest, settings.pointOfInterestTags),
    colorNames: {
      activities: settings.activityColorGroupNames,
      people: settings.personColorGroupNames,
      pointsOfInterest: settings.pointOfInterestColorGroupNames,
      locations: settings.locationColorGroupNames,
    },
  }
}

export function applyDiaryCatalogToSettings(settings: AppSettings, catalog: DiaryCatalog): AppSettings {
  return {
    ...settings,
    activityTags: getNamedTagSettings(catalog.activities),
    peopleTags: getNamedTagSettings(catalog.people),
    pointOfInterestTags: getNamedTagSettings(catalog.pointsOfInterest),
    activityColorGroupNames: catalog.colorNames?.activities ?? settings.activityColorGroupNames,
    personColorGroupNames: catalog.colorNames?.people ?? settings.personColorGroupNames,
    pointOfInterestColorGroupNames: catalog.colorNames?.pointsOfInterest ?? settings.pointOfInterestColorGroupNames,
    locationColorGroupNames: catalog.colorNames?.locations ?? settings.locationColorGroupNames,
  }
}


export function buildYearCatalog(entries: DiaryEntry[], year: string): YearCatalog {
  const locations = new Map<string, Set<string>>()
  const activities = new Map<string, Set<string>>()
  const people = new Map<string, Set<string>>()
  const pointsOfInterest = new Map<string, Set<string>>()

  for (const entry of entries) {
    if (!entry.diaryDate.startsWith(year))
      continue

    const ref = entry.diaryDate

    for (const city of entry.cities)
      addYearRef(locations, getCityCatalogKey(city), ref)

    for (const tag of entry.tags) {
      const normalized = sanitizeTag(tag)
      if (normalized)
        addYearRef(activities, normalized, ref)
    }

    for (const person of entry.people ?? []) {
      const normalized = normalizePersonTag(person)
      if (normalized)
        addYearRef(people, normalized, ref)
    }

    for (const poi of entry.pointsOfInterest ?? []) {
      const normalized = normalizePointOfInterestTag(poi)
      if (normalized)
        addYearRef(pointsOfInterest, normalized, ref)
    }
  }

  return {
    version: 1,
    year,
    locations: serializeYearRefMap(locations),
    activities: serializeYearRefMap(activities),
    people: serializeYearRefMap(people),
    pointsOfInterest: serializeYearRefMap(pointsOfInterest),
  }
}

export function serializeYearCatalog(catalog: YearCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}
`
}

export function deserializeYearCatalog(raw: string): YearCatalog | null {
  try {
    const catalog = JSON.parse(raw) as Partial<YearCatalog>
    if (catalog.version !== 1 || typeof catalog.year !== 'string')
      return null

    return {
      version: 1,
      year: catalog.year,
      locations: normalizeYearRefMap(catalog.locations),
      activities: normalizeYearRefMap(catalog.activities),
      people: normalizeYearRefMap(catalog.people),
      pointsOfInterest: normalizeYearRefMap(catalog.pointsOfInterest),
    }
  } catch {
    return null
  }
}

export function mergeYearCatalogIntoGlobal(
  global: DiaryCatalog,
  yearCatalog: YearCatalog,
): DiaryCatalog {
  return {
    ...global,
    updatedAt: new Date().toISOString(),
    locations: mergeYearRefsIntoGlobalSection(global.locations, yearCatalog.locations),
    activities: mergeYearRefsIntoGlobalSection(global.activities, yearCatalog.activities),
    people: mergeYearRefsIntoGlobalSection(global.people, yearCatalog.people),
    pointsOfInterest: mergeYearRefsIntoGlobalSection(global.pointsOfInterest, yearCatalog.pointsOfInterest),
  }
}

function addYearRef(map: Map<string, Set<string>>, key: string, ref: string) {
  const existing = map.get(key)
  if (existing) {
    existing.add(ref)
  } else {
    map.set(key, new Set([ref]))
  }
}

function serializeYearRefMap(map: Map<string, Set<string>>): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [key, refs] of map)
    result[key] = Array.from(refs).sort((a, b) => a.localeCompare(b))
  return result
}

function normalizeYearRefMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object')
    return {}
  const result: Record<string, string[]> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(val))
      result[key] = val.filter((v): v is string => typeof v === 'string').sort((a, b) => a.localeCompare(b))
  }
  return result
}

function mergeYearRefsIntoGlobalSection<T extends { entries: string[] }>(
  globalSection: Record<string, T>,
  yearRefs: Record<string, string[]>,
): Record<string, T> {
  const next: Record<string, T> = {}
  // Copy existing entries, filtering out any that start with this year
  for (const [key, value] of Object.entries(globalSection)) {
    const yearEntries = yearRefs[key]
    const otherYears = value.entries.filter((ref) => {
      return !yearEntries?.includes(ref)
    })
    next[key] = { ...value, entries: mergeReferences(otherYears, yearEntries ?? []) }
  }
  return next
}

export function mergeDiaryCatalogs(base: DiaryCatalog, incoming: DiaryCatalog): DiaryCatalog {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    locations: mergeLocationSections(base.locations, incoming.locations),
    activities: mergeNamedTagSections(base.activities, incoming.activities),
    people: mergeNamedTagSections(base.people, incoming.people),
    pointsOfInterest: mergeNamedTagSections(base.pointsOfInterest, incoming.pointsOfInterest),
    colorNames: {
      activities: { ...(incoming.colorNames?.activities ?? {}), ...(base.colorNames?.activities ?? {}) },
      people: { ...(incoming.colorNames?.people ?? {}), ...(base.colorNames?.people ?? {}) },
      pointsOfInterest: { ...(incoming.colorNames?.pointsOfInterest ?? {}), ...(base.colorNames?.pointsOfInterest ?? {}) },
      locations: { ...(incoming.colorNames?.locations ?? {}), ...(base.colorNames?.locations ?? {}) },
    },
  }
}

function mergeLocationSections(
  base: DiaryCatalog['locations'],
  incoming: DiaryCatalog['locations'],
): DiaryCatalog['locations'] {
  const merged: DiaryCatalog['locations'] = {}
  const allKeys = new Set([...Object.keys(base), ...Object.keys(incoming)])

  for (const key of allKeys) {
    const baseLocation = base[key]
    const incomingLocation = incoming[key]

    if (baseLocation && incomingLocation) {
      merged[key] = {
        city: baseLocation.city,
        color: resolveTagColor(baseLocation.color, incomingLocation.color),
        pinned: baseLocation.pinned === true || incomingLocation.pinned === true,
        entries: mergeReferences(baseLocation.entries, incomingLocation.entries),
      }
    } else if (baseLocation) {
      merged[key] = baseLocation
    } else if (incomingLocation) {
      merged[key] = incomingLocation
    }
  }

  return merged
}

function mergeNamedTagSections(
  base: DiaryCatalog['activities'],
  incoming: DiaryCatalog['activities'],
): DiaryCatalog['activities'] {
  const merged: DiaryCatalog['activities'] = {}
  const allKeys = new Set([...Object.keys(base), ...Object.keys(incoming)])

  for (const key of allKeys) {
    const baseTag = base[key]
    const incomingTag = incoming[key]

    if (baseTag && incomingTag) {
      merged[key] = {
        color: resolveTagColor(baseTag.color, incomingTag.color),
        pinned: baseTag.pinned === true || incomingTag.pinned === true,
        entries: mergeReferences(baseTag.entries, incomingTag.entries),
      }
    } else if (baseTag) {
      merged[key] = baseTag
    } else if (incomingTag) {
      merged[key] = incomingTag
    }
  }

  return merged
}

function resolveTagColor(baseColor: string, incomingColor: string): string {
  const baseIsGray = baseColor === DEFAULT_TAG_COLOR
  const incomingIsGray = incomingColor === DEFAULT_TAG_COLOR

  if (!incomingIsGray && baseIsGray)
    return incomingColor

  return baseColor
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
      pointsOfInterest: normalizeCatalogActivities(catalog.pointsOfInterest),
      colorNames: normalizeColorNames(catalog.colorNames),
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
  pointsOfInterest: Map<string, CatalogNamedTagMapValue>,
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

  for (const pointOfInterest of entry.pointsOfInterest ?? []) {
    const normalizedPointOfInterest = normalizePointOfInterestTag(pointOfInterest)

    if (!normalizedPointOfInterest)
      continue

    const current = pointsOfInterest.get(normalizedPointOfInterest)
    pointsOfInterest.set(normalizedPointOfInterest, {
      name: normalizedPointOfInterest,
      color: entry.pointOfInterestColors?.[normalizedPointOfInterest] ?? current?.color ?? DEFAULT_TAG_COLOR,
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

function normalizeColorNames(value: unknown): DiaryCatalog['colorNames'] {
  if (!value || typeof value !== 'object') {
    return { activities: {}, people: {}, pointsOfInterest: {}, locations: {} }
  }
  const names = value as Record<string, unknown>
  return {
    activities: normalizeColorNameMap(names.activities),
    people: normalizeColorNameMap(names.people),
    pointsOfInterest: normalizeColorNameMap(names.pointsOfInterest),
    locations: normalizeColorNameMap(names.locations),
  }
}

function normalizeColorNameMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    )
  )
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
