import type { DiaryEntry } from './types'
import { normalizePersonTag, normalizePersonTags, normalizeTag, normalizeTags } from './tags'

export function updateEntryActivity(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
  return updateEntryTagSet(entry, oldTag, nextTag, color, 'tags', 'tagColors', normalizeTag, normalizeTags)
}

export function updateEntryPerson(entry: DiaryEntry, oldTag: string, nextTag: string, color: string): DiaryEntry {
  return updateEntryTagSet(entry, oldTag, nextTag, color, 'people', 'personColors', normalizePersonTag, normalizePersonTags)
}

function updateEntryTagSet(
  entry: DiaryEntry,
  oldTag: string,
  nextTag: string,
  color: string,
  tagField: 'tags' | 'people',
  colorField: 'tagColors' | 'personColors',
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
