import type { DiaryEntry, AppSettings } from '../domain/types'
import type { SyncProgress } from '../domain/types'
import { parseEvernoteImportFile, createDiaryEntryFromEvernoteImport } from '../utils/evernoteImport'
import { upsertEntry } from '../utils/entries'
import { saveSettings } from '../utils/settings'
import { getNotebookKey, getNotebookYear } from '../utils/date'
import { formatImportSourceLabel, getImportStatusMessage, getEmptyImportStatusMessage } from '../utils/syncErrorLog'

export type ImportCallbacks = {
  setStatusMessage: (msg: string) => void
  setSyncProgress: (progress: SyncProgress | null) => void
  setSettings: (settings: AppSettings) => void
  applyEntries: (entries: DiaryEntry[] | ((current: DiaryEntry[]) => DiaryEntry[])) => void
  applyDraft: (draft: DiaryEntry | ((current: DiaryEntry) => DiaryEntry)) => void
  setSelectedNotebook: (key: string) => void
  setSyncTarget: (target: { kind: 'month'; key: string }) => void
  setExpandedYears: (fn: (current: Set<string>) => Set<string>) => void
  setExpandedMonths: (fn: (current: Set<string>) => Set<string>) => void
}

export async function importEvernoteFiles(
  files: File[],
  entries: DiaryEntry[],
  settings: AppSettings,
  callbacks: ImportCallbacks,
) {
  try {
    const sourceLabel = formatImportSourceLabel(files)
    const importMessage = `Importing ${sourceLabel}...`
    callbacks.setStatusMessage(importMessage)
    callbacks.setSyncProgress({ target: 'Notes', title: 'Importing Notes', message: importMessage })

    let nextEntries = entries
    let nextSettings = settings
    const importedEntries: DiaryEntry[] = []
    const addedTags = new Set<string>()
    const addedPeople = new Set<string>()
    let weatherFailureCount = 0
    let encryptedCount = 0
    let unsupportedCount = 0
    let totalDraftCount = 0
    let importedDraftCount = 0

    for (const [fileIndex, file] of files.entries()) {
      const readMessage = `Reading ${fileIndex + 1} of ${files.length}: ${file.name}...`
      callbacks.setStatusMessage(readMessage)
      callbacks.setSyncProgress({ target: 'Notes', title: 'Importing Notes', message: readMessage })
      const text = await file.text()
      const parsedFile = parseEvernoteImportFile(text, file.name)
      encryptedCount += parsedFile.encryptedCount
      unsupportedCount += parsedFile.unsupportedCount
      totalDraftCount += parsedFile.drafts.length

      for (const importDraft of parsedFile.drafts) {
        importedDraftCount += 1
        const progressMessage = `Importing ${importedDraftCount} of ${totalDraftCount} from ${sourceLabel}...`
        callbacks.setStatusMessage(progressMessage)
        callbacks.setSyncProgress({ target: 'Notes', title: 'Importing Notes', message: progressMessage })
        const result = await createDiaryEntryFromEvernoteImport(importDraft, nextEntries, nextSettings)

        nextEntries = upsertEntry(nextEntries, result.entry)
        nextSettings = result.settings
        importedEntries.push(result.entry)

        for (const tag of result.addedTags)
          addedTags.add(tag)

        for (const person of result.addedPeople)
          addedPeople.add(person)

        if (!result.weatherFetched)
          weatherFailureCount += 1
      }
    }

    if (!importedEntries.length) {
      callbacks.setStatusMessage(getEmptyImportStatusMessage(sourceLabel, encryptedCount, unsupportedCount))
      return
    }

    const newestImportedEntry = [...importedEntries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]

    callbacks.setSettings(nextSettings)
    saveSettings(nextSettings)
    callbacks.applyEntries(nextEntries)
    callbacks.applyDraft(newestImportedEntry)
    callbacks.setSelectedNotebook(getNotebookKey(newestImportedEntry.diaryDate))
    callbacks.setSyncTarget({ kind: 'month', key: getNotebookKey(newestImportedEntry.diaryDate) })
    callbacks.setExpandedYears((current) => {
      const next = new Set(current)

      for (const entry of importedEntries)
        next.add(getNotebookYear(entry.diaryDate))

      return next
    })
    callbacks.setExpandedMonths((current) => {
      const next = new Set(current)

      for (const entry of importedEntries)
        next.add(getNotebookKey(entry.diaryDate))

      return next
    })
    callbacks.setStatusMessage(
      getImportStatusMessage(
        sourceLabel,
        importedEntries.length,
        Array.from(addedTags),
        Array.from(addedPeople),
        weatherFailureCount,
        encryptedCount,
        unsupportedCount,
      ),
    )
  } catch (error) {
    callbacks.setStatusMessage(error instanceof Error ? error.message : 'Evernote import failed.')
  } finally {
    callbacks.setSyncProgress(null)
  }
}
