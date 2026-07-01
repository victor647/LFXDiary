import { useEffect, useMemo, useState } from 'react'
import { DeleteEntryDialog } from './components/DeleteEntryDialog'
import { EntryEditor } from './components/EntryEditor'
import { ForcePushDialog } from './components/ForcePushDialog'
import { MetadataEditor } from './components/MetadataEditor'
import { PullConflictDialog } from './components/PullConflictDialog'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { SyncErrorDialog } from './components/SyncErrorDialog'
import { STORAGE_KEY } from './domain/constants'
import { serializeDiaryEntryMarkdown } from './domain/diaryEntrySerialization'
import type { DiaryEntry } from './domain/types'
import { formatDiaryDate, getNotebookKey, getNotebookYear, toDateInputValue } from './utils/date'
import {
  getNormalizedDailyWeatherFields,
  hasCloudCopy,
  isEntryUnsynced,
  upsertEntries,
} from './utils/diaryEntryHelpers'
import {
  groupEntriesByNotebook,
  loadEntries,
  makeBlankEntry,
  mergePulledEntries,
  normalizeLocationColors,
  upsertEntry,
} from './utils/entries'
import { createDiaryEntryFromEvernoteImport, parseEvernoteImportFile } from './utils/evernoteImport'
import {
  downloadTextFile,
  getEntryMarkdownFileName,
  getEntryMarkdownFolder,
} from './utils/files'
import {
  deleteEntryFromGit,
  getGitDisplayTarget,
  pullEntriesFromGit,
  pushEntriesToGit,
} from './utils/gitSync'
import { loadSettings, normalizeSettings, saveSettings } from './utils/settings'
import { formatSyncErrorLog } from './utils/syncErrorLog'
import {
  deleteEntryFromSynology,
  downloadEntriesFromSynology,
  uploadEntriesToSynology,
} from './utils/synology'
import { normalizeTagColors, normalizeTags } from './utils/tags'

type PullConflict = {
  localEntry: DiaryEntry
  cloudEntry: DiaryEntry
}

type PendingPullReview = {
  syncTarget: string
  baseEntries: DiaryEntry[]
  resolvedEntries: DiaryEntry[]
  conflicts: PullConflict[]
  index: number
}

export function DiaryApp() {
  const [currentPage, setCurrentPage] = useState<'diary' | 'settings'>('diary')
  const [settings, setSettings] = useState(loadSettings)
  const [entries, setEntries] = useState<DiaryEntry[]>(loadEntries)
  const [draft, setDraft] = useState<DiaryEntry>(() => entries[0] ?? makeBlankEntry())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusMessage, setStatusMessage] = useState('Ready')
  const [syncErrorLog, setSyncErrorLog] = useState<string | null>(null)
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    entry: DiaryEntry
  } | null>(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<DiaryEntry | null>(null)
  const [pendingForcePushMonth, setPendingForcePushMonth] = useState<string | null>(null)
  const [pendingPullReview, setPendingPullReview] = useState<PendingPullReview | null>(null)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set([String(new Date().getFullYear())]))
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set([getNotebookKey(toDateInputValue(new Date()))]))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [entries])

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate)),
    [entries],
  )

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query)
      return sortedEntries

    return sortedEntries.filter((entry) => {
      const dateText = formatDiaryDate(entry.diaryDate).toLowerCase()
      const cityText = entry.cities.map((city) => city.name).join(' ').toLowerCase()
      const tagText = entry.tags.join(' ').toLowerCase()
      const contentText = entry.content.toLowerCase()

      return [dateText, cityText, tagText, contentText].some((text) => text.includes(query))
    })
  }, [searchQuery, sortedEntries])

  const notebookEntries = useMemo(() => {
    if (!selectedNotebook)
      return searchResults

    return searchResults.filter((entry) => getNotebookKey(entry.diaryDate) === selectedNotebook)
  }, [searchResults, selectedNotebook])

  const notebookGroups = useMemo(() => groupEntriesByNotebook(searchResults), [searchResults])
  const draftSavedEntry = useMemo(() => entries.find((entry) => entry.id === draft.id), [draft.id, entries])
  const isDraftDirty = !draftSavedEntry || draftSavedEntry.updatedAt !== draft.updatedAt
  const editedEntryCount = useMemo(() => getEditedEntryCount(entries, draft), [draft, entries])
  const unsavedEntryIds = useMemo(() => getUnsavedEntryIds(entries, draft), [draft, entries])
  const unuploadedEntryCount = useMemo(() => getUnuploadedEntryCount(entries, draft), [draft, entries])
  const sidebarStatusMessage = getSidebarStatusMessage(unsavedEntryIds.size, unuploadedEntryCount) ?? statusMessage

  function updateDraft(patch: Partial<DiaryEntry>) {
    setDraft((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      isEdited: true,
    }))
  }

  function updateDraftIfCurrent(entryId: string, diaryDate: string, patch: Partial<DiaryEntry>) {
    setDraft((current) => {
      if (current.id !== entryId || current.diaryDate !== diaryDate)
        return current

      return {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
        isEdited: true,
      }
    })
  }

  function saveEditedEntries() {
    const now = new Date().toISOString()
    const savedEntries = new Map<string, DiaryEntry>()
    let savedCount = 0

    for (const entry of entries) {
      const savedEntry = entry.isEdited ? getSavedDraftEntry(entry, now) : entry
      savedEntries.set(savedEntry.id, savedEntry)

      if (entry.isEdited)
        savedCount += 1
    }

    const shouldSaveDraft = isDraftDirty || draft.isEdited || !savedEntries.has(draft.id)
    const normalizedDraft = shouldSaveDraft ? getSavedDraftEntry(draft, now) : draft

    if (shouldSaveDraft) {
      if (!savedEntries.get(draft.id)?.isEdited)
        savedCount += 1

      savedEntries.set(normalizedDraft.id, normalizedDraft)
    }

    const nextEntries = Array.from(savedEntries.values())

    setDraft(normalizedDraft)
    setEntries(nextEntries)
    setSelectedNotebook(getNotebookKey(normalizedDraft.diaryDate))
    setExpandedYears((current) => new Set([...current, getNotebookYear(normalizedDraft.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, getNotebookKey(normalizedDraft.diaryDate)]))
    setStatusMessage(
      savedCount > 1
        ? `Saved ${savedCount} edited entries locally. Click Push to upload.`
        : `Saved locally: ${formatDiaryDate(normalizedDraft.diaryDate)}. Click Push to upload.`,
    )
  }

  function getNavigationSaveState(): { savedDraft: DiaryEntry, localEntries: DiaryEntry[], didSave: boolean } {
    if (!isDraftDirty)
      return { savedDraft: draft, localEntries: entries, didSave: false }

    const savedDraft = getSavedDraftEntry(draft, new Date().toISOString())

    return {
      savedDraft,
      localEntries: upsertEntry(entries, savedDraft),
      didSave: true,
    }
  }

  function startNewEntry() {
    const { savedDraft, localEntries, didSave } = getNavigationSaveState()
    const next = makeBlankEntry()
    if (didSave)
      setEntries(localEntries)
    setDraft(next)
    setSelectedNotebook(getNotebookKey(next.diaryDate))
    setExpandedYears((current) => new Set([...current, getNotebookYear(next.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, getNotebookKey(next.diaryDate)]))
    setStatusMessage(didSave ? `Auto-saved ${formatDiaryDate(savedDraft.diaryDate)}. New entry` : 'New entry')
  }

  function selectEntry(entry: DiaryEntry, notebookKey: string) {
    setSelectedNotebook(notebookKey)

    if (draft.id === entry.id)
      return

    const { savedDraft, localEntries, didSave } = getNavigationSaveState()
    const nextEntry = localEntries.find((item) => item.id === entry.id) ?? entry

    if (didSave)
      setEntries(localEntries)

    setDraft(nextEntry)

    if (didSave)
      setStatusMessage(`Auto-saved ${formatDiaryDate(savedDraft.diaryDate)}. Opened ${formatDiaryDate(nextEntry.diaryDate)}.`)
  }

  async function importEvernoteFile(file: File) {
    try {
      setStatusMessage(`Importing ${file.name}...`)
      const text = await file.text()
      const parsedFile = parseEvernoteImportFile(text, file.name)

      if (!parsedFile.drafts.length) {
        setStatusMessage(getEmptyImportStatusMessage(file.name, parsedFile.encryptedCount, parsedFile.unsupportedCount))
        return
      }

      let nextEntries = entries
      let nextSettings = settings
      const importedEntries: DiaryEntry[] = []
      const addedTags = new Set<string>()
      let weatherFailureCount = 0

      for (const importDraft of parsedFile.drafts) {
        const result = await createDiaryEntryFromEvernoteImport(importDraft, nextEntries, nextSettings)

        nextEntries = upsertEntry(nextEntries, result.entry)
        nextSettings = result.settings
        importedEntries.push(result.entry)

        for (const tag of result.addedTags)
          addedTags.add(tag)

        if (!result.weatherFetched)
          weatherFailureCount += 1
      }

      const newestImportedEntry = [...importedEntries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]

      setSettings(nextSettings)
      saveSettings(nextSettings)
      setEntries(nextEntries)
      setDraft(newestImportedEntry)
      setSelectedNotebook(getNotebookKey(newestImportedEntry.diaryDate))
      setExpandedYears((current) => {
        const next = new Set(current)

        for (const entry of importedEntries)
          next.add(getNotebookYear(entry.diaryDate))

        return next
      })
      setExpandedMonths((current) => {
        const next = new Set(current)

        for (const entry of importedEntries)
          next.add(getNotebookKey(entry.diaryDate))

        return next
      })
      setStatusMessage(
        getImportStatusMessage(
          file.name,
          importedEntries.length,
          Array.from(addedTags),
          weatherFailureCount,
          parsedFile.encryptedCount,
          parsedFile.unsupportedCount,
        ),
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Evernote import failed.')
    }
  }

  function toggleYear(year: string) {
    setExpandedYears((current) => {
      const next = new Set(current)

      if (next.has(year))
        next.delete(year)
      else
        next.add(year)

      return next
    })
  }

  function toggleMonth(monthKey: string) {
    setSelectedNotebook(monthKey)
    setExpandedMonths((current) => {
      const next = new Set(current)

      if (next.has(monthKey))
        next.delete(monthKey)
      else
        next.add(monthKey)

      return next
    })
  }

  async function pushCurrentMonthEntries() {
    const now = new Date().toISOString()
    let normalizedDraft = draft
    let localEntries = entries

    if (isDraftDirty) {
      normalizedDraft = getSavedDraftEntry(draft, now)
      localEntries = upsertEntry(entries, normalizedDraft)
      setDraft(normalizedDraft)
      setEntries(localEntries)
    }

    const targetNotebook = getNotebookKey(normalizedDraft.diaryDate)
    const entriesToPush = localEntries.filter(
      (entry) => getNotebookKey(entry.diaryDate) === targetNotebook && isEntryUnsynced(entry),
    )

    setSelectedNotebook(targetNotebook)
    setExpandedYears((current) => new Set([...current, getNotebookYear(normalizedDraft.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, targetNotebook]))

    if (!entriesToPush.length) {
      setStatusMessage(`No unsynced entries in ${targetNotebook}.`)
      setPendingForcePushMonth(targetNotebook)
      return
    }

    await pushEntries(entriesToPush, localEntries, targetNotebook, normalizedDraft, false)
  }

  async function pushEntries(
    entriesToPush: DiaryEntry[],
    localEntries: DiaryEntry[],
    targetNotebook: string,
    normalizedDraft: DiaryEntry,
    isForcePush: boolean,
  ) {
    try {
      const normalizedSettings = normalizeSettings(settings)
      const syncTarget = normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'
      const action = isForcePush ? 'Force pushing' : 'Pushing'
      setStatusMessage(`${action} ${entriesToPush.length} ${entriesToPush.length === 1 ? 'entry' : 'entries'} to ${syncTarget}...`)

      if (normalizedSettings.syncProvider === 'git')
        await pushEntriesToGit(entriesToPush, normalizedSettings, localEntries)
      else
        await uploadEntriesToSynology(entriesToPush, normalizedSettings, localEntries)

      const syncedAt = new Date().toISOString()
      const pushedEntries = entriesToPush.map((entry) => ({ ...entry, syncedAt, isEdited: false }))
      const pushedDraft = pushedEntries.find((entry) => entry.id === normalizedDraft.id) ?? normalizedDraft
      const destination =
        normalizedSettings.syncProvider === 'git'
          ? getGitDisplayTarget(normalizedSettings)
          : getEntryMarkdownFolder(normalizedSettings.markdownFolder, normalizedDraft)

      setDraft(pushedDraft)
      setEntries((current) => upsertEntries(current, pushedEntries))
      setStatusMessage(
        `${isForcePush ? 'Force pushed' : 'Pushed'} ${entriesToPush.length} ${entriesToPush.length === 1 ? 'entry' : 'entries'} from ${targetNotebook} to ${destination}`,
      )
    } catch (error) {
      const normalizedSettings = normalizeSettings(settings)
      setStatusMessage(error instanceof Error ? error.message : `${normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'} push failed.`)
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings, entriesToPush[0] ?? normalizedDraft))
    }
  }

  async function forcePushMonth(monthKey: string) {
    setPendingForcePushMonth(null)
    const monthEntries = entries.filter((entry) => getNotebookKey(entry.diaryDate) === monthKey)

    if (!monthEntries.length) {
      setStatusMessage(`No entries in ${monthKey}.`)
      return
    }

    const normalizedDraft = monthEntries.find((entry) => entry.id === draft.id) ?? monthEntries[0]
    await pushEntries(monthEntries, entries, monthKey, normalizedDraft, true)
  }

  async function pullEntriesFromNas() {
    try {
      const normalizedSettings = normalizeSettings(settings)
      const syncTarget = normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'
      let localEntries = entries

      if (isDraftDirty) {
        const savedDraft = getSavedDraftEntry(draft, new Date().toISOString())
        localEntries = upsertEntry(entries, savedDraft)
        setDraft(savedDraft)
        setEntries(localEntries)
      }

      setStatusMessage(`Pulling Markdown entries from ${syncTarget}...`)
      const pulledEntries =
        normalizedSettings.syncProvider === 'git'
          ? await pullEntriesFromGit(normalizedSettings)
          : await downloadEntriesFromSynology(normalizedSettings)

      if (!pulledEntries.length) {
        const source =
          normalizedSettings.syncProvider === 'git'
            ? getGitDisplayTarget(normalizedSettings)
            : normalizedSettings.markdownFolder
        setStatusMessage(`No Markdown entries found in ${source}`)
        return
      }

      const pulledAt = new Date().toISOString()
      const syncedPulledEntries = pulledEntries.map((entry) => ({ ...entry, syncedAt: pulledAt, isEdited: false }))
      const conflicts = getPullConflicts(localEntries, syncedPulledEntries)

      if (conflicts.length) {
        const conflictDates = new Set(conflicts.map((conflict) => conflict.cloudEntry.diaryDate))
        setPendingPullReview({
          syncTarget,
          baseEntries: localEntries,
          resolvedEntries: syncedPulledEntries.filter((entry) => !conflictDates.has(entry.diaryDate)),
          conflicts,
          index: 0,
        })
        setStatusMessage(`Resolve ${conflicts.length} pull ${conflicts.length === 1 ? 'conflict' : 'conflicts'} from ${syncTarget}.`)
        return
      }

      finishPulledEntries(syncedPulledEntries, syncTarget, localEntries)
    } catch (error) {
      const normalizedSettings = normalizeSettings(settings)
      setStatusMessage(error instanceof Error ? error.message : `${normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'} pull failed.`)
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings))
    }
  }

  function finishPulledEntries(
    pulledEntries: DiaryEntry[],
    syncTarget: string,
    baseEntries: DiaryEntry[],
    resolvedConflictCount = 0,
  ) {
    const nextEntries = mergePulledEntries(baseEntries, pulledEntries)
    const newestPulledEntry = [...pulledEntries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]

    setEntries(nextEntries)
    setDraft(newestPulledEntry)
    setSelectedNotebook(getNotebookKey(newestPulledEntry.diaryDate))
    setExpandedYears((current) => {
      const next = new Set(current)

      for (const entry of pulledEntries)
        next.add(getNotebookYear(entry.diaryDate))

      return next
    })
    setExpandedMonths((current) => {
      const next = new Set(current)

      for (const entry of pulledEntries)
        next.add(getNotebookKey(entry.diaryDate))

      return next
    })

    const conflictText = resolvedConflictCount
      ? ` Resolved ${resolvedConflictCount} ${resolvedConflictCount === 1 ? 'conflict' : 'conflicts'}.`
      : ''
    setStatusMessage(
      `Pulled ${pulledEntries.length} Markdown ${pulledEntries.length === 1 ? 'entry' : 'entries'} from ${syncTarget}.${conflictText}`,
    )
  }

  function resolvePullConflict(useCloudEntry: boolean) {
    if (!pendingPullReview)
      return

    const conflict = pendingPullReview.conflicts[pendingPullReview.index]
    const selectedEntry = useCloudEntry ? conflict.cloudEntry : conflict.localEntry
    const resolvedEntries = [...pendingPullReview.resolvedEntries, selectedEntry]
    const nextIndex = pendingPullReview.index + 1

    if (nextIndex < pendingPullReview.conflicts.length) {
      setPendingPullReview({
        ...pendingPullReview,
        resolvedEntries,
        index: nextIndex,
      })
      return
    }

    setPendingPullReview(null)
    finishPulledEntries(
      resolvedEntries,
      pendingPullReview.syncTarget,
      pendingPullReview.baseEntries,
      pendingPullReview.conflicts.length,
    )
  }

  function exportEntry(entry: DiaryEntry) {
    downloadTextFile(getEntryMarkdownFileName(entry), serializeDiaryEntryMarkdown(entry), 'text/markdown')
    setContextMenu(null)
    setStatusMessage(`Exported ${formatDiaryDate(entry.diaryDate)}`)
  }

  function requestDeleteEntry(entry: DiaryEntry) {
    setContextMenu(null)

    if (hasCloudCopy(entry)) {
      setPendingDeleteEntry(entry)
      return
    }

    deleteLocalEntry(entry)
  }

  function deleteLocalEntry(entry: DiaryEntry) {
    const nextEntries = entries.filter((item) => item.id !== entry.id)
    setEntries(nextEntries)

    if (draft.id === entry.id) {
      const nextDraft = nextEntries[0] ?? makeBlankEntry()
      setDraft(nextDraft)
      setSelectedNotebook(nextEntries[0] ? getNotebookKey(nextDraft.diaryDate) : null)
    }

    setStatusMessage(`Deleted local entry: ${formatDiaryDate(entry.diaryDate)}`)
  }

  async function deleteEntryEverywhere(entry: DiaryEntry) {
    const normalizedSettings = normalizeSettings(settings)
    const nextEntries = entries.filter((item) => item.id !== entry.id)

    try {
      setPendingDeleteEntry(null)
      setStatusMessage(`Deleting ${formatDiaryDate(entry.diaryDate)} from ${normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'}...`)

      if (normalizedSettings.syncProvider === 'git')
        await deleteEntryFromGit(entry, normalizedSettings, nextEntries)
      else
        await deleteEntryFromSynology(entry, normalizedSettings, nextEntries)

      setEntries(nextEntries)

      if (draft.id === entry.id) {
        const nextDraft = nextEntries[0] ?? makeBlankEntry()
        setDraft(nextDraft)
        setSelectedNotebook(nextEntries[0] ? getNotebookKey(nextDraft.diaryDate) : null)
      }

      setStatusMessage(`Deleted ${formatDiaryDate(entry.diaryDate)} locally and from ${normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Delete failed.')
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings, entry))
    }
  }

  function persistSettings() {
    const normalizedSettings = normalizeSettings(settings)
    setSettings(normalizedSettings)
    saveSettings(normalizedSettings)
    setStatusMessage('Settings saved')
  }

  return (
    <main className="app-shell">
      <Sidebar
        draftId={draft.id}
        searchQuery={searchQuery}
        searchResultCount={searchResults.length}
        selectedNotebook={selectedNotebook}
        selectedNotebookCount={notebookEntries.length}
        notebookGroups={notebookGroups}
        expandedYears={expandedYears}
        expandedMonths={expandedMonths}
        isDraftDirty={isDraftDirty}
        unsavedEntryIds={unsavedEntryIds}
        contextMenu={contextMenu}
        statusMessage={sidebarStatusMessage}
        isSettingsOpen={currentPage === 'settings'}
        onNewEntry={startNewEntry}
        onImportEvernoteFile={(file) => {
          void importEvernoteFile(file)
        }}
        onSync={pushCurrentMonthEntries}
        onPull={pullEntriesFromNas}
        onOpenSettings={() => setCurrentPage('settings')}
        onSearchChange={setSearchQuery}
        onSelectNotebook={setSelectedNotebook}
        onSelectEntry={selectEntry}
        onToggleYear={toggleYear}
        onToggleMonth={toggleMonth}
        onOpenContextMenu={setContextMenu}
        onCloseContextMenu={() => setContextMenu(null)}
        onExportEntry={exportEntry}
        onDeleteEntry={requestDeleteEntry}
      />

      <section className="editor">
        {currentPage === 'settings' ? (
          <SettingsPage
            settings={settings}
            draft={draft}
            entries={entries}
            onSettingsChange={setSettings}
            onDraftChange={setDraft}
            onEntriesChange={setEntries}
            onStatusChange={setStatusMessage}
            onSave={persistSettings}
            onBack={() => setCurrentPage('diary')}
          />
        ) : (
          <>
            <MetadataEditor
              draft={draft}
              entries={entries}
              settings={settings}
              onSettingsChange={setSettings}
              onUpdateDraft={updateDraft}
              onUpdateDraftIfCurrent={updateDraftIfCurrent}
              onDraftChange={setDraft}
              onEntriesChange={setEntries}
              onStatusChange={setStatusMessage}
              onErrorLog={setSyncErrorLog}
            />

            <EntryEditor
              content={draft.content}
              onContentChange={(content) => updateDraft({ content })}
              saveLabel={editedEntryCount > 1 ? 'Save All' : 'Save'}
              onSave={saveEditedEntries}
            />
          </>
        )}
      </section>
      {pendingDeleteEntry && (
        <DeleteEntryDialog
          entry={pendingDeleteEntry}
          syncProvider={normalizeSettings(settings).syncProvider}
          onCancel={() => setPendingDeleteEntry(null)}
          onDeleteLocal={() => {
            deleteLocalEntry(pendingDeleteEntry)
            setPendingDeleteEntry(null)
          }}
          onDeleteEverywhere={() => {
            void deleteEntryEverywhere(pendingDeleteEntry)
          }}
        />
      )}
      {pendingForcePushMonth && (
        <ForcePushDialog
          monthKey={pendingForcePushMonth}
          entryCount={entries.filter((entry) => getNotebookKey(entry.diaryDate) === pendingForcePushMonth).length}
          onCancel={() => setPendingForcePushMonth(null)}
          onConfirm={() => {
            void forcePushMonth(pendingForcePushMonth)
          }}
        />
      )}
      {pendingPullReview && (
        <PullConflictDialog
          localEntry={pendingPullReview.conflicts[pendingPullReview.index].localEntry}
          cloudEntry={pendingPullReview.conflicts[pendingPullReview.index].cloudEntry}
          conflictIndex={pendingPullReview.index}
          conflictCount={pendingPullReview.conflicts.length}
          onCancel={() => {
            setPendingPullReview(null)
            setStatusMessage('Pull canceled.')
          }}
          onUseLocal={() => resolvePullConflict(false)}
          onUseCloud={() => resolvePullConflict(true)}
        />
      )}
      {syncErrorLog && <SyncErrorDialog log={syncErrorLog} onClose={() => setSyncErrorLog(null)} />}
    </main>
  )
}

function getSavedDraftEntry(entry: DiaryEntry, savedAt: string): DiaryEntry {
  const normalizedTags = normalizeTags(entry.tags)
  const normalizedCities = normalizeLocationColors(entry.locationColors, entry.cities)

  return {
    ...entry,
    tags: normalizedTags,
    ...getNormalizedDailyWeatherFields(entry),
    tagColors: normalizeTagColors(entry.tagColors, normalizedTags),
    locationColors: normalizedCities,
    updatedAt: savedAt,
    savedAt,
    syncedAt: null,
    isEdited: true,
  }
}

function getEditedEntryCount(entries: DiaryEntry[], draft: DiaryEntry): number {
  const editedEntryIds = new Set(entries.filter(isEntryUnsynced).map((entry) => entry.id))

  if (draft.isEdited || !entries.some((entry) => entry.id === draft.id && entry.updatedAt === draft.updatedAt))
    editedEntryIds.add(draft.id)

  return editedEntryIds.size
}

function getUnsavedEntryIds(entries: DiaryEntry[], draft: DiaryEntry): Set<string> {
  return new Set(getEntriesWithDraft(entries, draft).filter(isEntryUnsaved).map((entry) => entry.id))
}

function getUnuploadedEntryCount(entries: DiaryEntry[], draft: DiaryEntry): number {
  return getEntriesWithDraft(entries, draft).filter(isEntryUnsynced).length
}

function getEntriesWithDraft(entries: DiaryEntry[], draft: DiaryEntry): DiaryEntry[] {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  entriesById.set(draft.id, draft)
  return Array.from(entriesById.values())
}

function isEntryUnsaved(entry: DiaryEntry): boolean {
  return !entry.savedAt || entry.savedAt < entry.updatedAt
}

function getSidebarStatusMessage(unsavedCount: number, unuploadedCount: number): string | null {
  if (!unsavedCount && !unuploadedCount)
    return null

  return `Unsaved ${unsavedCount} · Unuploaded ${unuploadedCount}`
}

function getPullConflicts(localEntries: DiaryEntry[], cloudEntries: DiaryEntry[]): PullConflict[] {
  const localEntriesByDate = new Map(localEntries.map((entry) => [entry.diaryDate, entry]))

  return cloudEntries
    .map((cloudEntry) => {
      const localEntry = localEntriesByDate.get(cloudEntry.diaryDate)

      if (!localEntry || normalizeBodyText(localEntry.content) === normalizeBodyText(cloudEntry.content))
        return null

      return {
        localEntry,
        cloudEntry,
      }
    })
    .filter((conflict): conflict is PullConflict => Boolean(conflict))
}

function normalizeBodyText(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function getImportStatusMessage(
  fileName: string,
  importedCount: number,
  addedTags: string[],
  weatherFailureCount: number,
  encryptedCount: number,
  unsupportedCount: number,
): string {
  const detailParts = [
    addedTags.length ? `Added ${addedTags.length} activity ${addedTags.length === 1 ? 'tag' : 'tags'}` : '',
    weatherFailureCount ? `${weatherFailureCount} weather ${weatherFailureCount === 1 ? 'fetch' : 'fetches'} failed` : '',
    encryptedCount ? `Skipped ${encryptedCount} encrypted ${encryptedCount === 1 ? 'note' : 'notes'}` : '',
    unsupportedCount ? `Skipped ${unsupportedCount} unsupported ${unsupportedCount === 1 ? 'note' : 'notes'}` : '',
  ].filter(Boolean)
  const details = detailParts.length ? ` ${detailParts.join('. ')}.` : ''

  return `Imported ${importedCount} ${importedCount === 1 ? 'entry' : 'entries'} from ${fileName}.${details} Click Push to upload.`
}

function getEmptyImportStatusMessage(fileName: string, encryptedCount: number, unsupportedCount: number): string {
  if (encryptedCount)
    return `No entries imported from ${fileName}. ${encryptedCount} encrypted ${encryptedCount === 1 ? 'note uses' : 'notes use'} base64:aes, which cannot be read without the export key.`

  if (unsupportedCount)
    return `No entries imported from ${fileName}. ${unsupportedCount} unsupported ${unsupportedCount === 1 ? 'note' : 'notes'} found.`

  return `No importable notes found in ${fileName}.`
}
