import { DEFAULT_TAG_COLOR } from '../domain/constants'

export function normalizeTag(value: string): string {
  const words = value
    .trim()
    .replace(/['"]/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)

  return words.map(toTitleWord).join(' ')
}

function toTitleWord(word: string): string {
  const lowerWord = word.toLowerCase()
  return `${lowerWord.charAt(0).toUpperCase()}${lowerWord.slice(1)}`
}

export function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).sort()
}

export function normalizeTagColors(tagColors: Record<string, string>, tags: string[]): Record<string, string> {
  const normalizedColors: Record<string, string> = {}

  for (const rawTag of Object.keys(tagColors)) {
    const tag = normalizeTag(rawTag)

    if (tag)
      normalizedColors[tag] = tagColors[rawTag]
  }

  for (const tag of tags) {
    if (!normalizedColors[tag])
      normalizedColors[tag] = DEFAULT_TAG_COLOR
  }

  return normalizedColors
}
