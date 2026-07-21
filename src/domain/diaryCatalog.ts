import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR, weatherCodeText } from './constants'
import { normalizePersonTag, normalizePointOfInterestTag, sanitizeTag } from './tags'
import type { AppSettings, City, DiaryCatalog, DiaryEntry, TagId, YearCatalog } from './types'
import { getCityCatalogKey, isCity } from './metadata/locationMetadata'

export const DIARY_CATALOG_FILE_NAME = 'lfx-diary-catalog.json'
export const YEAR_CATALOG_FILE_NAME = 'lfx-diary-year-catalog.json'
export const WEATHER_CODES_FILE_NAME = 'weather-codes.json'

type CatalogLocationMapValue = { city: City; color: string; pinned?: boolean; entries: Set<string> }
type CatalogNamedTagMapValue = { color: string; pinned?: boolean; entries: Set<string> }

export function buildDiaryCatalog(entries: DiaryEntry[]): DiaryCatalog {
  const locations = new Map<string, CatalogLocationMapValue>()
  const activities = new Map<TagId, CatalogNamedTagMapValue>()
  const people = new Map<TagId, CatalogNamedTagMapValue>()
  const pointsOfInterest = new Map<TagId, CatalogNamedTagMapValue>()

  locations.set(getCityCatalogKey(DEFAULT_CITY), {
    city: DEFAULT_CITY,
    color: DEFAULT_LOCATION_COLOR,
    entries: new Set(),
  })

  for (const entry of entries)
    addEntryToCatalogMaps(locations, activities, people, pointsOfInterest, entry)

  return {
    version: 2,
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
      Array.from(activities.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, tag]) => [id, {
          name: tag.name,
          color: tag.color,
          pinned: tag.pinned === true,
          entries: sortReferences(tag.entries),
        }]),
    ),
    people: Object.fromEntries(
      Array.from(people.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, tag]) => [id, {
          name: tag.name,
          color: tag.color,
          pinned: tag.pinned === true,
          entries: sortReferences(tag.entries),
        }]),
    ),
    pointsOfInterest: Object.fromEntries(
      Array.from(pointsOfInterest.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, tag]) => [id, {
          name: tag.name,
          color: tag.color,
          pinned: tag.pinned === true,
          entries: sortReferences(tag.entries),
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
  const activities = new Map<TagId, CatalogNamedTagMapValue>()
  const people = new Map<TagId, CatalogNamedTagMapValue>()
  const pointsOfInterest = new Map<TagId, CatalogNamedTagMapValue>()

  for (const [key, location] of Object.entries(catalog.locations)) {
    locations.set(key, {
      city: location.city,
      color: location.color,
      pinned: location.pinned === true,
      entries: new Set(location.entries),
    })
  }

  for (const [id, activity] of Object.entries(catalog.activities)) {
    activities.set(id, {
      name: activity.name,
      color: activity.color,
      pinned: activity.pinned === true,
      entries: new Set(activity.entries),
    })
  }

  for (const [id, person] of Object.entries(catalog.people)) {
    people.set(id, {
      name: person.name,
      color: person.color,
      pinned: person.pinned === true,
      entries: new Set(person.entries),
    })
  }

  for (const [id, pointOfInterest] of Object.entries(catalog.pointsOfInterest)) {
    pointsOfInterest.set(id, {
      name: pointOfInterest.name,
      color: pointOfInterest.color,
      pinned: pointOfInterest.pinned === true,
      entries: new Set(pointOfInterest.entries),
    })
  }

  addEntryToCatalogMaps(locations, activities, people, pointsOfInterest, entry)

  return {
    version: 2,
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
      Array.from(activities.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, tag]) => [id, {
          name: tag.name,
          color: tag.color,
          pinned: tag.pinned === true,
          entries: sortReferences(tag.entries),
        }]),
    ),
    people: Object.fromEntries(
      Array.from(people.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, tag]) => [id, {
          name: tag.name,
          color: tag.color,
          pinned: tag.pinned === true,
          entries: sortReferences(tag.entries),
        }]),
    ),
    pointsOfInterest: Object.fromEntries(
      Array.from(pointsOfInterest.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, tag]) => [id, {
          name: tag.name,
          color: tag.color,
          pinned: tag.pinned === true,
          entries: sortReferences(tag.entries),
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

export const UNWANTED_TAG_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const COORD_TAG_PATTERN = /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/

function isUnwantedKey(key: string): boolean {
  return UNWANTED_TAG_PATTERN.test(key) || COORD_TAG_PATTERN.test(key)
}

/** Remove tag entries whose keys are UUIDs or coordinate strings */
export function cleanUnwantedTags(catalog: DiaryCatalog): DiaryCatalog {
  const filterSection = <T>(section: Record<string, T>): Record<string, T> => {
    const next: Record<string, T> = {}
    for (const [key, value] of Object.entries(section)) {
      if (!isUnwantedKey(key))
        next[key] = value
    }
    return next
  }

  const nextActivities = filterSection(catalog.activities)
  const nextPeople = filterSection(catalog.people)
  const nextPointsOfInterest = filterSection(catalog.pointsOfInterest)
  const nextLocations = filterSection(catalog.locations)

  if (nextActivities === catalog.activities && nextPeople === catalog.people &&
      nextPointsOfInterest === catalog.pointsOfInterest && nextLocations === catalog.locations)
    return catalog

  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    activities: nextActivities,
    people: nextPeople,
    pointsOfInterest: nextPointsOfInterest,
    locations: nextLocations,
  }
}

/** Remove GUID/coordinate tag references from entries and return cleaned entries plus count */
export function cleanEntriesFromUnwantedTags(entries: DiaryEntry[]): { entries: DiaryEntry[]; removedTags: number; removedPeople: number; removedPoi: number } {
  let removedTags = 0
  let removedPeople = 0
  let removedPoi = 0

  const cleaned = entries.map((entry) => {
    const cleanField = (tags: string[], colors: Record<string, string>): { tags: string[]; colors: Record<string, string>; removed: number } => {
      const keepTags: string[] = []
      const keepColors: Record<string, string> = {}
      let removed = 0
      for (const tag of tags) {
        if (isUnwantedKey(tag)) { removed++; continue }
        keepTags.push(tag)
        if (colors[tag]) keepColors[tag] = colors[tag]
      }
      return { tags: keepTags, colors: keepColors, removed }
    }

    const t = cleanField(entry.tags ?? [], entry.tagColors ?? {})
    const p = cleanField(entry.people ?? [], entry.personColors ?? {})
    const poi = cleanField(entry.pointsOfInterest ?? [], entry.pointOfInterestColors ?? {})

    removedTags += t.removed
    removedPeople += p.removed
    removedPoi += poi.removed

    if (!t.removed && !p.removed && !poi.removed) return entry

    return {
      ...entry,
      tags: t.tags,
      tagColors: t.colors,
      people: p.tags,
      personColors: p.colors,
      pointsOfInterest: poi.tags,
      pointOfInterestColors: poi.colors,
      updatedAt: new Date().toISOString(),
      isEdited: true,
    }
  })

  return { entries: cleaned, removedTags, removedPeople, removedPoi }
}

/** Remove tag entries whose keys are UUIDs (leftovers from GUID-keyed era) */
export function stripGuidTagKeys(catalog: DiaryCatalog): DiaryCatalog {
  const filterGuids = <T>(section: Record<string, T>): Record<string, T> => {
    const next: Record<string, T> = {}
    for (const [key, value] of Object.entries(section)) {
      if (!isUnwantedKey(key))
        next[key] = value
    }
    return next
  }

  const nextActivities = filterGuids(catalog.activities)
  const nextPeople = filterGuids(catalog.people)
  const nextPointsOfInterest = filterGuids(catalog.pointsOfInterest)

  if (nextActivities === catalog.activities && nextPeople === catalog.people && nextPointsOfInterest === catalog.pointsOfInterest)
    return catalog

  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    activities: nextActivities,
    people: nextPeople,
    pointsOfInterest: nextPointsOfInterest,
  }
}

/** Remove tags with zero entry references from the catalog */
export function pruneEmptyCatalogTags(catalog: DiaryCatalog): DiaryCatalog {
  const filterEmpty = <T extends { entries: string[] }>(section: Record<string, T>): Record<string, T> => {
    const next: Record<string, T> = {}
    for (const [key, tag] of Object.entries(section)) {
      if (tag.entries.length > 0 || tag.pinned)
        next[key] = tag
    }
    return next
  }

  const nextActivities = filterEmpty(catalog.activities)
  const nextPeople = filterEmpty(catalog.people)
  const nextPointsOfInterest = filterEmpty(catalog.pointsOfInterest)

  if (nextActivities === catalog.activities && nextPeople === catalog.people && nextPointsOfInterest === catalog.pointsOfInterest)
    return catalog

  return {
    ...catalog,
    updatedAt: new Date().toISOString(),
    activities: nextActivities,
    people: nextPeople,
    pointsOfInterest: nextPointsOfInterest,
  }
}

/** Ensure tag names from entries exist in the catalog sections */
export function ensureTagsInCatalog(catalog: DiaryCatalog, entries: DiaryEntry[]): DiaryCatalog {
  let next = catalog

  for (const entry of entries) {
    for (const tag of entry.tags) {
      if (tag && !next.activities[tag])
        next = { ...next, activities: { ...next.activities, [tag]: { color: entry.tagColors?.[tag] ?? DEFAULT_TAG_COLOR, entries: [] } } }
    }
    for (const person of entry.people ?? []) {
      if (person && !next.people[person])
        next = { ...next, people: { ...next.people, [person]: { color: entry.personColors?.[person] ?? DEFAULT_TAG_COLOR, entries: [] } } }
    }
    for (const poi of entry.pointsOfInterest ?? []) {
      if (poi && !next.pointsOfInterest[poi])
        next = { ...next, pointsOfInterest: { ...next.pointsOfInterest, [poi]: { color: entry.pointOfInterestColors?.[poi] ?? DEFAULT_TAG_COLOR, entries: [] } } }
    }
  }

  return next !== catalog ? { ...next, updatedAt: new Date().toISOString() } : catalog
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
    version: 2,
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

export function deserializeYearCatalog(rawStr: string): YearCatalog | null {
  try {
    const raw = JSON.parse(rawStr) as Record<string, unknown>
    const version = typeof raw.version === 'number' ? raw.version : 0
    if (version !== 1 && version !== 2 || typeof raw.year !== 'string')
      return null

    return {
      version: 2,
      year: raw.year as string,
      locations: normalizeYearRefMap(raw.locations),
      activities: normalizeYearRefMap(raw.activities),
      people: normalizeYearRefMap(raw.people),
      pointsOfInterest: normalizeYearRefMap(raw.pointsOfInterest),
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
  // If the incoming catalog is v1 (name-based keys), convert it to v2 before merging.
  // Otherwise GUID keys from v2 would never match name keys from v1, corrupting the merge.
  const normalizedIncoming = isV1Catalog(incoming) ? convertV1CatalogToV2(incoming, base) : incoming

  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    locations: mergeLocationSections(base.locations, normalizedIncoming.locations),
    activities: mergeNamedTagSections(base.activities, normalizedIncoming.activities),
    people: mergeNamedTagSections(base.people, normalizedIncoming.people),
    pointsOfInterest: mergeNamedTagSections(base.pointsOfInterest, normalizedIncoming.pointsOfInterest),
    colorNames: {
      activities: { ...(normalizedIncoming.colorNames?.activities ?? {}), ...(base.colorNames?.activities ?? {}) },
      people: { ...(normalizedIncoming.colorNames?.people ?? {}), ...(base.colorNames?.people ?? {}) },
      pointsOfInterest: { ...(normalizedIncoming.colorNames?.pointsOfInterest ?? {}), ...(base.colorNames?.pointsOfInterest ?? {}) },
      locations: { ...(normalizedIncoming.colorNames?.locations ?? {}), ...(base.colorNames?.locations ?? {}) },
    },
  }
}

/** Checks if a catalog uses v1 name-based keys (pre-GUID migration format) */
function isV1Catalog(catalog: DiaryCatalog): boolean {
  // v1 catalogs have name-based keys — check first entry in any section
  const sampleActivity = Object.keys(catalog.activities)[0]
  if (sampleActivity !== undefined && !isUuid(sampleActivity))
    return true

  const samplePerson = Object.keys(catalog.people)[0]
  if (samplePerson !== undefined && !isUuid(samplePerson))
    return true

  const samplePoi = Object.keys(catalog.pointsOfInterest)[0]
  if (samplePoi !== undefined && !isUuid(samplePoi))
    return true

  // Also check if values lack the 'name' field (v1 had only color/pinned/entries)
  for (const tag of Object.values(catalog.activities)) {
    if (!('name' in tag)) return true
  }
  for (const tag of Object.values(catalog.people)) {
    if (!('name' in tag)) return true
  }
  for (const tag of Object.values(catalog.pointsOfInterest)) {
    if (!('name' in tag)) return true
  }

  return false
}

/** Convert a v1 name-based catalog to v2 GUID-based format, using the base v2 catalog for name→GUID resolution */
function convertV1CatalogToV2(incoming: DiaryCatalog, base: DiaryCatalog): DiaryCatalog {
  // Build name→GUID maps from the base (v2) catalog
  const activityNameToGuid = buildNameToGuidMap(base.activities)
  const personNameToGuid = buildNameToGuidMap(base.people)
  const poiNameToGuid = buildNameToGuidMap(base.pointsOfInterest)

  return {
    version: 2,
    updatedAt: incoming.updatedAt,
    locations: incoming.locations,
    activities: convertV1SectionToV2(incoming.activities, activityNameToGuid),
    people: convertV1SectionToV2(incoming.people, personNameToGuid),
    pointsOfInterest: convertV1SectionToV2(incoming.pointsOfInterest, poiNameToGuid),
    colorNames: incoming.colorNames ?? {
      activities: {},
      people: {},
      pointsOfInterest: {},
      locations: {},
    },
  }
}

function buildNameToGuidMap(section: DiaryCatalog['activities']): Map<string, TagId> {
  const map = new Map<string, TagId>()
  for (const [guid, tag] of Object.entries(section)) {
    const normalizedName = tag.name.trim().toLowerCase()
    if (normalizedName) map.set(normalizedName, guid)
  }
  return map
}

function convertV1SectionToV2(
  section: Record<string, unknown>,
  nameToGuid: Map<string, TagId>,
): DiaryCatalog['activities'] {
  const result: DiaryCatalog['activities'] = {}

  for (const [key, rawTag] of Object.entries(section)) {
    const tag = rawTag as { color?: string; pinned?: boolean; entries?: unknown; name?: string }
    const tagName = tag.name ?? key
    const normalizedName = tagName.trim().toLowerCase()

    // Try to find an existing GUID from the base catalog
    let guid: TagId | null = nameToGuid.get(normalizedName) ?? null

    // If the key is already a UUID, use it
    if (!guid && isUuid(key)) {
      guid = key
    }

    // If no matching GUID found, generate a new one
    if (!guid) {
      guid = crypto.randomUUID() as TagId
    }

    result[guid] = {
      name: tagName,
      color: tag.color ?? DEFAULT_TAG_COLOR,
      pinned: tag.pinned === true,
      entries: normalizeReferences(tag.entries),
    }
  }

  return result
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
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
        name: baseTag.name,
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

export function deserializeDiaryCatalog(rawStr: string): DiaryCatalog | null {
  try {
    const raw = JSON.parse(rawStr) as Record<string, unknown>
    const version = typeof raw.version === 'number' ? raw.version : 0

    if (version !== 1 && version !== 2)
      return null

    return {
      version: 2,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      locations: normalizeCatalogLocations(raw.locations),
      activities: normalizeCatalogActivities(raw.activities),
      people: normalizeCatalogActivities(raw.people),
      pointsOfInterest: normalizeCatalogActivities(raw.pointsOfInterest),
      colorNames: normalizeColorNames(raw.colorNames),
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

function normalizeCatalogActivity(activity: { name?: string; color: string; pinned?: boolean; entries?: unknown }): DiaryCatalog['activities'][string] {
  return {
    name: typeof activity.name === 'string' ? activity.name : '',
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
  const tags = new Map<TagId, DiaryCatalog['activities'][string]>()

  for (const [id, tag] of Object.entries(catalogTags)) {
    tags.set(id, {
      ...tag,
      pinned: tag.pinned === true,
    })
  }

  for (const [id, tag] of Object.entries(settingsTags)) {
    const current = tags.get(id)
    tags.set(id, {
      color: tag.color || current?.color || DEFAULT_TAG_COLOR,
      pinned: tag.pinned === true,
      entries: current?.entries ?? [],
    })
  }

  return Object.fromEntries(
    Array.from(tags.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, tag]) => [id, {
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
      .map(([id, tag]) => [id, {
        color: tag.color || DEFAULT_TAG_COLOR,
        pinned: tag.pinned === true,
      }]),
  )
}

function addEntryToCatalogMaps(
  locations: Map<string, CatalogLocationMapValue>,
  activities: Map<TagId, CatalogNamedTagMapValue>,
  people: Map<TagId, CatalogNamedTagMapValue>,
  pointsOfInterest: Map<TagId, CatalogNamedTagMapValue>,
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

  for (const tagId of entry.tags) {
    if (!tagId)
      continue

    const current = activities.get(tagId)
    activities.set(tagId, {
      name: current?.name ?? tagId,
      color: entry.tagColors[tagId] ?? current?.color ?? DEFAULT_TAG_COLOR,
      pinned: current?.pinned === true,
      entries: addReference(current?.entries, entryReference),
    })
  }

  for (const personId of entry.people ?? []) {
    if (!personId)
      continue

    const current = people.get(personId)
    people.set(personId, {
      name: current?.name ?? personId,
      color: entry.personColors?.[personId] ?? current?.color ?? DEFAULT_TAG_COLOR,
      pinned: current?.pinned === true,
      entries: addReference(current?.entries, entryReference),
    })
  }

  for (const poiId of entry.pointsOfInterest ?? []) {
    if (!poiId)
      continue

    const current = pointsOfInterest.get(poiId)
    pointsOfInterest.set(poiId, {
      name: current?.name ?? poiId,
      color: entry.pointOfInterestColors?.[poiId] ?? current?.color ?? DEFAULT_TAG_COLOR,
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

export function updateDiaryCatalogNamedTagSection(
  section: DiaryCatalog['activities'],
  oldTag: TagId,
  nextTag: TagId,
  color: string,
): DiaryCatalog['activities'] {
  const nextSection = { ...section }
  const oldEntry = nextSection[oldTag]
  const targetEntry = nextSection[nextTag]
  const isMerge = oldTag !== nextTag && targetEntry !== undefined

  if (oldEntry) {
    delete nextSection[oldTag]
  }

  const mergedEntries = isMerge
    ? mergeReferences(oldEntry?.entries ?? [], targetEntry!.entries)
    : (oldEntry?.entries ?? [])

  const mergedPinned = (oldEntry?.pinned === true) || (isMerge && targetEntry!.pinned === true)
  const resolvedName = oldEntry?.name ?? targetEntry?.name ?? nextTag

  nextSection[nextTag] = {
    name: resolvedName,
    color: isMerge ? resolveTagColor(targetEntry!.color, color) : color,
    pinned: mergedPinned,
    entries: mergedEntries,
  }

  return nextSection
}

export function moveDiaryCatalogNamedTag(
  sourceSection: DiaryCatalog['activities'],
  targetSection: DiaryCatalog['activities'],
  tag: TagId,
  color: string,
): {
  sourceSection: DiaryCatalog['activities']
  targetSection: DiaryCatalog['activities']
} {
  const sourceEntry = sourceSection[tag]
  if (!sourceEntry) {
    return { sourceSection, targetSection }
  }

  const nextSource = { ...sourceSection }
  delete nextSource[tag]

  const targetEntry = targetSection[tag]
  const mergedEntries = targetEntry
    ? mergeReferences(sourceEntry.entries, targetEntry.entries)
    : sourceEntry.entries
  const mergedPinned = sourceEntry.pinned === true || targetEntry?.pinned === true
  const resolvedColor = targetEntry
    ? resolveTagColor(targetEntry.color, color)
    : color

  const nextTarget = { ...targetSection }
  const resolvedName = sourceEntry.name ?? targetEntry?.name ?? tag
  nextTarget[tag] = {
    name: resolvedName,
    color: resolvedColor,
    pinned: mergedPinned,
    entries: mergedEntries,
  }

  return { sourceSection: nextSource, targetSection: nextTarget }
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
