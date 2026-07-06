import { DEFAULT_TAG_COLOR, MAX_PEOPLE_PER_ENTRY } from '../constants'
import { normalizePersonTags } from '../tags'
import type { DiaryCatalog, DiaryEntry } from '../types'

export function serializePeopleMetadata(entry: DiaryEntry): string {
  return `People: ${entry.people.join(', ') || 'untagged'}`
}

export function deserializePeopleMetadata(line: string | undefined): string[] {
  const peopleText = line?.replace(/^People:\s*/, '').trim()

  if (!peopleText || peopleText === 'untagged')
    return []

  return peopleText.split(',').map((person) => person.trim()).filter(Boolean)
}

export function normalizePeopleMetadata(people: unknown): string[] {
  return Array.isArray(people) ? normalizePersonTags(people.filter((person): person is string => typeof person === 'string')).slice(0, MAX_PEOPLE_PER_ENTRY) : []
}

export function getCatalogPersonColorMap(catalog: DiaryCatalog | undefined): Record<string, string> {
  if (!catalog)
    return {}

  return Object.fromEntries(Object.entries(catalog.people ?? {}).map(([name, person]) => [name, person.color]))
}

export function getDefaultPersonColor(): string {
  return DEFAULT_TAG_COLOR
}
