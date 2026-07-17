import type { AppSettings, DiaryCatalog, DiaryEntry, TagId } from './types'
import { sanitizeTag, normalizePersonTag, normalizePointOfInterestTag } from './tags'

const MIGRATION_KEY = 'lfx-diary.guid-migration.v1'
const MONTH_INDEX_KEY = 'lfx-diary.month-index.v1'
const CATALOG_KEY = 'lfx-diary.catalog.v1'
const SETTINGS_KEY = 'lfx-diary.settings.v1'

export function isGuidMigrationComplete(): boolean {
  return localStorage.getItem(MIGRATION_KEY) === 'done'
}

/** Run the full migration if not already done. Safe to call multiple times — second call is a no-op. */
export function runMigrationIfNeeded(): void {
  if (isGuidMigrationComplete())
    return

  try {
    // Load all data from localStorage
    const catalog = loadCatalog()
    const settings = loadSettingsRaw()
    const entries = loadAllEntries()

    // Check if migration is actually needed
    if (!needsTagGuidMigrationInternal(catalog, settings)) {
      localStorage.setItem(MIGRATION_KEY, 'done')
      return
    }

    // Run migration
    const result = migrateAllTagData(catalog, settings, entries)

    // Write back
    saveCatalog(result.catalog)
    saveSettings(result.settings)
    saveAllEntries(result.entries)
    localStorage.setItem(MIGRATION_KEY, 'done')

    console.log('LFX Diary: Tag GUID migration complete.')
  } catch (error) {
    console.error('LFX Diary: Tag GUID migration failed:', error)
  }
}

function loadCatalog(): DiaryCatalog | null {
  const raw = localStorage.getItem(CATALOG_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as DiaryCatalog } catch { return null }
}

function loadSettingsRaw(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return {} as AppSettings
  try { return JSON.parse(raw) as AppSettings } catch { return {} as AppSettings }
}

function loadAllEntries(): DiaryEntry[] {
  const raw = localStorage.getItem(MONTH_INDEX_KEY)
  if (!raw) return []
  let monthIndex: Record<string, { entryIds?: string[] }>
  try { monthIndex = JSON.parse(raw) as Record<string, { entryIds?: string[] }> } catch { return [] }
  if (!monthIndex || typeof monthIndex !== 'object') return []

  const entries: DiaryEntry[] = []
  for (const monthKey of Object.keys(monthIndex)) {
    const monthRaw = localStorage.getItem(`lfx-diary.month.${monthKey}.v1`)
    if (!monthRaw) continue
    try {
      const monthEntries = JSON.parse(monthRaw) as DiaryEntry[]
      if (Array.isArray(monthEntries)) entries.push(...monthEntries)
    } catch { /* skip broken months */ }
  }
  return entries
}

function saveCatalog(catalog: DiaryCatalog | null): void {
  if (catalog) localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog))
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function saveAllEntries(entries: DiaryEntry[]): void {
  // Group entries by month
  const monthGroups = new Map<string, DiaryEntry[]>()
  for (const entry of entries) {
    const monthKey = getMonthKey(entry.diaryDate)
    const group = monthGroups.get(monthKey) ?? []
    group.push(entry)
    monthGroups.set(monthKey, group)
  }

  // Save each month
  const monthIndex: Record<string, { entryIds: string[]; count: number }> = {}
  for (const [monthKey, monthEntries] of monthGroups) {
    localStorage.setItem(`lfx-diary.month.${monthKey}.v1`, JSON.stringify(monthEntries))
    monthIndex[monthKey] = {
      entryIds: monthEntries.map((e) => e.diaryDate),
      count: monthEntries.length,
    }
  }
  localStorage.setItem(MONTH_INDEX_KEY, JSON.stringify(monthIndex))
}

function getMonthKey(diaryDate: string): string {
  const parts = diaryDate.split('-')
  return `${parts[0]}-${parts[1]}`
}

function needsTagGuidMigrationInternal(
  catalog: DiaryCatalog | null,
  settings: AppSettings,
): boolean {
  if (catalog && (catalog as DiaryCatalog).version < 2)
    return true

  const sampleKey = Object.keys(settings.activityTags ?? {})[0]
  if (sampleKey && !isUuid(sampleKey))
    return true

  return false
}

/** Main migration — converts all name-based data to GUID-based */
export function migrateAllTagData(
  catalog: DiaryCatalog | null,
  settings: AppSettings,
  entries: DiaryEntry[],
): { catalog: DiaryCatalog | null; settings: AppSettings; entries: DiaryEntry[] } {
  if (isGuidMigrationComplete())
    return { catalog, settings, entries }

  // Step 1: Collect all unique tag names from all sources
  const { activityNames, personNames, poiNames } = collectAllTagNames(catalog, settings, entries)

  // Step 2: Generate GUIDs for each unique name
  const activityMap = buildGuidMap(activityNames)
  const personMap = buildGuidMap(personNames)
  const poiMap = buildGuidMap(poiNames)

  // Step 3: Migrate settings
  const nextSettings = migrateSettings(settings, activityMap, personMap, poiMap)

  // Step 4: Migrate catalog
  const nextCatalog = catalog ? migrateCatalog(catalog, activityMap, personMap, poiMap) : null

  // Step 5: Migrate entries
  const nextEntries = entries.map((entry) => migrateEntry(entry, activityMap, personMap, poiMap))

  // Step 6: Mark migration complete
  localStorage.setItem(MIGRATION_KEY, 'done')

  return { catalog: nextCatalog, settings: nextSettings, entries: nextEntries }
}

function collectAllTagNames(
  catalog: DiaryCatalog | null,
  settings: AppSettings,
  entries: DiaryEntry[],
): { activityNames: Set<string>; personNames: Set<string>; poiNames: Set<string> } {
  const activityNames = new Set<string>()
  const personNames = new Set<string>()
  const poiNames = new Set<string>()

  // From catalog (v1 name keys become names; v2 GUID keys already have name field)
  if (catalog) {
    for (const [key, tag] of Object.entries(catalog.activities)) {
      activityNames.add(normalizeActivityName((tag as { name?: string }).name ?? key))
    }
    for (const [key, tag] of Object.entries(catalog.people)) {
      personNames.add(normalizePersonName((tag as { name?: string }).name ?? key))
    }
    for (const [key, tag] of Object.entries(catalog.pointsOfInterest)) {
      poiNames.add(normalizePoiName((tag as { name?: string }).name ?? key))
    }
  }

  // From settings
  for (const key of Object.keys(settings.activityTags)) {
    activityNames.add(normalizeActivityName(key))
  }
  for (const key of Object.keys(settings.peopleTags)) {
    personNames.add(normalizePersonName(key))
  }
  for (const key of Object.keys(settings.pointOfInterestTags)) {
    poiNames.add(normalizePoiName(key))
  }

  // From entries
  for (const entry of entries) {
    for (const tag of entry.tags) {
      if (!isUuid(tag)) activityNames.add(normalizeActivityName(tag))
    }
    for (const person of entry.people ?? []) {
      if (!isUuid(person)) personNames.add(normalizePersonName(person))
    }
    for (const poi of entry.pointsOfInterest ?? []) {
      if (!isUuid(poi)) poiNames.add(normalizePoiName(poi))
    }
    // Also collect from color map keys (might have different casing)
    for (const key of Object.keys(entry.tagColors)) {
      if (!isUuid(key)) activityNames.add(normalizeActivityName(key))
    }
    for (const key of Object.keys(entry.personColors ?? {})) {
      if (!isUuid(key)) personNames.add(normalizePersonName(key))
    }
    for (const key of Object.keys(entry.pointOfInterestColors ?? {})) {
      if (!isUuid(key)) poiNames.add(normalizePoiName(key))
    }
  }

  return { activityNames, personNames, poiNames }
}

function buildGuidMap(names: Set<string>): Map<string, TagId> {
  const map = new Map<string, TagId>()
  for (const name of names) {
    map.set(name, crypto.randomUUID())
  }
  return map
}

function migrateSettings(
  settings: AppSettings,
  activityMap: Map<string, TagId>,
  personMap: Map<string, TagId>,
  poiMap: Map<string, TagId>,
): AppSettings {
  return {
    ...settings,
    activityTags: migrateSettingsTagSection(settings.activityTags, activityMap),
    peopleTags: migrateSettingsTagSection(settings.peopleTags, personMap),
    pointOfInterestTags: migrateSettingsTagSection(settings.pointOfInterestTags, poiMap),
  }
}

function migrateSettingsTagSection(
  tags: Record<string, { color: string; pinned?: boolean }>,
  guidMap: Map<string, TagId>,
): Record<TagId, { name: string; color: string; pinned?: boolean }> {
  const result: Record<TagId, { name: string; color: string; pinned?: boolean }> = {}

  for (const [key, tag] of Object.entries(tags)) {
    // If key is already a UUID, keep it
    if (isUuid(key)) {
      result[key] = { name: (tag as { name?: string }).name ?? key, color: tag.color, pinned: tag.pinned }
      continue
    }

    const guid = guidMap.get(key) ?? crypto.randomUUID()
    result[guid] = { name: key, color: tag.color, pinned: tag.pinned }
  }

  return result
}

function migrateCatalog(
  catalog: DiaryCatalog,
  activityMap: Map<string, TagId>,
  personMap: Map<string, TagId>,
  poiMap: Map<string, TagId>,
): DiaryCatalog {
  return {
    ...catalog,
    version: 2,
    updatedAt: new Date().toISOString(),
    activities: migrateCatalogTagSection(catalog.activities, activityMap, normalizeActivityName),
    people: migrateCatalogTagSection(catalog.people, personMap, normalizePersonName),
    pointsOfInterest: migrateCatalogTagSection(catalog.pointsOfInterest, poiMap, normalizePoiName),
  }
}

function migrateCatalogTagSection(
  section: Record<string, { color: string; pinned?: boolean; entries?: unknown }>,
  guidMap: Map<string, TagId>,
  normalize: (name: string) => string,
): Record<TagId, { name: string; color: string; pinned?: boolean; entries: string[] }> {
  const result: Record<TagId, { name: string; color: string; pinned?: boolean; entries: string[] }> = {}

  for (const [key, tag] of Object.entries(section)) {
    if (isUuid(key)) {
      result[key] = {
        name: (tag as { name?: string }).name ?? key,
        color: tag.color,
        pinned: tag.pinned,
        entries: normalizeReferences(tag.entries),
      }
      continue
    }

    const name = normalize(key)
    const guid = guidMap.get(name) ?? crypto.randomUUID()
    result[guid] = {
      name: key,
      color: tag.color,
      pinned: tag.pinned,
      entries: normalizeReferences(tag.entries),
    }
  }

  return result
}

function migrateEntry(
  entry: DiaryEntry,
  activityMap: Map<string, TagId>,
  personMap: Map<string, TagId>,
  poiMap: Map<string, TagId>,
): DiaryEntry {
  // Migrate activity tags
  const nextTags: TagId[] = []
  const nextTagColors: Record<TagId, string> = {}
  for (const tag of entry.tags) {
    const guid = resolveGuid(tag, activityMap, normalizeActivityName)
    if (guid) {
      nextTags.push(guid)
      const color = findColor(entry.tagColors, tag)
      if (color) nextTagColors[guid] = color
    }
  }
  // Also migrate color keys that don't appear in the tags array
  for (const [key, color] of Object.entries(entry.tagColors)) {
    const guid = resolveGuid(key, activityMap, normalizeActivityName)
    if (guid && !nextTagColors[guid]) {
      nextTagColors[guid] = color
    }
  }

  // Migrate people
  const nextPeople: TagId[] = []
  const nextPersonColors: Record<TagId, string> = {}
  for (const person of entry.people ?? []) {
    const guid = resolveGuid(person, personMap, normalizePersonName)
    if (guid) {
      nextPeople.push(guid)

      const color = findColor(entry.personColors ?? {}, person)
      if (color) nextPersonColors[guid] = color
    }
  }
  for (const [key, color] of Object.entries(entry.personColors ?? {})) {
    const guid = resolveGuid(key, personMap, normalizePersonName)
    if (guid && !nextPersonColors[guid]) {
      nextPersonColors[guid] = color
    }
  }

  // Migrate POIs
  const nextPois: TagId[] = []
  const nextPoiColors: Record<TagId, string> = {}
  for (const poi of entry.pointsOfInterest ?? []) {
    const guid = resolveGuid(poi, poiMap, normalizePoiName)
    if (guid) {
      nextPois.push(guid)
      const color = findColor(entry.pointOfInterestColors ?? {}, poi)
      if (color) nextPoiColors[guid] = color
    }
  }
  for (const [key, color] of Object.entries(entry.pointOfInterestColors ?? {})) {
    const guid = resolveGuid(key, poiMap, normalizePoiName)
    if (guid && !nextPoiColors[guid]) {
      nextPoiColors[guid] = color
    }
  }

  // Migrate content body: replace person + POI name occurrences with @[guid]
  let nextContent = entry.content
  nextContent = migrateContentReferences(nextContent, personMap)
  nextContent = migrateContentReferences(nextContent, poiMap)

  return {
    ...entry,
    tags: nextTags,
    tagColors: nextTagColors,
    people: nextPeople,
    personColors: nextPersonColors,
    pointsOfInterest: nextPois,
    pointOfInterestColors: nextPoiColors,
    content: nextContent,
  }
}

/** Replace plain-text name occurrences with @[guid] in content body */
function migrateContentReferences(
  content: string,
  guidMap: Map<string, TagId>,
): string {
  // Build a map of original name → guid, sorted by longest name first to avoid substring collisions
  const replacements = Array.from(guidMap.entries())
    .map(([name, guid]) => ({ name, guid }))
    .sort((a, b) => b.name.length - a.name.length)

  let result = content
  for (const { name, guid } of replacements) {
    if (!name || name.length < 2) continue

    // Escape special regex chars in the name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Only replace if not already inside @[guid] syntax
    const pattern = new RegExp(`(?<!@\\[)${escaped}(?!\\])`, 'g')
    result = result.replace(pattern, `@[${guid}]`)
  }

  return result
}

function resolveGuid(
  raw: string,
  guidMap: Map<string, TagId>,
  normalize: (s: string) => string,
): TagId | null {
  if (isUuid(raw)) return raw
  const normalized = normalize(raw)
  return guidMap.get(normalized) ?? null
}

function findColor(colors: Record<string, string>, name: string): string | null {
  // Try exact match first
  if (colors[name]) return colors[name]
  // Try normalized match
  const normalized = name.trim()
  if (colors[normalized]) return colors[normalized]
  // Try case-insensitive match
  const lower = normalized.toLowerCase()
  for (const [key, color] of Object.entries(colors)) {
    if (key.toLowerCase() === lower) return color
  }
  return null
}

function normalizeActivityName(name: string): string {
  return sanitizeTag(name)
}

function normalizePersonName(name: string): string {
  return normalizePersonTag(name)
}

function normalizePoiName(name: string): string {
  return normalizePointOfInterestTag(name)
}

function normalizeReferences(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
