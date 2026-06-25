import { DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY } from '../constants'
import type { DiaryCatalog, DiaryEntry } from '../types'

export function serializeActivitiesMetadata(entry: DiaryEntry): string {
  return `Tags: ${entry.tags.join(', ') || 'untagged'}`
}

export function deserializeActivitiesMetadata(line: string | undefined): string[] {
  const tagText = line?.replace(/^Tags:\s*/, '').trim()

  if (!tagText || tagText === 'untagged')
    return []

  return tagText.split(',').map((tag) => tag.trim()).filter(Boolean)
}

export function normalizeActivitiesMetadata(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.filter(Boolean).slice(0, MAX_ACTIVITIES_PER_ENTRY) : []
}

export function getCatalogActivityColorMap(catalog: DiaryCatalog | undefined): Record<string, string> {
  if (!catalog)
    return {}

  return Object.fromEntries(Object.entries(catalog.activities).map(([name, activity]) => [name, activity.color]))
}

export function getDefaultActivityColor(): string {
  return DEFAULT_TAG_COLOR
}
