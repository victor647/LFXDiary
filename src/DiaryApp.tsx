import { useEffect, useMemo, useState } from 'react'
import { DeleteEntryDialog } from './components/DeleteEntryDialog'
import { EntryEditor } from './components/EntryEditor'
import { ForcePushDialog } from './components/ForcePushDialog'
import { MetadataEditor } from './components/MetadataEditor'
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

  function updateDraft(patch: Partial<DiaryEntry>) {
    setDraft((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
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
      }
    })
  }

  function saveDraft() {
    const now = new Date().toISOString()
    const normalizedTags = normalizeTags(draft.tags)
    const normalizedCities = normalizeLocationColors(draft.locationColors, draft.cities)
    const normalizedDraft = {
      ...draft,
      tags: normalizedTags,
      ...getNormalizedDailyWeatherFields(draft),
      tagColors: normalizeTagColors(draft.tagColors, normalizedTags),
      locationColors: normalizedCities,
      updatedAt: now,
      savedAt: now,
      syncedAt: null,
    }

    setDraft(normalizedDraft)
    setEntries((current) => upsertEntry(current, normalizedDraft))
    setSelectedNotebook(getNotebookKey(normalizedDraft.diaryDate))
    setExpandedYears((current) => new Set([...current, getNotebookYear(normalizedDraft.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, getNotebookKey(normalizedDraft.diaryDate)]))
    setStatusMessage(`Saved locally: ${formatDiaryDate(normalizedDraft.diaryDate)}. Click Push to upload.`)
  }

  function startNewEntry() {
    const next = makeBlankEntry()
    setDraft(next)
    setSelectedNotebook(getNotebookKey(next.diaryDate))
    setExpandedYears((current) => new Set([...current, getNotebookYear(next.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, getNotebookKey(next.diaryDate)]))
    setStatusMessage('New entry')
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
      const normalizedTags = normalizeTags(draft.tags)
      const normalizedCities = normalizeLocationColors(draft.locationColors, draft.cities)
      normalizedDraft = {
        ...draft,
        tags: normalizedTags,
        ...getNormalizedDailyWeatherFields(draft),
        tagColors: normalizeTagColors(draft.tagColors, normalizedTags),
        locationColors: normalizedCities,
        updatedAt: now,
        savedAt: now,
        syncedAt: null,
      }
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
      const pushedEntries = entriesToPush.map((entry) => ({ ...entry, syncedAt }))
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
      const syncedPulledEntries = pulledEntries.map((entry) => ({ ...entry, syncedAt: pulledAt }))
      const nextEntries = mergePulledEntries(entries, syncedPulledEntries)
      const newestPulledEntry = [...syncedPulledEntries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]

      setEntries(nextEntries)
      setDraft(newestPulledEntry)
      setSelectedNotebook(getNotebookKey(newestPulledEntry.diaryDate))
      setExpandedYears((current) => {
        const next = new Set(current)

        for (const entry of syncedPulledEntries)
          next.add(getNotebookYear(entry.diaryDate))

        return next
      })
      setExpandedMonths((current) => {
        const next = new Set(current)

        for (const entry of syncedPulledEntries)
          next.add(getNotebookKey(entry.diaryDate))

        return next
      })
      setStatusMessage(`Pulled ${syncedPulledEntries.length} Markdown ${syncedPulledEntries.length === 1 ? 'entry' : 'entries'} from ${syncTarget}`)
    } catch (error) {
      const normalizedSettings = normalizeSettings(settings)
      setStatusMessage(error instanceof Error ? error.message : `${normalizedSettings.syncProvider === 'git' ? 'Git' : 'NAS'} pull failed.`)
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings))
    }
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
        contextMenu={contextMenu}
        statusMessage={statusMessage}
        isSettingsOpen={currentPage === 'settings'}
        onNewEntry={startNewEntry}
        onSync={pushCurrentMonthEntries}
        onPull={pullEntriesFromNas}
        onOpenSettings={() => setCurrentPage('settings')}
        onSearchChange={setSearchQuery}
        onSelectNotebook={setSelectedNotebook}
        onSelectEntry={(entry, notebookKey) => {
          setDraft(entry)
          setSelectedNotebook(notebookKey)
        }}
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
            onSettingsChange={setSettings}
            onSave={persistSettings}
            onBack={() => setCurrentPage('diary')}
          />
        ) : (
          <>
            <MetadataEditor
              draft={draft}
              entries={entries}
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
              onSave={saveDraft}
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
      {syncErrorLog && <SyncErrorDialog log={syncErrorLog} onClose={() => setSyncErrorLog(null)} />}
    </main>
  )
}
