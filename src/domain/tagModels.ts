import { DEFAULT_LOCATION_COLOR, DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY, MAX_PEOPLE_PER_ENTRY, TAG_COLOR_PALETTE } from './constants'
import { formatCityDisplayName } from './city'
import { updateEntryActivity, updateEntryPerson } from './entryTags'
import { normalizePersonTag, normalizePersonTags, normalizeTag, normalizeTags } from './tags'
import type { AppSettings, City, DiaryEntry } from './types'

export type TagColorGroup<TTag extends DiaryTag> = {
  color: string
  name: string
  tags: TTag[]
}

export abstract class DiaryTag {
  abstract readonly kind: 'activity' | 'person' | 'location'

  readonly key: string
  readonly name: string
  readonly color: string
  readonly count: number

  protected constructor(key: string, name: string, color: string, count: number) {
    this.key = key
    this.name = name
    this.color = color
    this.count = count
  }
}

export class ActivityTag extends DiaryTag {
  readonly kind = 'activity'

  constructor(name: string, color: string, count = 0) {
    super(name, name, color, count)
  }
}

export class PersonTag extends DiaryTag {
  readonly kind = 'person'

  constructor(name: string, color: string, count = 0) {
    super(name, name, color, count)
  }
}

export class LocationTag extends DiaryTag {
  readonly kind = 'location'

  constructor(key: string, name: string, color: string, count = 0) {
    super(key, name, color, count)
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
      tags: tagsByColor.get(color) ?? [],
    }))
  }
}

export abstract class CatalogDiaryTagManager<TTag extends ActivityTag | PersonTag> extends DiaryTagManager<TTag> {
  abstract readonly maxTags: number
  abstract readonly panelClassName: string

  abstract createTag(name: string, color: string, count?: number): TTag
  abstract getEntryNames(entry: DiaryEntry): string[]
  abstract getEntryColors(entry: DiaryEntry): Record<string, string>
  abstract getCatalog(settings: AppSettings): Record<string, { color: string }>
  abstract getColorNames(settings: AppSettings): Record<string, string>
  abstract getColorGroupName(settings: AppSettings, color: string): string
  abstract setCatalog(settings: AppSettings, catalog: Record<string, { color: string }>): AppSettings
  abstract setColorGroupName(settings: AppSettings, color: string, name: string): AppSettings
  abstract updateEntryTag(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry
  abstract buildDraftPatch(tags: string[], colors: Record<string, string>): Partial<DiaryEntry>

  collect(entries: DiaryEntry[], settings: AppSettings): TTag[] {
    const tags = new Map<string, TTag>()

    for (const [name, tag] of Object.entries(this.getCatalog(settings))) {
      const normalizedName = this.normalizeName(name)

      if (!normalizedName)
        continue

      tags.set(normalizedName, this.createTag(normalizedName, tag.color || DEFAULT_TAG_COLOR, 0))
    }

    for (const entry of entries) {
      const entryColors = this.getEntryColors(entry)

      for (const rawTag of this.getEntryNames(entry)) {
        const name = this.normalizeName(rawTag)

        if (!name)
          continue

        const current = tags.get(name)
        tags.set(name, this.createTag(
          name,
          current?.color ?? entryColors[rawTag] ?? DEFAULT_TAG_COLOR,
          (current?.count ?? 0) + 1,
        ))
      }
    }

    return Array.from(tags.values()).sort(compareTagsByName)
  }

  collectRecent(entries: DiaryEntry[], settings: AppSettings): TTag[] {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffDate = toDateInputValue(cutoff)
    return this.collect(entries.filter((entry) => entry.diaryDate >= cutoffDate), settings)
  }

  addToEntry(entry: DiaryEntry, rawTag: string, color: string): Partial<DiaryEntry> | null {
    const tag = this.normalizeName(rawTag)

    if (!tag)
      return null

    return this.buildDraftPatch([...this.getEntryNames(entry), tag], {
      ...this.getEntryColors(entry),
      [tag]: color,
    })
  }

  removeFromEntry(entry: DiaryEntry, rawTag: string): Partial<DiaryEntry> {
    const normalizedTag = this.normalizeName(rawTag)
    const colors = { ...this.getEntryColors(entry) }

    for (const tag of this.getEntryNames(entry)) {
      if (this.normalizeName(tag) === normalizedTag)
        delete colors[tag]
    }

    return this.buildDraftPatch(
      this.getEntryNames(entry).filter((tag) => this.normalizeName(tag) !== normalizedTag),
      colors,
    )
  }

  updateCatalog(catalog: Record<string, { color: string }>, oldTag: string, nextTag: string, color: string): Record<string, { color: string }> {
    const normalizedOldTag = this.normalizeName(oldTag)
    const normalizedNextTag = this.normalizeName(nextTag)
    const nextCatalog: Record<string, { color: string }> = {}

    for (const [name, tag] of Object.entries(catalog)) {
      if (this.normalizeName(name) !== normalizedOldTag)
        nextCatalog[name] = tag
    }

    if (normalizedNextTag)
      nextCatalog[normalizedNextTag] = { color }

    return nextCatalog
  }

  deleteCatalogTags(catalog: Record<string, { color: string }>, tags: string[]): Record<string, { color: string }> {
    const normalizedTags = new Set(tags.map((tag) => this.normalizeName(tag)).filter(Boolean))
    const nextCatalog: Record<string, { color: string }> = {}

    for (const [name, tag] of Object.entries(catalog)) {
      if (!normalizedTags.has(this.normalizeName(name)))
        nextCatalog[name] = tag
    }

    return nextCatalog
  }

  deleteEntryTag(entry: DiaryEntry, tag: string): DiaryEntry {
    const patch = this.removeFromEntry(entry, tag)

    if (this.getEntryNames(entry).length === this.getEntryNames({ ...entry, ...patch }).length)
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
  readonly panelClassName = 'activities-panel'

  normalizeName(value: string): string {
    return normalizeTag(value)
  }

  createTag(name: string, color: string, count = 0): ActivityTag {
    return new ActivityTag(name, color, count)
  }

  getEntryNames(entry: DiaryEntry): string[] {
    return entry.tags ?? []
  }

  getEntryColors(entry: DiaryEntry): Record<string, string> {
    return entry.tagColors ?? {}
  }

  getCatalog(settings: AppSettings): Record<string, { color: string }> {
    return settings.activityTags
  }

  getColorNames(settings: AppSettings): Record<string, string> {
    return settings.activityColorGroupNames
  }

  getColorGroupName(settings: AppSettings, color: string): string {
    return settings.activityColorGroupNames[color] || color
  }

  setCatalog(settings: AppSettings, catalog: Record<string, { color: string }>): AppSettings {
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

  updateEntryTag(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
    return updateEntryActivity(entry, oldTag, nextTag, color)
  }

  buildDraftPatch(tags: string[], colors: Record<string, string>): Partial<DiaryEntry> {
    return {
      tags: normalizeTags(tags),
      tagColors: colors,
    }
  }
}

export class PersonTagManager extends CatalogDiaryTagManager<PersonTag> {
  readonly itemLabel = 'Person'
  readonly itemLabelPlural = 'People'
  readonly maxTags = MAX_PEOPLE_PER_ENTRY
  readonly panelClassName = 'people-panel'

  normalizeName(value: string): string {
    return normalizePersonTag(value)
  }

  createTag(name: string, color: string, count = 0): PersonTag {
    return new PersonTag(name, color, count)
  }

  getEntryNames(entry: DiaryEntry): string[] {
    return entry.people ?? []
  }

  getEntryColors(entry: DiaryEntry): Record<string, string> {
    return entry.personColors ?? {}
  }

  getCatalog(settings: AppSettings): Record<string, { color: string }> {
    return settings.peopleTags
  }

  getColorNames(settings: AppSettings): Record<string, string> {
    return settings.personColorGroupNames
  }

  getColorGroupName(settings: AppSettings, color: string): string {
    return settings.personColorGroupNames[color] || color
  }

  setCatalog(settings: AppSettings, catalog: Record<string, { color: string }>): AppSettings {
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

  updateEntryTag(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
    return updateEntryPerson(entry, oldTag, nextTag, color)
  }

  buildDraftPatch(tags: string[], colors: Record<string, string>): Partial<DiaryEntry> {
    return {
      people: normalizePersonTags(tags),
      personColors: colors,
    }
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
          current?.name ?? city.name,
          current?.color ?? entry.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR,
          (current?.count ?? 0) + 1,
        ))
      }
    }

    return Array.from(locations.values()).sort(compareTagsByName)
  }
}

export const activityTagManager = new ActivityTagManager()
export const personTagManager = new PersonTagManager()
export const locationTagManager = new LocationTagManager()

export function getLocationTagKey(city: City): string {
  return city.name.trim().toLowerCase() || formatCityDisplayName(city).toLowerCase()
}

function compareTagsByName<TTag extends DiaryTag>(a: TTag, b: TTag): number {
  return a.name.localeCompare(b.name)
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
