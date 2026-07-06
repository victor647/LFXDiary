import { DEFAULT_TAG_COLOR } from './constants'

export function normalizeTag(value: string): string {
  const words = value
    .trim()
    .replace(/['"]/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)

  return words.map(toTitleWord).join(' ')
}

export function normalizePersonTag(value: string): string {
  const trimmed = value.trim().replace(/['"]/g, '').replace(/\s+/g, ' ')

  if (/[\u3400-\u9fff]/.test(trimmed))
    return trimmed.replace(/[^\u3400-\u9fffa-zA-Z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()

  return normalizeTag(trimmed)
}

export function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).sort()
}

export function normalizePersonTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizePersonTag).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

export function normalizeTagColors(
  tagColors: Record<string, string>,
  tags: string[],
  normalize = normalizeTag,
): Record<string, string> {
  const normalizedColors: Record<string, string> = {}

  for (const rawTag of Object.keys(tagColors)) {
    const tag = normalize(rawTag)

    if (tag)
      normalizedColors[tag] = tagColors[rawTag]
  }

  for (const tag of tags) {
    if (!normalizedColors[tag])
      normalizedColors[tag] = DEFAULT_TAG_COLOR
  }

  return normalizedColors
}

function toTitleWord(word: string): string {
  const lowerWord = word.toLowerCase()
  return `${lowerWord.charAt(0).toUpperCase()}${lowerWord.slice(1)}`
}
