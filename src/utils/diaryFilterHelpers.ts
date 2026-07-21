import type { DiaryCatalog, DiaryEntry, TagFilter, TagFilterOption } from '../domain/types'
import { getNotebookKey } from './date'
import { activityTagManager, locationTagManager, personTagManager, pointOfInterestTagManager } from '../domain/tagModels'
import type { AppSettings } from '../domain/types'

export function getTagFilterOptions(catalog: DiaryCatalog, settings: AppSettings): TagFilterOption[] {
  return [
    ...Object.entries(catalog.locations).map(([key, location]) => ({
      kind: 'location' as const,
      value: key,
      name: location.city.name,
      color: location.color,
      colorLabel: locationTagManager.getColorGroupName(settings, location.color),
    })),
    ...Object.entries(catalog.activities).map(([tagId, activity]) => ({
      kind: 'activity' as const,
      value: tagId,
      name: activity.name,
      color: activity.color,
      colorLabel: activityTagManager.getColorGroupName(settings, activity.color),
    })),
    ...Object.entries(catalog.people).map(([tagId, person]) => ({
      kind: 'person' as const,
      value: tagId,
      name: person.name,
      color: person.color,
      colorLabel: personTagManager.getColorGroupName(settings, person.color),
    })),
    ...Object.entries(catalog.pointsOfInterest).map(([tagId, pointOfInterest]) => ({
      kind: 'pointOfInterest' as const,
      value: tagId,
      name: pointOfInterest.name,
      color: pointOfInterest.color,
      colorLabel: pointOfInterestTagManager.getColorGroupName(settings, pointOfInterest.color),
    })),
  ]
}

export function getFilteredMonthEntryCounts(
  searchResults: DiaryEntry[],
  tagFilterEntryReferences: Set<string> | null,
  searchQuery: string,
): Map<string, number> {
  const datesByMonth = new Map<string, Set<string>>()

  if (tagFilterEntryReferences && !searchQuery) {
    for (const reference of tagFilterEntryReferences) {
      if (isDiaryDateReference(reference))
        addFilteredMonthDate(datesByMonth, reference)
    }
  }

  for (const entry of searchResults)
    addFilteredMonthDate(datesByMonth, entry.diaryDate)

  return new Map(
    Array.from(datesByMonth.entries()).map(([monthKey, dates]) => [monthKey, dates.size]),
  )
}

function addFilteredMonthDate(datesByMonth: Map<string, Set<string>>, diaryDate: string) {
  const monthKey = getNotebookKey(diaryDate)
  datesByMonth.set(monthKey, new Set([...(datesByMonth.get(monthKey) ?? []), diaryDate]))
}

export function sumMonthEntryCounts(monthCounts: Map<string, number>): number {
  return Array.from(monthCounts.values()).reduce((sum, count) => sum + count, 0)
}

export function isDiaryDateReference(reference: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(reference)
}

export function getDecadeKey(year: string): string {
  const yearValue = Number.parseInt(year, 10)

  if (!Number.isFinite(yearValue))
    return year

  return String(Math.floor(yearValue / 10) * 10)
}

export function getTagFilterEntryReferences(catalog: DiaryCatalog, filter: TagFilter): Set<string> | null {
  if (filter.tags.length) {
    let matchingReferences: Set<string> | null = null

    for (const selectedTag of filter.tags) {
      const tagReferences = getConcreteTagEntryReferences(catalog, selectedTag.kind, selectedTag.tag)
      matchingReferences = matchingReferences
        ? intersectEntryReferences(matchingReferences, tagReferences)
        : tagReferences
    }

    return matchingReferences ?? new Set()
  }

  if (!filter.kind)
    return null

  const entryReferences = new Set<string>()

  if (filter.kind === 'location') {
    for (const [key, location] of Object.entries(catalog.locations)) {
      const nameMatches = !filter.tag || key === filter.tag
      const colorMatches = !filter.color || location.color === filter.color

      if (nameMatches && colorMatches)
        addEntryReferences(entryReferences, location.entries)
    }

    return entryReferences
  }

  if (filter.kind === 'activity') {
    for (const [name, activity] of Object.entries(catalog.activities)) {
      const nameMatches = !filter.tag || name === filter.tag
      const colorMatches = !filter.color || activity.color === filter.color

      if (nameMatches && colorMatches)
        addEntryReferences(entryReferences, activity.entries)
    }

    return entryReferences
  }

  if (filter.kind === 'person') {
    for (const [name, person] of Object.entries(catalog.people)) {
      const nameMatches = !filter.tag || name === filter.tag
      const colorMatches = !filter.color || person.color === filter.color

      if (nameMatches && colorMatches)
        addEntryReferences(entryReferences, person.entries)
    }

    return entryReferences
  }

  for (const [name, pointOfInterest] of Object.entries(catalog.pointsOfInterest)) {
    const nameMatches = !filter.tag || name === filter.tag
    const colorMatches = !filter.color || pointOfInterest.color === filter.color

    if (nameMatches && colorMatches)
      addEntryReferences(entryReferences, pointOfInterest.entries)
  }

  return entryReferences
}

function getConcreteTagEntryReferences(catalog: DiaryCatalog, kind: TagFilter['kind'], tag: string): Set<string> {
  const entryReferences = new Set<string>()

  if (!kind)
    return entryReferences

  if (kind === 'location') {
    const location = catalog.locations[tag]
    if (location)
      addEntryReferences(entryReferences, location.entries)

    return entryReferences
  }

  if (kind === 'activity') {
    const activity = catalog.activities[tag]
    if (activity)
      addEntryReferences(entryReferences, activity.entries)

    return entryReferences
  }

  if (kind === 'person') {
    const person = catalog.people[tag]
    if (person)
      addEntryReferences(entryReferences, person.entries)

    return entryReferences
  }

  const pointOfInterest = catalog.pointsOfInterest[tag]
  if (pointOfInterest)
    addEntryReferences(entryReferences, pointOfInterest.entries)

  return entryReferences
}

function intersectEntryReferences(left: Set<string>, right: Set<string>): Set<string> {
  return new Set(Array.from(left).filter((reference) => right.has(reference)))
}

function addEntryReferences(entryReferences: Set<string>, references: string[]) {
  for (const reference of references)
    entryReferences.add(reference)
}
