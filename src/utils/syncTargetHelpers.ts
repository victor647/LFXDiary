import type { DiaryEntry, SyncTarget } from '../domain/types'
import type { DiarySyncAdapter } from '../application/diarySync'
import type { AppSettings } from '../domain/types'
import { formatDiaryDate, getNotebookKey, getNotebookYear } from './date'

export function getSyncTargetLabel(target: SyncTarget): string {
  if (target.kind === 'entry')
    return formatDiaryDate(target.key)

  return target.kind === 'month' ? target.key : target.year
}

export function getSyncTargetEntries(entries: DiaryEntry[], target: SyncTarget): DiaryEntry[] {
  if (target.kind === 'entry')
    return entries.filter((entry) => entry.diaryDate === target.key || entry.id === target.key)

  if (target.kind === 'month')
    return entries.filter((entry) => getNotebookKey(entry.diaryDate) === target.key)

  return entries.filter((entry) => getNotebookYear(entry.diaryDate) === target.year)
}

export function getSyncTargetNotebookKeys(target: SyncTarget): string[] {
  if (target.kind === 'entry')
    return [target.notebookKey]

  if (target.kind === 'month')
    return [target.key]

  return Array.from({ length: 12 }, (_, index) => `${target.year}-${String(index + 1).padStart(2, '0')}`)
}

export function getSyncTargetPullSource(adapter: DiarySyncAdapter, settings: AppSettings, target: SyncTarget): string {
  if (target.kind === 'entry')
    return adapter.getPullSource(settings, target.notebookKey)

  if (target.kind === 'month')
    return adapter.getPullSource(settings, target.key)

  return `${adapter.label} ${target.year}`
}
