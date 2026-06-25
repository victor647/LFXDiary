import { emptyMood } from '../constants'
import type { DiaryEntry, MoodScore } from '../types'

export function serializeMoodMetadata(entry: DiaryEntry): string {
  return `Mood: ${entry.mood.morning}-${entry.mood.afternoon}-${entry.mood.evening}`
}

export function deserializeMoodMetadata(line: string | undefined): MoodScore {
  const values = line?.match(/(\d+)-(\d+)-(\d+)/)

  if (!values)
    return { ...emptyMood }

  return {
    morning: clampScore(Number(values[1])),
    afternoon: clampScore(Number(values[2])),
    evening: clampScore(Number(values[3])),
  }
}

export function normalizeMoodMetadata(mood: unknown): MoodScore {
  if (!mood || typeof mood !== 'object')
    return { ...emptyMood }

  const values = mood as Partial<MoodScore>

  return {
    morning: clampScore(Number(values.morning)),
    afternoon: clampScore(Number(values.afternoon)),
    evening: clampScore(Number(values.evening)),
  }
}

function clampScore(value: number): number {
  if (Number.isNaN(value))
    return 5

  return Math.max(0, Math.min(10, Math.round(value)))
}
