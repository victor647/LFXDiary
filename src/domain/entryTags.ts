import type { DiaryEntry } from './types'
import { normalizePersonTag, normalizePersonTags, normalizePointOfInterestTag, normalizePointOfInterestTags, normalizeTags, sanitizeTag } from './tags'

export function updateEntryActivity(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
  return updateEntryTagSet(entry, oldTag, nextTag, color, 'tags', 'tagColors', sanitizeTag, normalizeTags)
}

export function updateEntryPerson(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
  const updatedEntry = updateEntryTagSet(entry, oldTag, nextTag, color, 'people', 'personColors', normalizePersonTag, normalizePersonTags)
  if (updatedEntry === entry)
    return entry

  const normalizedNextTag = normalizePersonTag(nextTag)
  const nextContent = replaceTagReferences(updatedEntry.content, [normalizePersonTag(oldTag), oldTag], normalizedNextTag)

  if (nextContent === updatedEntry.content)
    return updatedEntry

  return {
    ...updatedEntry,
    content: nextContent,
  }
}

export function updateEntryPointOfInterest(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
  const updatedEntry = updateEntryTagSet(
    entry,
    oldTag,
    nextTag,
    color,
    'pointsOfInterest',
    'pointOfInterestColors',
    normalizePointOfInterestTag,
    normalizePointOfInterestTags,
  )
  if (updatedEntry === entry)
    return entry

  const normalizedNextTag = normalizePointOfInterestTag(nextTag)
  const nextContent = replaceTagReferences(updatedEntry.content, [normalizePointOfInterestTag(oldTag), oldTag], normalizedNextTag)

  if (nextContent === updatedEntry.content)
    return updatedEntry

  return {
    ...updatedEntry,
    content: nextContent,
  }
}

function replaceTagReferences(content: string, oldValues: string[], nextValue: string): string {
  const values = Array.from(new Set(oldValues.map((value) => value.trim()).filter((value) => value && value !== nextValue)))
    .sort((a, b) => b.length - a.length)

  if (!values.length || !nextValue)
    return content

  const pattern = new RegExp(values.map(escapeRegExp).join('|'), 'g')
  return content.replace(pattern, nextValue)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function updateEntryTagSet(
  entry: DiaryEntry,
  oldTag: string,
  nextTag: string,
  color: string,
  tagField: 'tags' | 'people' | 'pointsOfInterest',
  colorField: 'tagColors' | 'personColors' | 'pointOfInterestColors',
  normalize: (value: string) => string,
  normalizeMany: (values: string[]) => string[],
): DiaryEntry {
  const normalizedOldTag = normalize(oldTag)
  const normalizedNextTag = normalize(nextTag)

  if (!normalizedOldTag || !normalizedNextTag)
    return entry

  const tagColors = { ...(entry[colorField] ?? {}) }
  let changed = false
  const tags = (entry[tagField] ?? []).map((tag) => {
    if (normalize(tag) !== normalizedOldTag)
      return tag

    changed = true
    delete tagColors[tag]
    return normalizedNextTag
  })

  if (!changed)
    return entry

  tagColors[normalizedNextTag] = color

  return {
    ...entry,
    [tagField]: normalizeMany(tags),
    [colorField]: tagColors,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}
