import type { DiaryEntry, TagId } from './types'

export function updateEntryActivity(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry {
  return updateEntryTagSet(entry, oldTagId, nextTagId, color, 'tags', 'tagColors')
}

export function updateEntryPerson(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry {
  return updateEntryTagSet(entry, oldTagId, nextTagId, color, 'people', 'personColors')
}

export function updateEntryPointOfInterest(entry: DiaryEntry, oldTagId: TagId, nextTagId: TagId, color: string): DiaryEntry {
  return updateEntryTagSet(entry, oldTagId, nextTagId, color, 'pointsOfInterest', 'pointOfInterestColors')
}

function updateEntryTagSet(
  entry: DiaryEntry,
  oldTagId: TagId,
  nextTagId: TagId,
  color: string,
  tagField: 'tags' | 'people' | 'pointsOfInterest',
  colorField: 'tagColors' | 'personColors' | 'pointOfInterestColors',
): DiaryEntry {
  if (!oldTagId || !nextTagId)
    return entry

  const tagColors = { ...(entry[colorField] ?? {}) }
  let changed = false
  const tags = (entry[tagField] ?? []).map((id) => {
    if (id !== oldTagId)
      return id

    changed = true
    delete tagColors[id]
    return nextTagId
  })

  if (!changed)
    return entry

  tagColors[nextTagId] = color

  return {
    ...entry,
    [tagField]: tags,
    [colorField]: tagColors,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}
