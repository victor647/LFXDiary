import type { MoodScore } from '../domain/types'

export function getMoodBackgroundColor(mood: MoodScore): string {
  const averageMood = (mood.morning + mood.afternoon + mood.evening) / 3

  if (averageMood < 5)
    return '#eff6ff'

  if (averageMood > 7)
    return '#fff1f7'

  return '#effaf1'
}

export function getMoodAccentColor(score: number): string {
  if (score < 5)
    return '#60a5fa'

  if (score < 8)
    return '#4ade80'

  return '#f9a8d4'
}

export function getTagBackgroundColor(color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color))
    return '#edf6f9'

  return `${color}1f`
}

export function getTagTextColor(color: string): string {
  const rgb = parseHexColor(color)

  if (!rgb)
    return '#334155'

  return toHexColor({
    red: Math.round(rgb.red * 0.58),
    green: Math.round(rgb.green * 0.58),
    blue: Math.round(rgb.blue * 0.58),
  })
}

function parseHexColor(color: string): { red: number; green: number; blue: number } | null {
  const match = color.match(/^#([0-9a-fA-F]{6})$/)

  if (!match)
    return null

  const value = match[1]

  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  }
}

function toHexColor(color: { red: number; green: number; blue: number }): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}
