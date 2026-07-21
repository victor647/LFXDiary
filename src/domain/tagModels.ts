import { DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY, MAX_PEOPLE_PER_ENTRY, MAX_POINTS_OF_INTEREST_PER_ENTRY, TAG_COLOR_PALETTE } from './constants'
import { formatCityDisplayName } from './city'
import { updateEntryActivity, updateEntryPerson, updateEntryPointOfInterest } from './entryTags'
import { normalizePersonTag, normalizePointOfInterestTag, sanitizeTag } from './tags'
import type { AppSettings, City, DiaryCatalog, DiaryEntry, TagId } from './types'

export type TagColorGroup<TTag extends DiaryTag> = {
  color: string
  name: string
  tags: TTag[]
}

/** GUID → tag definition in AppSettings (color, pinned) */
type TagDefinitionsRecord = Record<TagId, { color: string; pinned?: boolean }>
/** GUID → tag record in DiaryCatalog (color, pinned, entry references) */
type CatalogTagRecord = Record<TagId, { color: string; pinned?: boolean; entries: string[] }>

export abstract class DiaryTag {
  abstract readonly kind: 'activity' | 'person' | 'location' | 'pointOfInterest'

  /** The tag key — also the display name */
  readonly key: TagId
  /** Display name (same as key) */
  get name(): string { return this.key }
  readonly color: string
  readonly count: number
  readonly pinned: boolean

  protected constructor(key: TagId, color: string, count: number, pinned = false) {
    this.key = key
    this.color = color
    this.count = count
    this.pinned = pinned
  }
}

export class ActivityTag extends DiaryTag {
  readonly kind = 'activity'

  constructor(id: TagId, color: string, count = 0, pinned = false) {
    super(id, color, count, pinned)
  }
}

export class PersonTag extends DiaryTag {
  readonly kind = 'person'

  constructor(id: TagId, color: string, count = 0, pinned = false) {
    super(id, color, count, pinned)
  }
}

export class LocationTag extends DiaryTag {
  readonly kind = 'location'
  readonly displayName: string

  constructor(key: string, displayName: string, color: string, count = 0, pinned = false) {
    super(key, color, count, pinned)
    this.displayName = displayName
  }

  get name(): string { return this.displayName }
}

export class PointOfInterestTag extends DiaryTag {
  readonly kind = 'pointOfInterest'

  constructor(id: TagId, color: string, count = 0, pinned = false) {
    super(id, color, count, pinned)
  }
}

export abstract class DiaryTagManager<TTag extends DiaryTag> {
  abstract readonly itemLabel: string
  abstract readonly itemLabelPlural: string

  abstract normalizeName(value: string): string

  groupByColor(tags: TTag[], getGroupName: (color: string) => string): TagColorGroup<TTag>[] {
    const tagsByColor = new Map<string, TTag[]>()

    for (const tag of tags) {
      const color = tag.color || DEFAULT_TAG_COLOR
      tagsByColor.set(color, [...(tagsByColor.get(color) ?? []), tag])
    }

    const customColors = Array.from(tagsByColor.keys()).filter((color) => !TAG_COLOR_PALETTE.includes(color))

    return [...TAG_COLOR_PALETTE, ...customColors].map((color) => ({
      color,
      name: getGroupName(color),
      tags: [...(tagsByColor.get(color) ?? [])].sort(compareTags),
    }))
  }
}

export abstract class CatalogDiaryTagManager<TTag extends ActivityTag | PersonTag | PointOfInterestTag> extends DiaryTagManager<TTag> {
  abstract readonly maxTags: number

  abstract createTag(id: TagId, color: string, count?: number, pinned?: boolean): TTag
  abstract getEntryTagIds(entry: DiaryEntry): TagId[]
  abstract getEntryColors(entry: DiaryEntry): Record<TagId, string>
  abstract getCatalog(settings: AppSettings): TagDefinitionsRecord
  abstract getColorNames(settings: AppSettings): Record<string, string>
  abstract getColorGroupName(settings: AppSettings, color: string): string
  abstract setCatalog(settings: AppSettings, catalog: TagDefinitionsRecord): AppSettings
  abstract setColorGroupName(settings: AppSettings, color: string, name: string): AppSettings
  abstract updateEntryTag(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry
  abstract buildDraftPatch(ids: TagId[], colors: Record<TagId, string>): Partial<DiaryEntry>

  /** Return the section of DiaryCatalog that this manager owns */
  abstract getCatalogSection(catalog: DiaryCatalog): CatalogTagRecord
  /** Return a new DiaryCatalog with the given section replaced */
  abstract setCatalogSection(catalog: DiaryCatalog, section: CatalogTagRecord): DiaryCatalog

  resolveTagName(_settings: AppSettings, id: TagId): string {
    return id
  }

  collect(entries: DiaryEntry[], settings: AppSettings): TTag[] {
    const catalog = this.getCatalog(settings)
    const tags = new Map<TagId, TTag>()

    for (const [id, tag] of Object.entries(catalog)) {
      tags.set(id, this.createTag(id, tag.color || DEFAULT_TAG_COLOR, 0, tag.pinned === true))
    }

    for (const entry of entries) {
      const entryColors = this.getEntryColors(entry)

      for (const id of this.getEntryTagIds(entry)) {
        const current = tags.get(id)
        tags.set(id, this.createTag(
          id,
          current?.color ?? entryColors[id] ?? DEFAULT_TAG_COLOR,
          (current?.count ?? 0) + 1,
          current?.pinned === true,
        ))
      }
    }

    return Array.from(tags.values()).sort(compareTags)
  }

  collectFromCatalog(catalogTags: CatalogTagRecord, settings: AppSettings): TTag[] {
    const catalog = this.getCatalog(settings)
    const tags = new Map<TagId, TTag>()

    for (const [id, tag] of Object.entries(catalogTags)) {
      tags.set(id, this.createTag(
        id,
        tag.color || DEFAULT_TAG_COLOR,
        tag.entries.length,
        tag.pinned === true,
      ))
    }

    for (const [id, tag] of Object.entries(catalog)) {
      const current = tags.get(id)
      tags.set(id, this.createTag(
        id,
        tag.color || current?.color || DEFAULT_TAG_COLOR,
        current?.count ?? 0,
        tag.pinned === true || current?.pinned === true,
      ))
    }

    return Array.from(tags.values()).sort(compareTags)
  }

  collectRecent(entries: DiaryEntry[], settings: AppSettings): TTag[] {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffDate = toDateInputValue(cutoff)
    return this.collect(entries.filter((entry) => entry.diaryDate >= cutoffDate), settings)
  }

  addToEntry(entry: DiaryEntry, tagId: TagId, color: string): Partial<DiaryEntry> | null {
    if (!tagId)
      return null

    return this.buildDraftPatch([...this.getEntryTagIds(entry), tagId], {
      ...this.getEntryColors(entry),
      [tagId]: color,
    })
  }

  removeFromEntry(entry: DiaryEntry, tagId: TagId): Partial<DiaryEntry> {
    const colors = { ...this.getEntryColors(entry) }
    delete colors[tagId]

    return this.buildDraftPatch(
      this.getEntryTagIds(entry).filter((id) => id !== tagId),
      colors,
    )
  }

  updateCatalog(catalog: TagDefinitionsRecord, oldTagId: TagId, nextTagId: TagId, color: string): TagDefinitionsRecord {
    const nextCatalog: TagDefinitionsRecord = {}
    const oldEntry = catalog[oldTagId]
    const nextEntry = catalog[nextTagId]
    const oldPinned = oldEntry?.pinned === true
    const nextPinned = nextEntry?.pinned === true

    for (const [id, tag] of Object.entries(catalog)) {
      if (id !== oldTagId)
        nextCatalog[id] = tag
    }

    if (nextTagId) {
      nextCatalog[nextTagId] = {
        color,
        pinned: oldPinned || nextPinned,
      }
    }

    return nextCatalog
  }

  updateCatalogPin(catalog: TagDefinitionsRecord, tagId: TagId, pinned: boolean): TagDefinitionsRecord {
    const nextCatalog: TagDefinitionsRecord = {}

    for (const [id, item] of Object.entries(catalog)) {
      nextCatalog[id] = id === tagId
        ? { ...item, pinned }
        : item
    }

    return nextCatalog
  }

  deleteCatalogTags(catalog: TagDefinitionsRecord, tagIds: TagId[]): TagDefinitionsRecord {
    const removeSet = new Set(tagIds.filter(Boolean))
    const nextCatalog: TagDefinitionsRecord = {}

    for (const [id, tag] of Object.entries(catalog)) {
      if (!removeSet.has(id))
        nextCatalog[id] = tag
    }

    return nextCatalog
  }

  deleteEntryTag(entry: DiaryEntry, tagId: TagId): DiaryEntry {
    const patch = this.removeFromEntry(entry, tagId)

    if (this.getEntryTagIds(entry).length === this.getEntryTagIds({ ...entry, ...patch }).length)
      return entry

    return {
      ...entry,
      ...patch,
      updatedAt: new Date().toISOString(),
      isEdited: true,
    }
  }

  groupTags(tags: TTag[], settings: AppSettings): TagColorGroup<TTag>[] {
    return this.groupByColor(tags, (color) => this.getColorGroupName(settings, color))
  }
}

export class ActivityTagManager extends CatalogDiaryTagManager<ActivityTag> {
  readonly itemLabel = 'Activity'
  readonly itemLabelPlural = 'Activities'
  readonly maxTags = MAX_ACTIVITIES_PER_ENTRY

  normalizeName(value: string): string {
    return sanitizeTag(value)
  }

  createTag(id: TagId, color: string, count = 0, pinned = false): ActivityTag {
    return new ActivityTag(id, color, count, pinned)
  }

  getEntryTagIds(entry: DiaryEntry): TagId[] {
    return entry.tags ?? []
  }

  getEntryColors(entry: DiaryEntry): Record<TagId, string> {
    return entry.tagColors ?? {}
  }

  getCatalog(settings: AppSettings): TagDefinitionsRecord {
    return settings.activityTags
  }

  getColorNames(settings: AppSettings): Record<string, string> {
    return settings.activityColorGroupNames
  }

  getColorGroupName(settings: AppSettings, color: string): string {
    return settings.activityColorGroupNames[color] || color
  }

  setCatalog(settings: AppSettings, catalog: TagDefinitionsRecord): AppSettings {
    return {
      ...settings,
      activityTags: catalog,
    }
  }

  setColorGroupName(settings: AppSettings, color: string, name: string): AppSettings {
    return {
      ...settings,
      activityColorGroupNames: {
        ...settings.activityColorGroupNames,
        [color]: name,
      },
    }
  }

  updateEntryTag(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry {
    return updateEntryActivity(entry, oldTagId, nextTagId, color)
  }

  buildDraftPatch(ids: TagId[], colors: Record<TagId, string>): Partial<DiaryEntry> {
    return {
      tags: ids,
      tagColors: colors,
    }
  }

  getCatalogSection(catalog: DiaryCatalog): CatalogTagRecord {
    return catalog.activities
  }

  setCatalogSection(catalog: DiaryCatalog, section: CatalogTagRecord): DiaryCatalog {
    return { ...catalog, activities: section as DiaryCatalog['activities'] }
  }
}

export class PersonTagManager extends CatalogDiaryTagManager<PersonTag> {
  readonly itemLabel = 'Person'
  readonly itemLabelPlural = 'People'
  readonly maxTags = MAX_PEOPLE_PER_ENTRY

  normalizeName(value: string): string {
    return normalizePersonTag(value)
  }

  createTag(id: TagId, color: string, count = 0, pinned = false): PersonTag {
    return new PersonTag(id, color, count, pinned)
  }

  getEntryTagIds(entry: DiaryEntry): TagId[] {
    return entry.people ?? []
  }

  getEntryColors(entry: DiaryEntry): Record<TagId, string> {
    return entry.personColors ?? {}
  }

  getCatalog(settings: AppSettings): TagDefinitionsRecord {
    return settings.peopleTags
  }

  getColorNames(settings: AppSettings): Record<string, string> {
    return settings.personColorGroupNames
  }

  getColorGroupName(settings: AppSettings, color: string): string {
    return settings.personColorGroupNames[color] || color
  }

  setCatalog(settings: AppSettings, catalog: TagDefinitionsRecord): AppSettings {
    return {
      ...settings,
      peopleTags: catalog,
    }
  }

  setColorGroupName(settings: AppSettings, color: string, name: string): AppSettings {
    return {
      ...settings,
      personColorGroupNames: {
        ...settings.personColorGroupNames,
        [color]: name,
      },
    }
  }

  updateEntryTag(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry {
    return updateEntryPerson(entry, oldTagId, nextTagId, color)
  }

  buildDraftPatch(ids: TagId[], colors: Record<TagId, string>): Partial<DiaryEntry> {
    return {
      people: ids,
      personColors: colors,
    }
  }

  getCatalogSection(catalog: DiaryCatalog): CatalogTagRecord {
    return catalog.people
  }

  setCatalogSection(catalog: DiaryCatalog, section: CatalogTagRecord): DiaryCatalog {
    return { ...catalog, people: section as DiaryCatalog['people'] }
  }
}

export class PointOfInterestTagManager extends CatalogDiaryTagManager<PointOfInterestTag> {
  readonly itemLabel = 'Point of Interest'
  readonly itemLabelPlural = 'Points of Interest'
  readonly maxTags = MAX_POINTS_OF_INTEREST_PER_ENTRY

  normalizeName(value: string): string {
    return normalizePointOfInterestTag(value)
  }

  createTag(id: TagId, color: string, count = 0, pinned = false): PointOfInterestTag {
    return new PointOfInterestTag(id, color, count, pinned)
  }

  getEntryTagIds(entry: DiaryEntry): TagId[] {
    return entry.pointsOfInterest ?? []
  }

  getEntryColors(entry: DiaryEntry): Record<TagId, string> {
    return entry.pointOfInterestColors ?? {}
  }

  getCatalog(settings: AppSettings): TagDefinitionsRecord {
    return settings.pointOfInterestTags
  }

  getColorNames(settings: AppSettings): Record<string, string> {
    return settings.pointOfInterestColorGroupNames
  }

  getColorGroupName(settings: AppSettings, color: string): string {
    return settings.pointOfInterestColorGroupNames[color] || color
  }

  setCatalog(settings: AppSettings, catalog: TagDefinitionsRecord): AppSettings {
    return {
      ...settings,
      pointOfInterestTags: catalog,
    }
  }

  setColorGroupName(settings: AppSettings, color: string, name: string): AppSettings {
    return {
      ...settings,
      pointOfInterestColorGroupNames: {
        ...settings.pointOfInterestColorGroupNames,
        [color]: name,
      },
    }
  }

  updateEntryTag(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry {
    return updateEntryPointOfInterest(entry, oldTagId, nextTagId, color)
  }

  buildDraftPatch(ids: TagId[], colors: Record<TagId, string>): Partial<DiaryEntry> {
    return {
      pointsOfInterest: ids,
      pointOfInterestColors: colors,
    }
  }

  getCatalogSection(catalog: DiaryCatalog): CatalogTagRecord {
    return catalog.pointsOfInterest
  }

  setCatalogSection(catalog: DiaryCatalog, section: CatalogTagRecord): DiaryCatalog {
    return { ...catalog, pointsOfInterest: section as DiaryCatalog['pointsOfInterest'] }
  }
}

export class LocationTagManager extends DiaryTagManager<LocationTag> {
  readonly itemLabel = 'Location'
  readonly itemLabelPlural = 'Locations'

  normalizeName(value: string): string {
    return value.trim()
  }

  collect(entries: DiaryEntry[]): LocationTag[] {
    const locations = new Map<string, LocationTag>()

    for (const entry of entries) {
      for (const city of entry.cities) {
        const key = getLocationTagKey(city)
        const current = locations.get(key)

        locations.set(key, new LocationTag(
          key,
          current?.displayName ?? city.name,
          current?.color ?? entry.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR,
          (current?.count ?? 0) + 1,
        ))
      }
    }

    return Array.from(locations.values()).sort(compareTags)
  }

  collectFromCatalog(catalog: DiaryCatalog): LocationTag[] {
    return Object.entries(catalog.locations)
      .map(([key, location]) => new LocationTag(
        key,
        location.city.name,
        location.color || DEFAULT_LOCATION_COLOR,
        location.entries.length,
        location.pinned === true,
      ))
      .sort(compareTags)
  }

  getColorNames(settings: AppSettings): Record<string, string> {
    return settings.locationColorGroupNames
  }

  getColorGroupName(settings: AppSettings, color: string): string {
    return settings.locationColorGroupNames[color] || color
  }

  setColorGroupName(settings: AppSettings, color: string, name: string): AppSettings {
    return {
      ...settings,
      locationColorGroupNames: {
        ...settings.locationColorGroupNames,
        [color]: name,
      },
    }
  }

  groupTags(tags: LocationTag[], settings: AppSettings): TagColorGroup<LocationTag>[] {
    return this.groupByColor(tags, (color) => this.getColorGroupName(settings, color))
  }
}

export const activityTagManager = new ActivityTagManager()
export const personTagManager = new PersonTagManager()
export const pointOfInterestTagManager = new PointOfInterestTagManager()
export const locationTagManager = new LocationTagManager()

export function getLocationTagKey(city: City): string {
  return city.name.trim().toLowerCase() || formatCityDisplayName(city).toLowerCase()
}

function compareTags<TTag extends DiaryTag>(a: TTag, b: TTag): number {
  if (a.pinned !== b.pinned)
    return a.pinned ? -1 : 1

  if (a.count !== b.count)
    return b.count - a.count

  return a.name.localeCompare(b.name)
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
