import { useEffect, useMemo, useRef, useState } from 'react'
import { DeleteEntryDialog } from './components/DeleteEntryDialog'
import { EntryEditor } from './components/EntryEditor'
import { ForcePushDialog } from './components/ForcePushDialog'
import { MetadataEditor } from './components/MetadataEditor'
import { PullConflictDialog } from './components/PullConflictDialog'
import { PushSuccessDialog } from './components/PushSuccessDialog'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { SyncErrorDialog } from './components/SyncErrorDialog'
import { SyncProgressDialog } from './components/SyncProgressDialog'
import { UnsavedCloseDialog } from './components/UnsavedCloseDialog'
import { getDiarySyncAdapter } from './application/diarySync'
import type { DiarySyncAdapter } from './application/diarySync'
import {
  DIARY_CATALOG_FILE_NAME,
  applyDiaryCatalogToSettings,
  applySettingsToDiaryCatalog,
  deserializeDiaryCatalog,
  removeDiaryCatalogEntry,
  serializeDiaryCatalog,
  syncDiaryCatalogEntry,
} from './domain/diaryCatalog'
import { serializeDiaryEntryMarkdown } from './domain/diaryEntrySerialization'
import { activityTagManager, locationTagManager, personTagManager } from './domain/tagModels'
import type { AppSettings, DiaryCatalog, DiaryEntry, TagFilter, TagFilterOption } from './domain/types'
import { formatDiaryDate, getNotebookKey, getNotebookYear, toDateInputValue } from './utils/date'
import {
  getNormalizedDailyWeatherFields,
  hasCloudCopy,
  isEntryUnsynced,
  upsertEntries,
} from './utils/diaryEntryHelpers'
import {
  groupEntriesByMonthIndex,
  getMonthIndexEntryCount,
  loadAllStoredEntries,
  loadInitialDiaryEntries,
  loadNotebookEntries,
  loadStoredDiaryCatalog,
  makeBlankEntry,
  mergePulledEntries,
  normalizeLocationColors,
  saveLoadedEntries,
  saveStoredDiaryCatalog,
  upsertEntry,
} from './utils/entries'
import { createDiaryEntryFromEvernoteImport, parseEvernoteImportFile } from './utils/evernoteImport'
import {
  downloadTextFile,
  getEntryMarkdownFileName,
} from './utils/files'
import { loadSettings, normalizeSettings, saveSettings } from './utils/settings'
import { formatSyncErrorLog } from './utils/syncErrorLog'
import { normalizePersonTag, normalizePersonTags, normalizeTagColors, normalizeTags } from './utils/tags'

type PullConflict = {
  localEntry: DiaryEntry
  cloudEntry: DiaryEntry
}

type PendingPullReview = {
  syncTarget: string
  target: SyncTarget
  targetLabel: string
  baseEntries: DiaryEntry[]
  resolvedEntries: DiaryEntry[]
  conflicts: PullConflict[]
  index: number
}

type SyncProgress = {
  target: string
  message: string
  title?: string
  current?: number
  total?: number
}

type SyncTarget =
  | { kind: 'month'; key: string }
  | { kind: 'year'; year: string }

export function DiaryApp() {
  const [currentPage, setCurrentPage] = useState<'diary' | 'settings' | 'catalog'>('diary')
  const [settings, setSettings] = useState(loadSettings)
  const initialDiaryLoad = useMemo(loadInitialDiaryEntries, [])
  const initialNotebookKey = initialDiaryLoad.monthKey ?? getNotebookKey(toDateInputValue(new Date()))
  const [monthIndex, setMonthIndex] = useState(initialDiaryLoad.monthIndex)
  const [loadedMonthKeys, setLoadedMonthKeys] = useState<Set<string>>(() => new Set(initialDiaryLoad.monthKey ? [initialDiaryLoad.monthKey] : []))
  const [entries, setEntries] = useState<DiaryEntry[]>(initialDiaryLoad.entries)
  const [diaryCatalog, setDiaryCatalog] = useState<DiaryCatalog>(loadStoredDiaryCatalog)
  const [draft, setDraft] = useState<DiaryEntry>(() => entries[0] ?? makeBlankEntry())
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<TagFilter>({ kind: '', color: '', tag: '' })
  const [statusMessage, setStatusMessage] = useState('Ready')
  const [syncErrorLog, setSyncErrorLog] = useState<string | null>(null)
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(initialDiaryLoad.monthKey)
  const [syncTarget, setSyncTarget] = useState<SyncTarget>(() => ({ kind: 'month', key: initialNotebookKey }))
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    entry: DiaryEntry
  } | null>(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<DiaryEntry | null>(null)
  const [pendingForcePushTarget, setPendingForcePushTarget] = useState<SyncTarget | null>(null)
  const [pendingPullReview, setPendingPullReview] = useState<PendingPullReview | null>(null)
  const [pushedDiaryDates, setPushedDiaryDates] = useState<string[] | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [pendingCloseConfirmation, setPendingCloseConfirmation] = useState(false)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set([getNotebookYear(initialNotebookKey)]))
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set(initialDiaryLoad.monthKey ? [initialDiaryLoad.monthKey] : []))
  const allowCloseRef = useRef(false)
  const hasUnsavedEntriesRef = useRef(false)

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate)),
    [entries],
  )

  const tagFilterOptions = useMemo(() => getTagFilterOptions(diaryCatalog, settings), [diaryCatalog, settings])
  const tagFilterEntryReferences = useMemo(() => getTagFilterEntryReferences(diaryCatalog, tagFilter), [diaryCatalog, tagFilter])
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return sortedEntries.filter((entry) => {
      if (tagFilterEntryReferences && !tagFilterEntryReferences.has(entry.diaryDate) && !tagFilterEntryReferences.has(entry.id))
        return false

      if (!query)
        return true

      const contentText = entry.content.toLowerCase()

      return contentText.includes(query)
    })
  }, [searchQuery, sortedEntries, tagFilterEntryReferences])

  const notebookEntries = useMemo(() => {
    if (!selectedNotebook)
      return searchResults

    return searchResults.filter((entry) => getNotebookKey(entry.diaryDate) === selectedNotebook)
  }, [searchResults, selectedNotebook])

  const notebookGroups = useMemo(() => groupEntriesByMonthIndex(monthIndex, searchResults), [monthIndex, searchResults])
  const hasSearchFilter = Boolean(searchQuery.trim() || tagFilter.kind)
  const sidebarSearchResultCount = hasSearchFilter ? searchResults.length : getMonthIndexEntryCount(monthIndex)
  const selectedNotebookCount = selectedNotebook
    ? hasSearchFilter ? notebookEntries.length : getMonthIndexEntryCount(monthIndex, selectedNotebook)
    : notebookEntries.length
  const draftSavedEntry = useMemo(() => entries.find((entry) => entry.id === draft.id), [draft.id, entries])
  const isDraftDirty = !draftSavedEntry || draftSavedEntry.updatedAt !== draft.updatedAt
  const editedEntryCount = useMemo(() => getEditedEntryCount(entries, draft), [draft, entries])
  const unsavedEntryIds = useMemo(() => getUnsavedEntryIds(entries, draft), [draft, entries])
  const unuploadedEntryCount = useMemo(() => getUnuploadedEntryCount(entries, draft), [draft, entries])
  const richTextPeople = useMemo(() => {
    const people = new Set<string>()
    const personColors: Record<string, string> = {}

    for (const rawPerson of draft.people ?? []) {
      const person = normalizePersonTag(rawPerson)

      if (!person)
        continue

      const color = getSettingsPersonColor(settings, person) ?? draft.personColors?.[person]

      people.add(person)

      if (color)
        personColors[person] = color
    }

    return {
      people: Array.from(people),
      personColors,
    }
  }, [draft.people, draft.personColors, settings])
  const hasUnsavedEntries = isDraftDirty || unsavedEntryIds.size > 0
  const closeUnsavedCount = hasUnsavedEntries ? Math.max(1, unsavedEntryIds.size) : 0
  const sidebarStatusMessage = getSidebarStatusMessage(unsavedEntryIds.size, unuploadedEntryCount) ?? statusMessage

  useEffect(() => {
    setDraft((current) => syncEntryPersonColors(current, settings))
  }, [draft.id, settings])

  useEffect(() => {
    hasUnsavedEntriesRef.current = hasUnsavedEntries
  }, [hasUnsavedEntries])

  useEffect(() => {
    function confirmBeforeClose(event: BeforeUnloadEvent) {
      if (allowCloseRef.current || !hasUnsavedEntriesRef.current)
        return

      event.preventDefault()
      event.returnValue = ''
      setPendingCloseConfirmation(true)
    }

    window.addEventListener('beforeunload', confirmBeforeClose)

    return () => window.removeEventListener('beforeunload', confirmBeforeClose)
  }, [])

  function updateDraft(patch: Partial<DiaryEntry>) {
    applyDraft((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      isEdited: true,
    }))
  }

  function updateDraftIfCurrent(entryId: string, diaryDate: string, patch: Partial<DiaryEntry>) {
    applyDraft((current) => {
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

  function applyEntries(
    nextEntries: DiaryEntry[] | ((current: DiaryEntry[]) => DiaryEntry[]),
    nextLoadedMonthKeys = loadedMonthKeys,
  ) {
    setEntries((current) => {
      const resolvedEntries = typeof nextEntries === 'function' ? nextEntries(current) : nextEntries
      const monthsToSave = new Set(nextLoadedMonthKeys)
      const resolvedEntryIds = new Set(resolvedEntries.map((entry) => entry.id))
      const resolvedEntryDates = new Set(resolvedEntries.map((entry) => entry.diaryDate))
      const removedEntryDates = current
        .filter((entry) => !resolvedEntryIds.has(entry.id) && !resolvedEntryDates.has(entry.diaryDate))
        .map((entry) => entry.diaryDate)

      for (const entry of resolvedEntries)
        monthsToSave.add(getNotebookKey(entry.diaryDate))

      setMonthIndex(saveLoadedEntries(resolvedEntries, monthsToSave))
      setDiaryCatalog((currentCatalog) => {
        let nextCatalog = currentCatalog

        for (const diaryDate of removedEntryDates)
          nextCatalog = removeDiaryCatalogEntry(nextCatalog, diaryDate)

        for (const entry of resolvedEntries)
          nextCatalog = syncDiaryCatalogEntry(nextCatalog, entry)

        if (resolvedEntryIds.has(draft.id))
          nextCatalog = syncDiaryCatalogEntry(nextCatalog, draft)

        saveStoredDiaryCatalog(nextCatalog)
        return nextCatalog
      })
      return resolvedEntries
    })
  }

  function applyDraft(nextDraft: DiaryEntry | ((current: DiaryEntry) => DiaryEntry)) {
    setDraft((current) => {
      const resolvedDraft = typeof nextDraft === 'function' ? nextDraft(current) : nextDraft
      setDiaryCatalog((currentCatalog) => {
        const nextCatalog = syncDiaryCatalogEntry(currentCatalog, resolvedDraft)

        if (entries.some((entry) => entry.id === resolvedDraft.id))
          saveStoredDiaryCatalog(nextCatalog)

        return nextCatalog
      })
      return resolvedDraft
    })
  }

  function applyDiaryCatalog(nextCatalog: DiaryCatalog) {
    setDiaryCatalog(nextCatalog)
    saveStoredDiaryCatalog(nextCatalog)
  }

  function loadMonthIfNeeded(monthKey: string): Set<string> {
    if (loadedMonthKeys.has(monthKey))
      return loadedMonthKeys

    const nextLoadedMonthKeys = new Set([...loadedMonthKeys, monthKey])
    const monthEntries = loadNotebookEntries(monthKey)
    setLoadedMonthKeys(nextLoadedMonthKeys)
    applyEntries((current) => upsertEntries(current, monthEntries), nextLoadedMonthKeys)
    return nextLoadedMonthKeys
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

    applyDraft(normalizedDraft)
    applyEntries(nextEntries)
    setSelectedNotebook(getNotebookKey(normalizedDraft.diaryDate))
    setSyncTarget({ kind: 'month', key: getNotebookKey(normalizedDraft.diaryDate) })
    setExpandedYears((current) => new Set([...current, getNotebookYear(normalizedDraft.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, getNotebookKey(normalizedDraft.diaryDate)]))
    setStatusMessage(
      savedCount > 1
        ? `Saved ${savedCount} edited entries locally. Click Push to upload.`
        : `Saved locally: ${formatDiaryDate(normalizedDraft.diaryDate)}. Click Push to upload.`,
    )
  }

  function saveAndClose() {
    saveEditedEntries()
    closeWindowWithoutPrompt()
  }

  function discardAndClose() {
    closeWindowWithoutPrompt()
  }

  function closeWindowWithoutPrompt() {
    allowCloseRef.current = true
    setPendingCloseConfirmation(false)
    window.setTimeout(() => window.close(), 0)
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
    const nextMonthKey = getNotebookKey(next.diaryDate)
    if (didSave)
      applyEntries(localEntries)
    if (!loadedMonthKeys.has(nextMonthKey))
      setLoadedMonthKeys((current) => new Set([...current, nextMonthKey]))
    applyDraft(next)
    setSelectedNotebook(nextMonthKey)
    setSyncTarget({ kind: 'month', key: nextMonthKey })
    setExpandedYears((current) => new Set([...current, getNotebookYear(next.diaryDate)]))
    setExpandedMonths((current) => new Set([...current, nextMonthKey]))
    setStatusMessage(didSave ? `Auto-saved ${formatDiaryDate(savedDraft.diaryDate)}. New entry` : 'New entry')
  }

  function selectEntry(entry: DiaryEntry, notebookKey: string) {
    setSelectedNotebook(notebookKey)

    if (draft.id === entry.id)
      return

    const { savedDraft, localEntries, didSave } = getNavigationSaveState()
    const nextEntry = localEntries.find((item) => item.id === entry.id) ?? entry

    if (didSave)
      applyEntries(localEntries)

    applyDraft(syncEntryPersonColors(nextEntry, settings))

    if (didSave)
      setStatusMessage(`Auto-saved ${formatDiaryDate(savedDraft.diaryDate)}. Opened ${formatDiaryDate(nextEntry.diaryDate)}.`)
  }

  async function importEvernoteFiles(files: File[]) {
    try {
      const sourceLabel = formatImportSourceLabel(files)
      const importMessage = `Importing ${sourceLabel}...`
      setStatusMessage(importMessage)
      setSyncProgress({ target: 'Notes', title: 'Importing Notes', message: importMessage })

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
        setStatusMessage(readMessage)
        setSyncProgress({ target: 'Notes', title: 'Importing Notes', message: readMessage })
        const text = await file.text()
        const parsedFile = parseEvernoteImportFile(text, file.name)
        encryptedCount += parsedFile.encryptedCount
        unsupportedCount += parsedFile.unsupportedCount
        totalDraftCount += parsedFile.drafts.length

        for (const importDraft of parsedFile.drafts) {
          importedDraftCount += 1
          const progressMessage = `Importing ${importedDraftCount} of ${totalDraftCount} from ${sourceLabel}...`
          setStatusMessage(progressMessage)
          setSyncProgress({ target: 'Notes', title: 'Importing Notes', message: progressMessage })
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
        setStatusMessage(getEmptyImportStatusMessage(sourceLabel, encryptedCount, unsupportedCount))
        return
      }

      const newestImportedEntry = [...importedEntries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]

      setSettings(nextSettings)
      saveSettings(nextSettings)
      applyEntries(nextEntries)
      applyDraft(newestImportedEntry)
      setSelectedNotebook(getNotebookKey(newestImportedEntry.diaryDate))
      setSyncTarget({ kind: 'month', key: getNotebookKey(newestImportedEntry.diaryDate) })
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
      setStatusMessage(error instanceof Error ? error.message : 'Evernote import failed.')
    } finally {
      setSyncProgress(null)
    }
  }

  function toggleYear(year: string) {
    setSyncTarget({ kind: 'year', year })
    setSelectedNotebook(null)
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
    setSyncTarget({ kind: 'month', key: monthKey })
    setSelectedNotebook(monthKey)
    const willExpand = !expandedMonths.has(monthKey)

    if (willExpand)
      loadMonthIfNeeded(monthKey)

    setExpandedMonths((current) => {
      const next = new Set(current)

      if (next.has(monthKey))
        next.delete(monthKey)
      else
        next.add(monthKey)

      return next
    })
  }

  function revealSyncTarget(target: SyncTarget) {
    setSyncTarget(target)

    if (target.kind === 'month') {
      setSelectedNotebook(target.key)
      setExpandedYears((current) => new Set([...current, getNotebookYear(target.key)]))
      setExpandedMonths((current) => new Set([...current, target.key]))
      return
    }

    setSelectedNotebook(null)
    setExpandedYears((current) => new Set([...current, target.year]))
  }

  async function pushSelectedEntries() {
    const now = new Date().toISOString()
    let normalizedDraft = draft
    let localEntries = entries

    if (isDraftDirty) {
      normalizedDraft = getSavedDraftEntry(draft, now)
      localEntries = upsertEntry(entries, normalizedDraft)
      applyDraft(normalizedDraft)
      applyEntries(localEntries)
    }

    const target = syncTarget
    const targetLabel = getSyncTargetLabel(target)
    const entriesToPush = getSyncTargetEntries(loadAllStoredEntries(), target).filter(isEntryUnsynced)

    revealSyncTarget(target)

    if (!entriesToPush.length) {
      setStatusMessage(`No unsynced entries in ${targetLabel}.`)
      setPendingForcePushTarget(target)
      return
    }

    await pushEntries(entriesToPush, targetLabel, normalizedDraft, false)
  }

  async function pushEntries(
    entriesToPush: DiaryEntry[],
    targetLabel: string,
    normalizedDraft: DiaryEntry,
    isForcePush: boolean,
  ) {
    try {
      const normalizedSettings = normalizeSettings(settings)
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      const syncTarget = syncAdapter.label
      const action = isForcePush ? 'Force pushing' : 'Pushing'
      const progressMessage = `${action} ${entriesToPush.length} ${entriesToPush.length === 1 ? 'entry' : 'entries'} to ${syncTarget}...`
      setStatusMessage(progressMessage)
      setSyncProgress({ target: syncTarget, message: progressMessage, current: 0, total: entriesToPush.length })

      await syncAdapter.pushEntries(entriesToPush, normalizedSettings, loadAllStoredEntries(), (current, total) => {
        setSyncProgress({ target: syncTarget, message: progressMessage, current, total })
      })

      const syncedAt = new Date().toISOString()
      const pushedEntries = entriesToPush.map((entry) => ({ ...entry, syncedAt, isEdited: false }))
      const destination = syncAdapter.getPushDestination(normalizedSettings, entriesToPush[0] ?? normalizedDraft)

      applyDraft((current) => pushedEntries.find((entry) => entry.id === current.id) ?? current)
      applyEntries((current) => upsertEntries(current, pushedEntries))
      setPushedDiaryDates(pushedEntries.map((entry) => entry.diaryDate))
      setStatusMessage(
        `${isForcePush ? 'Force pushed' : 'Pushed'} ${entriesToPush.length} ${entriesToPush.length === 1 ? 'entry' : 'entries'} from ${targetLabel} to ${destination}`,
      )
    } catch (error) {
      const normalizedSettings = normalizeSettings(settings)
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      setStatusMessage(error instanceof Error ? error.message : `${syncAdapter.label} push failed.`)
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings, entriesToPush[0] ?? normalizedDraft))
    } finally {
      setSyncProgress(null)
    }
  }

  async function forcePushTarget(target: SyncTarget) {
    setPendingForcePushTarget(null)
    const targetLabel = getSyncTargetLabel(target)
    const targetEntries = getSyncTargetEntries(loadAllStoredEntries(), target)

    if (!targetEntries.length) {
      setStatusMessage(`No entries in ${targetLabel}.`)
      return
    }

    revealSyncTarget(target)
    const normalizedDraft = targetEntries.find((entry) => entry.id === draft.id) ?? targetEntries[0]
    await pushEntries(targetEntries, targetLabel, normalizedDraft, true)
  }

  async function pushSingleEntry(entry: DiaryEntry) {
    setContextMenu(null)
    const now = new Date().toISOString()
    let normalizedDraft = draft
    let localEntries = entries

    if (isDraftDirty) {
      normalizedDraft = getSavedDraftEntry(draft, now)
      localEntries = upsertEntry(entries, normalizedDraft)
      applyDraft(normalizedDraft)
      applyEntries(localEntries)
    }

    const entryToPush = localEntries.find((item) => item.id === entry.id) ?? entry
    const targetNotebook = getNotebookKey(entryToPush.diaryDate)
    setSelectedNotebook(targetNotebook)
    setSyncTarget({ kind: 'month', key: targetNotebook })
    setExpandedYears((current) => new Set([...current, getNotebookYear(targetNotebook)]))
    setExpandedMonths((current) => new Set([...current, targetNotebook]))
    await pushEntries([entryToPush], targetNotebook, normalizedDraft, false)
  }

  async function pullEntriesFromNas() {
    try {
      const normalizedSettings = normalizeSettings(settings)
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      const syncLabel = syncAdapter.label
      const target = syncTarget
      const targetLabel = getSyncTargetLabel(target)
      const targetNotebooks = getSyncTargetNotebookKeys(target)
      let localEntries = entries

      if (isDraftDirty) {
        const savedDraft = getSavedDraftEntry(draft, new Date().toISOString())
        localEntries = upsertEntry(entries, savedDraft)
        applyDraft(savedDraft)
        applyEntries(localEntries)
      }

      revealSyncTarget(target)
      const progressMessage = `Pulling Markdown entries from ${targetLabel} on ${syncLabel}...`
      setStatusMessage(progressMessage)
      setSyncProgress({ target: syncLabel, message: progressMessage })
      const pulledEntries = await syncAdapter.pullNotebookEntries(normalizedSettings, targetNotebooks, (current, total) => {
        setSyncProgress({ target: syncLabel, message: progressMessage, current, total })
      })

      if (!pulledEntries.length) {
        setStatusMessage(`No Markdown entries found in ${targetLabel} on ${syncLabel}.`)
        return
      }

      const pulledAt = new Date().toISOString()
      const syncedPulledEntries = pulledEntries.map((entry) => ({ ...entry, syncedAt: pulledAt, isEdited: false }))
      const conflicts = getPullConflicts(localEntries, syncedPulledEntries)

      if (conflicts.length) {
        const conflictDates = new Set(conflicts.map((conflict) => conflict.cloudEntry.diaryDate))
        setPendingPullReview({
          syncTarget: syncLabel,
          target,
          targetLabel,
          baseEntries: localEntries,
          resolvedEntries: syncedPulledEntries.filter((entry) => !conflictDates.has(entry.diaryDate)),
          conflicts,
          index: 0,
        })
        setStatusMessage(`Resolve ${conflicts.length} pull ${conflicts.length === 1 ? 'conflict' : 'conflicts'} from ${syncLabel}.`)
        return
      }

      finishPulledEntries(syncedPulledEntries, syncLabel, localEntries, target)
    } catch (error) {
      const normalizedSettings = normalizeSettings(settings)
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      setStatusMessage(error instanceof Error ? error.message : `${syncAdapter.label} pull failed.`)
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings, undefined, getSyncTargetPullSource(syncAdapter, normalizedSettings, syncTarget)))
    } finally {
      setSyncProgress(null)
    }
  }

  async function pullSingleEntry(entry: DiaryEntry) {
    setContextMenu(null)

    try {
      const normalizedSettings = normalizeSettings(settings)
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      const syncTarget = syncAdapter.label
      const targetNotebook = getNotebookKey(entry.diaryDate)
      let localEntries = entries

      if (isDraftDirty) {
        const savedDraft = getSavedDraftEntry(draft, new Date().toISOString())
        localEntries = upsertEntry(entries, savedDraft)
        applyDraft(savedDraft)
        applyEntries(localEntries)
      }

      setSelectedNotebook(targetNotebook)
      setSyncTarget({ kind: 'month', key: targetNotebook })
      setExpandedYears((current) => new Set([...current, getNotebookYear(targetNotebook)]))
      setExpandedMonths((current) => new Set([...current, targetNotebook]))

      const progressMessage = `Pulling ${formatDiaryDate(entry.diaryDate)} from ${syncTarget}...`
      setStatusMessage(progressMessage)
      setSyncProgress({ target: syncTarget, message: progressMessage })
      const pulledEntries = await syncAdapter.pullEntries(normalizedSettings, targetNotebook, (current, total) => {
        setSyncProgress({ target: syncTarget, message: progressMessage, current, total })
      })
      const pulledEntry = pulledEntries.find((item) => item.diaryDate === entry.diaryDate)

      if (!pulledEntry) {
        setStatusMessage(`No Markdown entry found for ${formatDiaryDate(entry.diaryDate)} on ${syncTarget}.`)
        return
      }

      const syncedPulledEntry = { ...pulledEntry, syncedAt: new Date().toISOString(), isEdited: false }
      const conflicts = getPullConflicts(localEntries, [syncedPulledEntry])

      if (conflicts.length) {
        setPendingPullReview({
          syncTarget,
          target: { kind: 'month', key: targetNotebook },
          targetLabel: targetNotebook,
          baseEntries: localEntries,
          resolvedEntries: [],
          conflicts,
          index: 0,
        })
        setStatusMessage(`Resolve pull conflict for ${formatDiaryDate(entry.diaryDate)} from ${syncTarget}.`)
        return
      }

      finishPulledEntries([syncedPulledEntry], syncTarget, localEntries, { kind: 'month', key: targetNotebook })
    } catch (error) {
      const normalizedSettings = normalizeSettings(settings)
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      setStatusMessage(error instanceof Error ? error.message : `${syncAdapter.label} pull failed.`)
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings, entry))
    } finally {
      setSyncProgress(null)
    }
  }

  function finishPulledEntries(
    pulledEntries: DiaryEntry[],
    syncTarget: string,
    baseEntries: DiaryEntry[],
    target: SyncTarget,
    resolvedConflictCount = 0,
  ) {
    const nextEntries = mergePulledEntries(baseEntries, pulledEntries)
    const newestPulledEntry = [...pulledEntries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]

    applyEntries(nextEntries)
    applyDraft(newestPulledEntry)
    revealSyncTarget(target)

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
      pendingPullReview.target,
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
    applyEntries(nextEntries)

    if (draft.id === entry.id) {
      const nextDraft = nextEntries[0] ?? makeBlankEntry()
      applyDraft(nextDraft)
      setSelectedNotebook(nextEntries[0] ? getNotebookKey(nextDraft.diaryDate) : null)
    }

    setStatusMessage(`Deleted local entry: ${formatDiaryDate(entry.diaryDate)}`)
  }

  async function deleteEntryEverywhere(entry: DiaryEntry) {
    const normalizedSettings = normalizeSettings(settings)
    const nextEntries = entries.filter((item) => item.id !== entry.id)

    try {
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      setPendingDeleteEntry(null)
      setStatusMessage(`Deleting ${formatDiaryDate(entry.diaryDate)} from ${syncAdapter.label}...`)

      await syncAdapter.deleteEntry(
        entry,
        normalizedSettings,
        loadAllStoredEntries().filter((item) => item.id !== entry.id),
      )

      applyEntries(nextEntries)

      if (draft.id === entry.id) {
        const nextDraft = nextEntries[0] ?? makeBlankEntry()
        applyDraft(nextDraft)
        setSelectedNotebook(nextEntries[0] ? getNotebookKey(nextDraft.diaryDate) : null)
      }

      setStatusMessage(`Deleted ${formatDiaryDate(entry.diaryDate)} locally and from ${syncAdapter.label}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Delete failed.')
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings, entry))
    }
  }

  function persistSettings() {
    const normalizedSettings = normalizeSettings(settings)
    setSettings(normalizedSettings)
    saveSettings(normalizedSettings)
    setStatusMessage('Settings saved locally')
  }

  async function persistCatalog() {
    const normalizedSettings = normalizeSettings(settings)
    const nextCatalog = getDateReferencedCatalog(normalizedSettings)
    setSettings(normalizedSettings)
    saveSettings(normalizedSettings)
    applyDiaryCatalog(nextCatalog)

    try {
      const syncAdapter = await getDiarySyncAdapter(normalizedSettings)
      const progressMessage = `Syncing catalog to ${syncAdapter.label}...`
      setStatusMessage(progressMessage)
      setSyncProgress({
        target: syncAdapter.label,
        title: 'Saving Catalog',
        message: progressMessage,
        current: 0,
        total: 2,
      })
      await syncAdapter.pushCatalog(nextCatalog, normalizedSettings, (current, total, label) => {
        setSyncProgress({
          target: syncAdapter.label,
          title: 'Saving Catalog',
          message: label ? `Synced ${label} to ${syncAdapter.label}.` : progressMessage,
          current,
          total,
        })
      })
      setStatusMessage(`Catalog saved and synced to ${syncAdapter.label}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Catalog saved locally. Sync failed: ${error.message}` : 'Catalog saved locally. Sync failed.')
      setSyncErrorLog(formatSyncErrorLog(error, normalizedSettings))
    } finally {
      setSyncProgress(null)
    }
  }

  function exportCatalogFile() {
    const normalizedSettings = normalizeSettings(settings)
    const catalogToExport = getDateReferencedCatalog(normalizedSettings)
    setSettings(normalizedSettings)
    saveSettings(normalizedSettings)
    applyDiaryCatalog(catalogToExport)
    downloadTextFile(DIARY_CATALOG_FILE_NAME, serializeDiaryCatalog(catalogToExport), 'application/json;charset=utf-8')
    setStatusMessage(`Exported catalog: ${DIARY_CATALOG_FILE_NAME}`)
  }

  function getDateReferencedCatalog(normalizedSettings: AppSettings): DiaryCatalog {
    let nextCatalog = diaryCatalog
    const catalogEntries = new Map<string, DiaryEntry>()

    for (const entry of loadAllStoredEntries())
      catalogEntries.set(entry.id, entry)

    for (const entry of entries)
      catalogEntries.set(entry.id, entry)

    if (draft.savedAt || catalogEntries.has(draft.id))
      catalogEntries.set(draft.id, draft)

    for (const entry of catalogEntries.values())
      nextCatalog = syncDiaryCatalogEntry(nextCatalog, entry)

    return applySettingsToDiaryCatalog(nextCatalog, normalizedSettings)
  }

  async function importCatalogFile(file: File) {
    try {
      const importedCatalog = deserializeDiaryCatalog(await file.text())

      if (!importedCatalog) {
        setStatusMessage(`Catalog import failed: ${file.name} is not a valid catalog file.`)
        return
      }

      const nextSettings = applyDiaryCatalogToSettings(normalizeSettings(settings), importedCatalog)
      setSettings(nextSettings)
      saveSettings(nextSettings)
      applyDiaryCatalog(importedCatalog)
      setStatusMessage(`Imported catalog from ${file.name}. Click Save Catalog to sync it.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Catalog import failed: ${error.message}` : 'Catalog import failed.')
    }
  }

  return (
    <main className="app-shell">
      <Sidebar
        draftId={draft.id}
        searchQuery={searchQuery}
        searchResultCount={sidebarSearchResultCount}
        selectedNotebook={selectedNotebook}
        selectedNotebookCount={selectedNotebookCount}
        syncTarget={syncTarget}
        tagFilter={tagFilter}
        tagFilterOptions={tagFilterOptions}
        notebookGroups={notebookGroups}
        expandedYears={expandedYears}
        expandedMonths={expandedMonths}
        isDraftDirty={isDraftDirty}
        unsavedEntryIds={unsavedEntryIds}
        contextMenu={contextMenu}
        statusMessage={sidebarStatusMessage}
        isCatalogOpen={currentPage === 'catalog'}
        isSettingsOpen={currentPage === 'settings'}
        onNewEntry={startNewEntry}
        onImportEvernoteFiles={(files) => {
          void importEvernoteFiles(files)
        }}
        onSync={pushSelectedEntries}
        onPull={pullEntriesFromNas}
        onOpenCatalog={() => setCurrentPage('catalog')}
        onOpenSettings={() => setCurrentPage('settings')}
        onSearchChange={setSearchQuery}
        onTagFilterChange={setTagFilter}
        onSelectNotebook={setSelectedNotebook}
        onSelectEntry={selectEntry}
        onToggleYear={toggleYear}
        onToggleMonth={toggleMonth}
        onOpenContextMenu={setContextMenu}
        onCloseContextMenu={() => setContextMenu(null)}
        onExportEntry={exportEntry}
        onPullEntry={(entry) => {
          void pullSingleEntry(entry)
        }}
        onPushEntry={(entry) => {
          void pushSingleEntry(entry)
        }}
        onDeleteEntry={requestDeleteEntry}
      />

      <section className="editor">
        {currentPage === 'settings' || currentPage === 'catalog' ? (
          <SettingsPage
            variant={currentPage}
            settings={settings}
            draft={draft}
            entries={entries}
            diaryCatalog={diaryCatalog}
            onSettingsChange={setSettings}
            onDiaryCatalogChange={applyDiaryCatalog}
            onDraftChange={applyDraft}
            onEntriesChange={applyEntries}
            onStatusChange={setStatusMessage}
            onSave={currentPage === 'catalog' ? persistCatalog : persistSettings}
            onExportCatalog={exportCatalogFile}
            onImportCatalog={(file) => {
              void importCatalogFile(file)
            }}
            onBack={() => setCurrentPage('diary')}
          />
        ) : (
          <>
            <MetadataEditor
              draft={draft}
              entries={entries}
              diaryCatalog={diaryCatalog}
              settings={settings}
              onSettingsChange={setSettings}
              onUpdateDraft={updateDraft}
              onUpdateDraftIfCurrent={updateDraftIfCurrent}
              onDraftChange={applyDraft}
              onEntriesChange={applyEntries}
              onStatusChange={setStatusMessage}
              onErrorLog={setSyncErrorLog}
            />

            <EntryEditor
              content={draft.content}
              people={richTextPeople.people}
              personColors={richTextPeople.personColors}
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
      {pendingForcePushTarget && (
        <ForcePushDialog
          targetLabel={getSyncTargetLabel(pendingForcePushTarget)}
          entryCount={getSyncTargetEntries(entries, pendingForcePushTarget).length}
          onCancel={() => setPendingForcePushTarget(null)}
          onConfirm={() => {
            void forcePushTarget(pendingForcePushTarget)
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
      {pushedDiaryDates && (
        <PushSuccessDialog
          diaryDates={pushedDiaryDates}
          onClose={() => setPushedDiaryDates(null)}
        />
      )}
      {syncProgress && (
        <SyncProgressDialog
          target={syncProgress.target}
          title={syncProgress.title}
          message={syncProgress.message}
          current={syncProgress.current}
          total={syncProgress.total}
        />
      )}
      {pendingCloseConfirmation && (
        <UnsavedCloseDialog
          unsavedCount={closeUnsavedCount}
          onCancel={() => setPendingCloseConfirmation(false)}
          onDiscard={discardAndClose}
          onSave={saveAndClose}
        />
      )}
      {syncErrorLog && <SyncErrorDialog log={syncErrorLog} onClose={() => setSyncErrorLog(null)} />}
    </main>
  )
}

function getSavedDraftEntry(entry: DiaryEntry, savedAt: string): DiaryEntry {
  const normalizedTags = normalizeTags(entry.tags)
  const normalizedPeople = normalizePersonTags(entry.people ?? [])
  const normalizedCities = normalizeLocationColors(entry.locationColors, entry.cities)

  return {
    ...entry,
    tags: normalizedTags,
    people: normalizedPeople,
    ...getNormalizedDailyWeatherFields(entry),
    tagColors: normalizeTagColors(entry.tagColors, normalizedTags),
    personColors: normalizeTagColors(entry.personColors ?? {}, normalizedPeople, normalizePersonTag),
    locationColors: normalizedCities,
    updatedAt: savedAt,
    savedAt,
    syncedAt: null,
    isEdited: true,
  }
}

function syncEntryPersonColors(entry: DiaryEntry, settings: AppSettings): DiaryEntry {
  const people = normalizePersonTags(entry.people ?? [])
  const personColors: Record<string, string> = {}

  for (const person of people) {
    const color = getSettingsPersonColor(settings, person) ?? entry.personColors?.[person]

    if (color)
      personColors[person] = color
  }

  if (areStringArraysEqual(entry.people ?? [], people) && areRecordsEqual(entry.personColors ?? {}, personColors))
    return entry

  return {
    ...entry,
    people,
    personColors,
  }
}

function getTagFilterOptions(catalog: DiaryCatalog, settings: AppSettings): TagFilterOption[] {
  return [
    ...Object.entries(catalog.locations).map(([key, location]) => ({
      kind: 'location' as const,
      value: key,
      name: location.city.name,
      color: location.color,
      colorLabel: locationTagManager.getColorGroupName(settings, location.color),
    })),
    ...Object.entries(catalog.activities).map(([name, activity]) => ({
      kind: 'activity' as const,
      value: name,
      name,
      color: activity.color,
      colorLabel: activityTagManager.getColorGroupName(settings, activity.color),
    })),
    ...Object.entries(catalog.people).map(([name, person]) => ({
      kind: 'person' as const,
      value: name,
      name,
      color: person.color,
      colorLabel: personTagManager.getColorGroupName(settings, person.color),
    })),
  ]
}

function getTagFilterEntryReferences(catalog: DiaryCatalog, filter: TagFilter): Set<string> | null {
  if (!filter.kind)
    return null

  const entryReferences = new Set<string>()

  if (filter.kind === 'location') {
    for (const [key, location] of Object.entries(catalog.locations)) {
      const nameMatches = !filter.tag || key === filter.tag
      const colorMatches = !filter.color || location.color === filter.color

      if (nameMatches && colorMatches)
        addEntryReferences(entryReferences, location.entries)
    }

    return entryReferences
  }

  if (filter.kind === 'activity') {
    for (const [name, activity] of Object.entries(catalog.activities)) {
      const nameMatches = !filter.tag || name === filter.tag
      const colorMatches = !filter.color || activity.color === filter.color

      if (nameMatches && colorMatches)
        addEntryReferences(entryReferences, activity.entries)
    }

    return entryReferences
  }

  for (const [name, person] of Object.entries(catalog.people)) {
    const nameMatches = !filter.tag || name === filter.tag
    const colorMatches = !filter.color || person.color === filter.color

    if (nameMatches && colorMatches)
      addEntryReferences(entryReferences, person.entries)
  }

  return entryReferences
}

function addEntryReferences(entryReferences: Set<string>, references: string[]) {
  for (const reference of references)
    entryReferences.add(reference)
}

function getSyncTargetLabel(target: SyncTarget): string {
  return target.kind === 'month' ? target.key : target.year
}

function getSyncTargetEntries(entries: DiaryEntry[], target: SyncTarget): DiaryEntry[] {
  if (target.kind === 'month')
    return entries.filter((entry) => getNotebookKey(entry.diaryDate) === target.key)

  return entries.filter((entry) => getNotebookYear(entry.diaryDate) === target.year)
}

function getSyncTargetNotebookKeys(target: SyncTarget): string[] {
  if (target.kind === 'month')
    return [target.key]

  return Array.from({ length: 12 }, (_, index) => `${target.year}-${String(index + 1).padStart(2, '0')}`)
}

function getSyncTargetPullSource(adapter: DiarySyncAdapter, settings: AppSettings, target: SyncTarget): string {
  if (target.kind === 'month')
    return adapter.getPullSource(settings, target.key)

  return `${adapter.label} ${target.year}`
}

function getSettingsPersonColor(settings: AppSettings, person: string): string | null {
  const normalizedPerson = normalizePersonTag(person)

  for (const [rawName, tag] of Object.entries(settings.peopleTags)) {
    if (normalizePersonTag(rawName) === normalizedPerson)
      return tag.color
  }

  return null
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length)
    return false

  return left.every((value, index) => value === right[index])
}

function areRecordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)

  if (leftEntries.length !== rightEntries.length)
    return false

  return leftEntries.every(([key, value]) => right[key] === value)
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

function formatImportSourceLabel(files: File[]): string {
  if (files.length === 1)
    return files[0].name

  return `${files.length} files`
}

function getImportStatusMessage(
  fileName: string,
  importedCount: number,
  addedTags: string[],
  addedPeople: string[],
  weatherFailureCount: number,
  encryptedCount: number,
  unsupportedCount: number,
): string {
  const detailParts = [
    addedTags.length ? `Added ${addedTags.length} activity ${addedTags.length === 1 ? 'tag' : 'tags'}` : '',
    addedPeople.length ? `Added ${addedPeople.length} people ${addedPeople.length === 1 ? 'tag' : 'tags'}` : '',
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
