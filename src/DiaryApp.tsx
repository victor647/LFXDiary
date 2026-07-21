import { useEffect, useMemo, useRef, useState } from 'react'
import { DeleteEntryDialog } from './components/DeleteEntryDialog'
import { EntryEditor, type PersonMentionOption } from './components/EntryEditor'
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
import { DEFAULT_TAG_COLOR, MAX_PEOPLE_PER_ENTRY } from './domain/constants'
import {
  DIARY_CATALOG_FILE_NAME,
  applyDiaryCatalogToSettings,
  applySettingsToDiaryCatalog,
  deserializeDiaryCatalog,
  ensureTagsInCatalog,
  mergeDiaryCatalogs,
  pruneEmptyCatalogTags,
  removeDiaryCatalogEntry,
  serializeDiaryCatalog,
  stripGuidTagKeys,
  syncDiaryCatalogEntry,
  cleanUnwantedTags,
  cleanEntriesFromUnwantedTags,
} from './domain/diaryCatalog'
import { serializeDiaryEntryMarkdown } from './domain/diaryEntrySerialization'
import type { AppSettings, DiaryCatalog, DiaryEntry, PendingPullReview, SyncLogLine, SyncProgress, SyncTarget, TagFilter } from './domain/types'
import { formatDiaryDate, getNotebookKey, getNotebookYear, toDateInputValue } from './utils/date'
import {
  getEditedEntryCount,
  getSidebarStatusMessage,
  getUnsavedEntryIds,
  getUnuploadedEntryCount,
  isEntryUnsynced,
  upsertEntries,
} from './utils/diaryEntryHelpers'
import {
  getSavedDraftEntry,
  getPeopleMentionOptions,
  getPullConflicts,
  groupEntriesByMonthIndex,
  getStoredDiaryDateRangeLabel,
  getMonthIndexEntryCount,
  loadAllStoredEntries,
  loadInitialDiaryEntries,
  loadNotebookEntries,
  loadStoredDiaryCatalog,
  makeBlankEntry,
  mergePulledEntries,
  saveLoadedEntries,
  saveStoredDiaryCatalog,
  syncEntryRichTextTagColors,
  upsertEntry,
} from './utils/entries'
import { downloadTextFile, getEntryMarkdownFileName } from './utils/files'
import { loadSettings, normalizeSettings, saveSettings } from './utils/settings'
import { formatSyncErrorLog } from './utils/syncErrorLog'
import { getDecadeKey, getFilteredMonthEntryCounts, getTagFilterEntryReferences, getTagFilterOptions, sumMonthEntryCounts } from './utils/diaryFilterHelpers'
import { getSyncTargetEntries, getSyncTargetLabel, getSyncTargetNotebookKeys, getSyncTargetPullSource } from './utils/syncTargetHelpers'
import { importEvernoteFiles } from './application/importOperations'
import { restoreFromFiles } from './utils/storage'

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
  const [tagFilter, setTagFilter] = useState<TagFilter>({ kind: '', color: '', tag: '', tags: [] })
  const [statusMessage, setStatusMessage] = useState('Ready')
  const [syncErrorLog, setSyncErrorLog] = useState<string | null>(null)
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(initialDiaryLoad.monthKey)
  const [syncTarget, setSyncTarget] = useState<SyncTarget>(() => ({ kind: 'month', key: initialNotebookKey }))
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: DiaryEntry } | { x: number; y: number; kind: 'month'; key: string } | { x: number; y: number; kind: 'year'; year: string } | null>(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<DiaryEntry | null>(null)
  const [pendingForcePushTarget, setPendingForcePushTarget] = useState<SyncTarget | null>(null)
  const [pendingPullReview, setPendingPullReview] = useState<PendingPullReview | null>(null)
  const [pushedDiaryDates, setPushedDiaryDates] = useState<string[] | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [pendingCloseConfirmation, setPendingCloseConfirmation] = useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const lastClickedEntryRef = useRef<string | null>(null)
  const [expandedDecades, setExpandedDecades] = useState<Set<string>>(() => new Set([getDecadeKey(getNotebookYear(initialNotebookKey))]))
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set([getNotebookYear(initialNotebookKey)]))
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set(initialDiaryLoad.monthKey ? [initialDiaryLoad.monthKey] : []))
  const allowCloseRef = useRef(false)
  const hasUnsavedEntriesRef = useRef(false)

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate)), [entries])
  const tagFilterOptions = useMemo(() => getTagFilterOptions(diaryCatalog, settings), [diaryCatalog, settings])
  const tagFilterEntryReferences = useMemo(() => getTagFilterEntryReferences(diaryCatalog, tagFilter), [diaryCatalog, tagFilter])
  const hasSearchFilter = Boolean(searchQuery.trim() || tagFilter.tags.length)
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return sortedEntries.filter((entry) => {
      if (tagFilterEntryReferences && !tagFilterEntryReferences.has(entry.diaryDate)) return false
      if (!query) return true
      return entry.content.toLowerCase().includes(query)
    })
  }, [searchQuery, sortedEntries, tagFilterEntryReferences])
  const filteredMonthEntryCounts = useMemo(
    () => getFilteredMonthEntryCounts(searchResults, tagFilterEntryReferences, searchQuery.trim()),
    [searchQuery, searchResults, tagFilterEntryReferences])
  const notebookGroups = useMemo(
    () => groupEntriesByMonthIndex(monthIndex, searchResults, {
      filteredCounts: hasSearchFilter ? filteredMonthEntryCounts : undefined, loadedMonthKeys,
    }), [filteredMonthEntryCounts, hasSearchFilter, loadedMonthKeys, monthIndex, searchResults])
  const sidebarSearchResultCount = hasSearchFilter ? sumMonthEntryCounts(filteredMonthEntryCounts) : getMonthIndexEntryCount(monthIndex)
  const allEntriesLabel = useMemo(() => getStoredDiaryDateRangeLabel(monthIndex, entries), [entries, monthIndex])
  const draftSavedEntry = useMemo(() => entries.find((entry) => entry.id === draft.id), [draft.id, entries])
  const isDraftDirty = !draftSavedEntry || draftSavedEntry.updatedAt !== draft.updatedAt
  const editedEntryCount = useMemo(() => getEditedEntryCount(entries, draft), [draft, entries])
  const unsavedEntryIds = useMemo(() => getUnsavedEntryIds(entries, draft), [draft, entries])
  const unuploadedEntryCount = useMemo(() => getUnuploadedEntryCount(entries, draft), [draft, entries])
  const richTextTags = useMemo(() => {
    const p = new Set<string>(); const pc: Record<string, string> = {}; const pi = new Set<string>(); const pic: Record<string, string> = {}
    for (const id of draft.people ?? []) { if (!id) continue; const c = draft.personColors?.[id] ?? settings.peopleTags[id]?.color; p.add(id); if (c) pc[id] = c }
    for (const id of draft.pointsOfInterest ?? []) { if (!id) continue; const c = draft.pointOfInterestColors?.[id] ?? settings.pointOfInterestTags[id]?.color; pi.add(id); if (c) pic[id] = c }
    return { people: Array.from(p), personColors: pc, pointsOfInterest: Array.from(pi), pointOfInterestColors: pic }
  }, [draft.people, draft.personColors, draft.pointOfInterestColors, draft.pointsOfInterest, settings])
  const peopleMentionOptions = useMemo(() => getPeopleMentionOptions(settings, diaryCatalog, draft), [diaryCatalog, draft, settings])
  const hasUnsavedEntries = isDraftDirty || unsavedEntryIds.size > 0
  const closeUnsavedCount = hasUnsavedEntries ? Math.max(1, unsavedEntryIds.size) : 0
  const sidebarStatusMessage = getSidebarStatusMessage(unsavedEntryIds.size, unuploadedEntryCount) ?? statusMessage

  // Restore data from files on startup in Electron
  useEffect(() => { restoreFromFiles() }, [])

  // Repair tag names if they were corrupted to GUIDs (one-time fix)
  useEffect(() => { setDraft((current) => syncEntryRichTextTagColors(current, settings)) }, [draft.id, settings])
  useEffect(() => { hasUnsavedEntriesRef.current = hasUnsavedEntries }, [hasUnsavedEntries])
  useEffect(() => {
    const resolved = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : settings.theme
    document.documentElement.setAttribute('data-theme', resolved)
  }, [settings.theme])
  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])
  useEffect(() => {
    function cbc(e: BeforeUnloadEvent) { if (allowCloseRef.current || !hasUnsavedEntriesRef.current) return; e.preventDefault(); e.returnValue = ''; setPendingCloseConfirmation(true) }
    window.addEventListener('beforeunload', cbc); return () => window.removeEventListener('beforeunload', cbc)
  }, [])

  function applyEntries(nextEntries: DiaryEntry[] | ((current: DiaryEntry[]) => DiaryEntry[]), nextLoadedMonthKeys = loadedMonthKeys) {
    const re = typeof nextEntries === 'function' ? nextEntries(entries) : nextEntries
    const ms = new Set(nextLoadedMonthKeys); const ids = new Set(re.map((e) => e.id)); const ds = new Set(re.map((e) => e.diaryDate))
    const rd = entries.filter((e) => !ids.has(e.id) && !ds.has(e.diaryDate)).map((e) => e.diaryDate)
    for (const e of re) ms.add(getNotebookKey(e.diaryDate))
    const newMonthIndex = saveLoadedEntries(re, ms)
    setEntries(re)
    setMonthIndex(newMonthIndex)
    setDiaryCatalog((cc) => { let nc = cc; for (const d of rd) nc = removeDiaryCatalogEntry(nc, d); for (const e of re) nc = syncDiaryCatalogEntry(nc, e); if (ids.has(draft.id)) nc = syncDiaryCatalogEntry(nc, draft); nc = pruneEmptyCatalogTags(nc); nc = stripGuidTagKeys(nc); saveStoredDiaryCatalog(nc); return nc })
  }
  function applyDraft(nextDraft: DiaryEntry | ((current: DiaryEntry) => DiaryEntry)) {
    setDraft((c) => { const rd = typeof nextDraft === 'function' ? nextDraft(c) : nextDraft; setDiaryCatalog((cc) => { const nc = syncDiaryCatalogEntry(cc, rd); if (entries.some((e) => e.id === rd.id)) saveStoredDiaryCatalog(nc); return nc }); return rd })
  }
  function applyDiaryCatalog(nextCatalog: DiaryCatalog) { setDiaryCatalog(nextCatalog); saveStoredDiaryCatalog(nextCatalog) }
  function navigateToDate(date: string) {
    const notebookKey = getNotebookKey(date)
    // Load month if not already loaded
    if (!loadedMonthKeys.has(notebookKey)) {
      const nextLoadedMonthKeys = new Set([...loadedMonthKeys, notebookKey])
      const monthEntries = loadNotebookEntries(notebookKey)
      setLoadedMonthKeys(nextLoadedMonthKeys)
      applyEntries((current) => upsertEntries(current, monthEntries), nextLoadedMonthKeys)
    }
    // Find entry and navigate
    const entry = entries.find((e) => e.diaryDate === date) ?? loadNotebookEntries(notebookKey).find((e) => e.diaryDate === date)
    if (entry) {
      setSelectedEntryIds(new Set())
      selectEntry(entry, notebookKey)
      setCurrentPage('diary')
    }
  }
  function loadMonthIfNeeded(monthKey: string): Set<string> {
    if (loadedMonthKeys.has(monthKey)) return loadedMonthKeys
    const nextLoadedMonthKeys = new Set([...loadedMonthKeys, monthKey])
    const monthEntries = loadNotebookEntries(monthKey)
    setLoadedMonthKeys(nextLoadedMonthKeys)
    applyEntries((current) => upsertEntries(current, monthEntries), nextLoadedMonthKeys)
    return nextLoadedMonthKeys
  }

  function updateDraft(patch: Partial<DiaryEntry>) { applyDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString(), isEdited: true })) }
  function updateDraftIfCurrent(entryId: string, diaryDate: string, patch: Partial<DiaryEntry>) {
    applyDraft((current) => current.id !== entryId || current.diaryDate !== diaryDate ? current : { ...current, ...patch, updatedAt: new Date().toISOString(), isEdited: true })
  }
  function mentionPerson(person: PersonMentionOption, content: string) {
    const personId = person.id
    if (!personId) { updateDraft({ content }); return }
    updateDraft({ content, people: [...new Set([...draft.people, personId])].slice(0, MAX_PEOPLE_PER_ENTRY), personColors: { ...draft.personColors, [personId]: person.color || DEFAULT_TAG_COLOR } })
  }

  function getNavigationSaveState(): { savedDraft: DiaryEntry; localEntries: DiaryEntry[]; didSave: boolean } {
    if (!isDraftDirty) return { savedDraft: draft, localEntries: entries, didSave: false }
    const savedDraft = getSavedDraftEntry(draft, new Date().toISOString())
    return { savedDraft, localEntries: upsertEntry(entries, savedDraft), didSave: true }
  }
  function startNewEntry() {
    const { savedDraft, localEntries, didSave } = getNavigationSaveState()
    const next = makeBlankEntry()
    const nextMonthKey = getNotebookKey(next.diaryDate)
    if (didSave) applyEntries(localEntries)
    if (!loadedMonthKeys.has(nextMonthKey)) setLoadedMonthKeys((c) => new Set([...c, nextMonthKey]))
    applyDraft(next)
    setSelectedNotebook(nextMonthKey)
    setSyncTarget({ kind: 'month', key: nextMonthKey })
    setExpandedYears((c) => new Set([...c, getNotebookYear(next.diaryDate)]))
    setExpandedMonths((c) => new Set([...c, nextMonthKey]))
    setStatusMessage(didSave ? `Auto-saved ${formatDiaryDate(savedDraft.diaryDate)}. New entry` : 'New entry')
  }
  function selectEntry(entry: DiaryEntry, _notebookKey: string) {
    if (draft.id !== entry.id) {
      const notebookKey = getNotebookKey(entry.diaryDate)
      setExpandedDecades((c) => new Set([...c, getDecadeKey(getNotebookYear(notebookKey))]))
      setExpandedYears((c) => new Set([...c, getNotebookYear(notebookKey)]))
      setExpandedMonths((c) => new Set([...c, notebookKey]))
      setSyncTarget({ kind: 'entry', key: entry.diaryDate, notebookKey })
    }
    if (draft.id === entry.id) return
    const { savedDraft, localEntries, didSave } = getNavigationSaveState()
    const nextEntry = localEntries.find((item) => item.id === entry.id) ?? entry
    if (didSave) applyEntries(localEntries)
    applyDraft(syncEntryRichTextTagColors(nextEntry, settings))
    if (didSave) setStatusMessage(`Auto-saved ${formatDiaryDate(savedDraft.diaryDate)}. Opened ${formatDiaryDate(nextEntry.diaryDate)}.`)
  }

  function handleEntryClick(entry: DiaryEntry, notebookKey: string, event: { ctrlKey: boolean; shiftKey: boolean }) {
    if (event.ctrlKey) {
      setSelectedEntryIds((prev) => {
        const next = new Set(prev)
        if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id)
        if (next.size > 0) lastClickedEntryRef.current = entry.id
        return next
      })
      return
    }

    if (event.shiftKey && lastClickedEntryRef.current) {
      const flatIds = sortedEntries.map((e) => e.id)
      const lastIdx = flatIds.indexOf(lastClickedEntryRef.current)
      const currentIdx = flatIds.indexOf(entry.id)
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx]
        setSelectedEntryIds(new Set(flatIds.slice(start, end + 1)))
      }
      return
    }

    // Regular click: clear multi-selection, select entry
    setSelectedEntryIds(new Set())
    lastClickedEntryRef.current = entry.id
    selectEntry(entry, notebookKey)
  }

  async function handleImportEvernoteFiles(files: File[]) {
    await importEvernoteFiles(files, entries, settings, {
      setStatusMessage, setSyncProgress, setSettings, applyEntries, applyDraft,
      setSelectedNotebook: (key: string) => setSelectedNotebook(key),
      setSyncTarget: (target) => setSyncTarget(target),
      setExpandedYears, setExpandedMonths,
    })
  }

  function toggleDecade(decade: string) { setExpandedDecades((c) => { const n = new Set(c); n.has(decade) ? n.delete(decade) : n.add(decade); return n }) }
  function toggleYear(year: string) { setSyncTarget({ kind: 'year', year }); setSelectedNotebook(null); setExpandedYears((c) => { const n = new Set(c); n.has(year) ? n.delete(year) : n.add(year); return n }) }
  function toggleMonth(monthKey: string) {
    setSyncTarget({ kind: 'month', key: monthKey }); setSelectedNotebook(monthKey)
    const willExpand = !expandedMonths.has(monthKey)
    if (willExpand) loadMonthIfNeeded(monthKey)
    setExpandedMonths((c) => { const n = new Set(c); n.has(monthKey) ? n.delete(monthKey) : n.add(monthKey); return n })
  }
  function revealSyncTarget(target: SyncTarget) {
    setSyncTarget(target)
    if (target.kind === 'entry' || target.kind === 'month') {
      const key = target.kind === 'entry' ? target.notebookKey : target.key
      setSelectedNotebook(key)
      setExpandedDecades((c) => new Set([...c, getDecadeKey(getNotebookYear(key))]))
      setExpandedYears((c) => new Set([...c, getNotebookYear(key)]))
      setExpandedMonths((c) => new Set([...c, key]))
      return
    }
    setSelectedNotebook(null)
    setExpandedDecades((c) => new Set([...c, getDecadeKey(target.year)]))
    setExpandedYears((c) => new Set([...c, target.year]))
  }

  function saveEditedEntries() {
    const now = new Date().toISOString()
    const savedEntries = new Map<string, DiaryEntry>()
    let savedCount = 0
    for (const entry of entries) { const se = entry.isEdited ? getSavedDraftEntry(entry, now) : entry; savedEntries.set(se.id, se); if (entry.isEdited) savedCount++ }
    const shouldSave = isDraftDirty || draft.isEdited || !savedEntries.has(draft.id)
    const normalizedDraft = shouldSave ? getSavedDraftEntry(draft, now) : draft
    if (shouldSave) { if (!savedEntries.get(draft.id)?.isEdited) savedCount++; savedEntries.set(normalizedDraft.id, normalizedDraft) }
    const nextEntries = Array.from(savedEntries.values())
    applyDraft(normalizedDraft); applyEntries(nextEntries)
    setSelectedNotebook(getNotebookKey(normalizedDraft.diaryDate))
    setSyncTarget({ kind: 'month', key: getNotebookKey(normalizedDraft.diaryDate) })
    setExpandedYears((c) => new Set([...c, getNotebookYear(normalizedDraft.diaryDate)]))
    setExpandedMonths((c) => new Set([...c, getNotebookKey(normalizedDraft.diaryDate)]))
    setStatusMessage(savedCount > 1 ? `Saved ${savedCount} edited entries locally. Click Push to upload.` : `Saved locally: ${formatDiaryDate(normalizedDraft.diaryDate)}. Click Push to upload.`)
  }
  function closeWindowWithoutPrompt() { allowCloseRef.current = true; setPendingCloseConfirmation(false); window.setTimeout(() => window.close(), 0) }

  function appendLogLine(prev: SyncLogLine[] | undefined, label: string | undefined, level: SyncLogLine['level'] = 'info'): SyncLogLine[] {
    if (!label) return prev ?? []
    const lines = prev ?? []
    if (lines.length > 0 && lines[lines.length - 1].text === label) return lines
    return [...lines, { text: label, level }]
  }

  async function pushSelectedEntries() {
    const now = new Date().toISOString()
    let nd = draft; let le = entries
    if (isDraftDirty) { nd = getSavedDraftEntry(draft, now); le = upsertEntry(entries, nd); applyDraft(nd); applyEntries(le) }
    const target = syncTarget
    const targetLabel = getSyncTargetLabel(target)
    const toPush = getSyncTargetEntries(loadAllStoredEntries(), target).filter(isEntryUnsynced)
    revealSyncTarget(target)
    if (!toPush.length) { setStatusMessage(`No unsynced entries in ${targetLabel}.`); setPendingForcePushTarget(target); return }
    await doPush(toPush, targetLabel, nd, false)
  }
  async function doPush(toPush: DiaryEntry[], targetLabel: string, nd: DiaryEntry, isForce: boolean) {
    const ns = normalizeSettings(settings)
    const adapter = await getDiarySyncAdapter(ns)
    const st = adapter.label
    const msg = `${isForce ? 'Force pushing' : 'Pushing'} ${toPush.length} ${toPush.length === 1 ? 'entry' : 'entries'} to ${st}...`
    setStatusMessage(msg)
    setSyncProgress({ target: st, message: msg, current: 0, total: toPush.length, logLines: [{ text: msg, level: 'info' }] })
    try {
      await adapter.pushEntries(toPush, ns, loadAllStoredEntries(), (c, t, label) => setSyncProgress(prev => prev ? {
        target: st, message: msg, current: c, total: t,
        logLines: appendLogLine(prev.logLines, label),
      } : null))
      const syncedAt = new Date().toISOString()
      const pushed = toPush.map((e) => ({ ...e, syncedAt, isEdited: false }))
      const dest = adapter.getPushDestination(ns, toPush[0] ?? nd)
      applyDraft((c) => pushed.find((e) => e.id === c.id) ?? c)
      applyEntries((c) => upsertEntries(c, pushed))
      setPushedDiaryDates(pushed.map((e) => e.diaryDate))
      setStatusMessage(`${isForce ? 'Force pushed' : 'Pushed'} ${toPush.length} ${toPush.length === 1 ? 'entry' : 'entries'} from ${targetLabel} to ${dest}`)
      setSyncProgress(null)
    } catch (error) {
      const a = await getDiarySyncAdapter(ns)
      const errorMessage = error instanceof Error ? error.message : `${a.label} push failed.`
      setStatusMessage(errorMessage)
      setSyncProgress(prev => prev ? {
        ...prev,
        logLines: [...(prev.logLines ?? []), { text: errorMessage, level: 'error' }],
        errorLog: formatSyncErrorLog(error, ns, toPush[0] ?? nd),
      } : null)
    }
  }
  async function forcePushTarget(target: SyncTarget) {
    setPendingForcePushTarget(null)
    const tl = getSyncTargetLabel(target); const te = getSyncTargetEntries(loadAllStoredEntries(), target)
    if (!te.length) { setStatusMessage(`No entries in ${tl}.`); return }
    revealSyncTarget(target)
    await doPush(te, tl, te.find((e) => e.id === draft.id) ?? te[0], true)
  }
  async function pushSingleEntry(entry: DiaryEntry) {
    setContextMenu(null)
    const now = new Date().toISOString()
    let nd = draft; let le = entries
    if (isDraftDirty) { nd = getSavedDraftEntry(draft, now); le = upsertEntry(entries, nd); applyDraft(nd); applyEntries(le) }
    const ep = le.find((item) => item.id === entry.id) ?? entry
    const tn = getNotebookKey(ep.diaryDate)
    revealSyncTarget({ kind: 'entry', key: ep.diaryDate, notebookKey: tn })
    await doPush([ep], tn, nd, false)
  }

  async function pushTargetEntries(target: SyncTarget) {
    setContextMenu(null)
    const now = new Date().toISOString()
    let nd = draft; let le = entries
    if (isDraftDirty) { nd = getSavedDraftEntry(draft, now); le = upsertEntry(entries, nd); applyDraft(nd); applyEntries(le) }
    const tl = getSyncTargetLabel(target)
    const toPush = getSyncTargetEntries(loadAllStoredEntries(), target).filter(isEntryUnsynced)
    if (!toPush.length) { setStatusMessage(`No unsynced entries in ${tl}.`); setPendingForcePushTarget(target); return }
    await doPush(toPush, tl, nd, false)
  }

  function exportTargetEntries(target: SyncTarget) {
    setContextMenu(null)
    const targetEntries = getSyncTargetEntries(loadAllStoredEntries(), target)
    for (const entry of targetEntries)
      downloadTextFile(getEntryMarkdownFileName(entry), serializeDiaryEntryMarkdown(entry), 'text/markdown')
    const tl = getSyncTargetLabel(target)
    setStatusMessage(`Exported ${targetEntries.length} ${targetEntries.length === 1 ? 'entry' : 'entries'} from ${tl}`)
  }

  function deleteTargetEntries(target: SyncTarget) {
    setContextMenu(null)
    const targetEntries = getSyncTargetEntries(loadAllStoredEntries(), target)
    if (!targetEntries.length) return
    const tl = getSyncTargetLabel(target)
    if (!window.confirm(`Delete all ${targetEntries.length} ${targetEntries.length === 1 ? 'entry' : 'entries'} in ${tl} from local storage?`)) return
    const targetIds = new Set(targetEntries.map((e) => e.id))
    const next = entries.filter((item) => !targetIds.has(item.id))
    applyEntries(next)
    if (targetIds.has(draft.id)) { const nd = next[0] ?? makeBlankEntry(); applyDraft(nd); setSelectedNotebook(next[0] ? getNotebookKey(nd.diaryDate) : null) }
    setStatusMessage(`Deleted ${targetEntries.length} ${targetEntries.length === 1 ? 'entry' : 'entries'} from ${tl}`)
  }

  async function pullTargetEntries(target: SyncTarget) {
    setContextMenu(null)
    const ns = normalizeSettings(settings)
    const adapter = await getDiarySyncAdapter(ns)
    const sl = adapter.label; const tl = getSyncTargetLabel(target); const tns = getSyncTargetNotebookKeys(target)
    let le = entries
    if (isDraftDirty) { const sd = getSavedDraftEntry(draft, new Date().toISOString()); le = upsertEntry(entries, sd); applyDraft(sd); applyEntries(le) }
    const msg = `Pulling Markdown entries from ${tl} on ${sl}...`
    setStatusMessage(msg)
    setSyncProgress({ target: sl, message: msg, logLines: [{ text: msg, level: 'info' }] })
    try {
      const pulled = await adapter.pullNotebookEntries(ns, tns, {
        onProgress: (c, t, label) => setSyncProgress(prev => prev ? {
          target: sl, message: msg, current: c, total: t,
          logLines: appendLogLine(prev.logLines, label),
        } : null),
      })
      if (!pulled.length) { setStatusMessage(`No Markdown entries found in ${tl} on ${sl}.`); setSyncProgress(null); return }
      const localDates = new Set(le.map((e) => e.diaryDate))
      const newPulled = pulled.filter((e) => !localDates.has(e.diaryDate))
      if (!newPulled.length) { setStatusMessage(`All entries in ${tl} already exist locally.`); setSyncProgress(null); return }
      const sp = newPulled.map((e) => ({ ...e, syncedAt: new Date().toISOString(), isEdited: false }))
      const conflicts = getPullConflicts(le, sp)
      if (conflicts.length) {
        setSyncProgress(null)
        const cds = new Set(conflicts.map((c) => c.cloudEntry.diaryDate))
        setPendingPullReview({ syncTarget: sl, target, targetLabel: tl, baseEntries: le, resolvedEntries: sp.filter((e) => !cds.has(e.diaryDate)), conflicts, index: 0 })
        setStatusMessage(`Resolve ${conflicts.length} pull ${conflicts.length === 1 ? 'conflict' : 'conflicts'} from ${sl}.`)
        return
      }
      finishPulled(sp, sl, le, target)
      setSyncProgress(null)
    } catch (error) {
      const a = await getDiarySyncAdapter(ns)
      const errorMessage = error instanceof Error ? error.message : `${a.label} pull failed.`
      setStatusMessage(errorMessage)
      setSyncProgress(prev => prev ? {
        ...prev,
        logLines: [...(prev.logLines ?? []), { text: errorMessage, level: 'error' }],
        errorLog: formatSyncErrorLog(error, ns, undefined, getSyncTargetPullSource(a, ns, target)),
      } : null)
    }
  }

  async function pullEntriesFromNas() {
    const ns = normalizeSettings(settings)
    const adapter = await getDiarySyncAdapter(ns)
    const sl = adapter.label; const target = syncTarget
    const tl = getSyncTargetLabel(target); const tns = getSyncTargetNotebookKeys(target)
    let le = entries
    if (isDraftDirty) { const sd = getSavedDraftEntry(draft, new Date().toISOString()); le = upsertEntry(entries, sd); applyDraft(sd); applyEntries(le) }
    revealSyncTarget(target)
    const msg = `Pulling Markdown entries from ${tl} on ${sl}...`
    setStatusMessage(msg)
    setSyncProgress({ target: sl, message: msg, logLines: [{ text: msg, level: 'info' }] })
    try {
      const pulled = await adapter.pullNotebookEntries(ns, tns, {
        onProgress: (c, t, label) => setSyncProgress(prev => prev ? {
          target: sl, message: msg, current: c, total: t,
          logLines: appendLogLine(prev.logLines, label),
        } : null),
      })
      if (!pulled.length) { setStatusMessage(`No Markdown entries found in ${tl} on ${sl}.`); setSyncProgress(null); return }
      const localDates = new Set(le.map((e) => e.diaryDate))
      const newPulled = pulled.filter((e) => !localDates.has(e.diaryDate))
      if (!newPulled.length) { setStatusMessage(`All entries in ${tl} already exist locally.`); setSyncProgress(null); return }
      const sp = newPulled.map((e) => ({ ...e, syncedAt: new Date().toISOString(), isEdited: false }))
      const conflicts = getPullConflicts(le, sp)
      if (conflicts.length) {
        setSyncProgress(null)
        const cds = new Set(conflicts.map((c) => c.cloudEntry.diaryDate))
        setPendingPullReview({ syncTarget: sl, target, targetLabel: tl, baseEntries: le, resolvedEntries: sp.filter((e) => !cds.has(e.diaryDate)), conflicts, index: 0 })
        setStatusMessage(`Resolve ${conflicts.length} pull ${conflicts.length === 1 ? 'conflict' : 'conflicts'} from ${sl}.`)
        return
      }
      finishPulled(sp, sl, le, target)
      setSyncProgress(null)
    } catch (error) {
      const a = await getDiarySyncAdapter(ns)
      const errorMessage = error instanceof Error ? error.message : `${a.label} pull failed.`
      setStatusMessage(errorMessage)
      setSyncProgress(prev => prev ? {
        ...prev,
        logLines: [...(prev.logLines ?? []), { text: errorMessage, level: 'error' }],
        errorLog: formatSyncErrorLog(error, ns, undefined, getSyncTargetPullSource(a, ns, syncTarget)),
      } : null)
    }
  }
  async function pullSingleEntry(entry: DiaryEntry) {
    setContextMenu(null)
    const ns = normalizeSettings(settings); const adapter = await getDiarySyncAdapter(ns)
    const sl = adapter.label; const tn = getNotebookKey(entry.diaryDate)
    let le = entries
    if (isDraftDirty) { const sd = getSavedDraftEntry(draft, new Date().toISOString()); le = upsertEntry(entries, sd); applyDraft(sd); applyEntries(le) }
    revealSyncTarget({ kind: 'entry', key: entry.diaryDate, notebookKey: tn })
    const msg = `Pulling ${formatDiaryDate(entry.diaryDate)} from ${sl}...`
    setStatusMessage(msg)
    setSyncProgress({ target: sl, message: msg, logLines: [{ text: msg, level: 'info' }] })
    try {
      const pe = await adapter.pullEntry(ns, entry, (c, t, label) => setSyncProgress(prev => prev ? {
        target: sl, message: msg, current: c, total: t,
        logLines: appendLogLine(prev.logLines, label),
      } : null))
      if (!pe) { setStatusMessage(`No Markdown entry found for ${formatDiaryDate(entry.diaryDate)} on ${sl}.`); setSyncProgress(null); return }
      const sp = { ...pe, syncedAt: new Date().toISOString(), isEdited: false }
      const conflicts = getPullConflicts(le, [sp])
      if (conflicts.length) { setSyncProgress(null); setPendingPullReview({ syncTarget: sl, target: { kind: 'month', key: tn }, targetLabel: tn, baseEntries: le, resolvedEntries: [], conflicts, index: 0 }); setStatusMessage(`Resolve pull conflict for ${formatDiaryDate(entry.diaryDate)} from ${sl}.`); return }
      finishPulled([sp], sl, le, { kind: 'month', key: tn })
      setSyncProgress(null)
    } catch (error) {
      const a = await getDiarySyncAdapter(ns)
      const errorMessage = error instanceof Error ? error.message : `${a.label} pull failed.`
      setStatusMessage(errorMessage)
      setSyncProgress(prev => prev ? {
        ...prev,
        logLines: [...(prev.logLines ?? []), { text: errorMessage, level: 'error' }],
        errorLog: formatSyncErrorLog(error, ns, entry),
      } : null)
    }
  }
  function finishPulled(pulled: DiaryEntry[], st: string, base: DiaryEntry[], target: SyncTarget, resolvedCount = 0) {
    const next = mergePulledEntries(base, pulled)
    const newest = [...pulled].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]
    // Ensure tags from legacy pulled entries exist in catalog and settings
    const enrichedCatalog = ensureTagsInCatalog(diaryCatalog, pulled)
    if (enrichedCatalog !== diaryCatalog) {
      applyDiaryCatalog(enrichedCatalog)
      const ns = normalizeSettings(settings)
      const nextSettings = applyDiaryCatalogToSettings(ns, enrichedCatalog)
      if (nextSettings !== ns) {
        setSettings(nextSettings)
        saveSettings(nextSettings)
      }
    }
    applyEntries(next); applyDraft(newest); revealSyncTarget(target)
    const ct = resolvedCount ? ` Resolved ${resolvedCount} ${resolvedCount === 1 ? 'conflict' : 'conflicts'}.` : ''
    setStatusMessage(`Pulled ${pulled.length} Markdown ${pulled.length === 1 ? 'entry' : 'entries'} from ${st}.${ct}`)
  }
  function resolvePullConflict(useCloud: boolean) {
    if (!pendingPullReview) return
    const conflict = pendingPullReview.conflicts[pendingPullReview.index]
    const selected = useCloud ? conflict.cloudEntry : conflict.localEntry
    const resolved = [...pendingPullReview.resolvedEntries, selected]
    const ni = pendingPullReview.index + 1
    if (ni < pendingPullReview.conflicts.length) { setPendingPullReview({ ...pendingPullReview, resolvedEntries: resolved, index: ni }); return }
    setPendingPullReview(null)
    finishPulled(resolved, pendingPullReview.syncTarget, pendingPullReview.baseEntries, pendingPullReview.target, pendingPullReview.conflicts.length)
  }

  function exportEntry(entry: DiaryEntry) { downloadTextFile(getEntryMarkdownFileName(entry), serializeDiaryEntryMarkdown(entry), 'text/markdown'); setContextMenu(null); setStatusMessage(`Exported ${formatDiaryDate(entry.diaryDate)}`) }
  function requestDeleteEntry(entry: DiaryEntry) { setContextMenu(null); setPendingDeleteEntry(entry) }
  function deleteLocalEntry(entry: DiaryEntry) {
    const next = entries.filter((item) => item.id !== entry.id); applyEntries(next)
    if (draft.id === entry.id) { const nd = next[0] ?? makeBlankEntry(); applyDraft(nd); setSelectedNotebook(next[0] ? getNotebookKey(nd.diaryDate) : null) }
    setStatusMessage(`Deleted local entry: ${formatDiaryDate(entry.diaryDate)}`)
  }

  function persistSettings() { const ns = normalizeSettings(settings); setSettings(ns); saveSettings(ns); setStatusMessage('Settings saved locally') }
  function cleanCatalog() {
    const msg = 'Cleaning catalog...'
    setStatusMessage(msg)
    setSyncProgress({ target: 'Catalog', title: 'Clean', message: msg, current: 0, total: 3, logLines: [{ text: 'Scanning catalog...', level: 'info' }] })

    // Step 1: Clean catalog
    const catalogCleaned = cleanUnwantedTags(diaryCatalog)
    const catalogTagCount = countCatalogTags(diaryCatalog) - countCatalogTags(catalogCleaned)
    setSyncProgress((prev) => prev ? {
      ...prev, current: 1, total: 3,
      logLines: [...prev.logLines, { text: `Removed ${catalogTagCount} unwanted tags from catalog.`, level: 'info' }],
    } : null)

    // Step 2: Clean all stored entries (not just loaded ones)
    const allStored = loadAllStoredEntries()
    const { entries: cleanedEntries, removedTags, removedPeople, removedPoi } = cleanEntriesFromUnwantedTags(allStored)
    const totalEntryRefs = removedTags + removedPeople + removedPoi
    // Save cleaned entries back to storage
    saveLoadedEntries(cleanedEntries, new Set(cleanedEntries.map((e) => getNotebookKey(e.diaryDate))))
    setSyncProgress((prev) => prev ? {
      ...prev, current: 2, total: 3,
      logLines: [...prev.logLines, { text: `Removed ${totalEntryRefs} unwanted tag references from ${cleanedEntries.filter((e) => e.isEdited).length} entries.`, level: 'info' }],
    } : null)

    // Step 3: Apply changes
    let changed = false
    if (catalogCleaned !== diaryCatalog) { applyDiaryCatalog(catalogCleaned); changed = true }
    // Reload current entries to pick up cleaned versions
    const currentMonthKeys = new Set([...loadedMonthKeys, ...entries.map((e) => getNotebookKey(e.diaryDate))])
    const reloadedEntries = cleanedEntries.filter((e) => currentMonthKeys.has(getNotebookKey(e.diaryDate)))
    if (reloadedEntries.length) { applyEntries(reloadedEntries); changed = true }

    const finalMsg = changed
      ? `Cleaned: ${catalogTagCount} catalog tags, ${removedTags} activities, ${removedPeople} people, ${removedPoi} POIs from entries.`
      : 'No unwanted tags found.'

    setSyncProgress((prev) => prev ? {
      ...prev, current: 3, total: 3,
      logLines: [...prev.logLines, { text: changed ? 'Clean complete.' : 'Nothing to clean.', level: 'info' }],
      message: finalMsg,
    } : null)
    setStatusMessage(finalMsg)
    // Auto-close progress after a moment so user can read results
    setTimeout(() => setSyncProgress(null), 2000)
  }

  function saveCatalogLocally() {
    const ns = normalizeSettings(settings)
    const nextCatalog = getDateReferencedCatalog(ns)
    setSettings(ns)
    saveSettings(ns)
    applyDiaryCatalog(nextCatalog)
    setStatusMessage('Catalog saved locally.')
  }

  async function pushCatalog() {
    const ns = normalizeSettings(settings)
    const nextCatalog = getDateReferencedCatalog(ns)
    setSettings(ns)
    saveSettings(ns)
    applyDiaryCatalog(nextCatalog)
    try {
      const adapter = await getDiarySyncAdapter(ns)
      const msg = `Pushing catalog to ${adapter.label}...`
      setStatusMessage(msg)
      setSyncProgress({ target: adapter.label, title: 'Push Catalog', message: msg, current: 0, total: 2, logLines: [{ text: 'Preparing catalog...', level: 'info' }] })
      await adapter.pushCatalog(nextCatalog, ns, (c, t, label) => setSyncProgress(prev => prev ? {
        target: adapter.label, title: 'Push Catalog',
        message: label ? `Pushed ${label} to ${adapter.label}.` : msg,
        current: c, total: t,
        logLines: appendLogLine(prev.logLines, label),
      } : null))
      setStatusMessage(`Catalog pushed to ${adapter.label}`)
      setSyncProgress(null)
    } catch (error) {
      const errorMessage = error instanceof Error ? `Push failed: ${error.message}` : 'Push failed.'
      setStatusMessage(errorMessage)
      setSyncProgress(prev => prev ? {
        ...prev,
        logLines: [...(prev.logLines ?? []), { text: errorMessage, level: 'error' }],
        errorLog: formatSyncErrorLog(error, ns),
      } : null)
    }
  }
  function exportCatalogFile() {
    const ns = normalizeSettings(settings); const ce = getDateReferencedCatalog(ns)
    setSettings(ns); saveSettings(ns); applyDiaryCatalog(ce)
    downloadTextFile(DIARY_CATALOG_FILE_NAME, serializeDiaryCatalog(ce), 'application/json;charset=utf-8')
    setStatusMessage(`Exported catalog: ${DIARY_CATALOG_FILE_NAME}`)
  }
  function getDateReferencedCatalog(ns: AppSettings): DiaryCatalog {
    let nextCatalog = diaryCatalog; const m = new Map<string, DiaryEntry>()
    for (const e of loadAllStoredEntries()) m.set(e.id, e)
    for (const e of entries) m.set(e.id, e)
    if (draft.savedAt || m.has(draft.id)) m.set(draft.id, draft)
    for (const e of m.values()) nextCatalog = syncDiaryCatalogEntry(nextCatalog, e)
    return stripGuidTagKeys(applySettingsToDiaryCatalog(nextCatalog, ns))
  }
  async function importCatalogFile(file: File) {
    try {
      const ic = deserializeDiaryCatalog(await file.text())
      if (!ic) { setStatusMessage(`Catalog import failed: ${file.name} is not a valid catalog file.`); return }
      const ns = applyDiaryCatalogToSettings(normalizeSettings(settings), ic)
      setSettings(ns); saveSettings(ns); applyDiaryCatalog(ic)
      setStatusMessage(`Imported catalog from ${file.name}. Click Save Catalog to sync it.`)
    } catch (error) { setStatusMessage(error instanceof Error ? `Catalog import failed: ${error.message}` : 'Catalog import failed.') }
  }
  async function pullCatalogFromProvider() {
    try {
      const ns = normalizeSettings(settings); const adapter = await getDiarySyncAdapter(ns); const sl = adapter.label
      const msg = `Pulling catalog from ${sl}...`
      setStatusMessage(msg)
      setSyncProgress({ target: adapter.label, title: 'Pull Catalog', message: msg, current: 0, total: 2, logLines: [{ text: 'Connecting...', level: 'info' }] })
      const rc = await adapter.pullCatalog(ns, (c, t, label) => setSyncProgress(prev => prev ? {
        target: adapter.label, title: 'Pull Catalog',
        message: label ?? msg,
        current: c, total: t,
        logLines: appendLogLine(prev.logLines, label),
      } : null))
      setSyncProgress(null)
      if (!rc) { setStatusMessage(`No catalog found on ${sl}.`); return }

      // Count tags before conversion (rc might be v1 or v2)
      const remoteCount = countCatalogTags(rc)
      const localCount = countCatalogTags(diaryCatalog)

      // Ask user: merge or override?
      const choice = window.confirm(
        `Catalog pulled from ${sl}.\n\n` +
        `Remote: ${remoteCount} tags\n` +
        `Local:  ${localCount} tags\n\n` +
        `Click OK to MERGE (combine both), or Cancel to OVERRIDE (replace local with remote).`
      )

      // mergeDiaryCatalogs converts v1→v2 automatically, generating GUIDs for name-based tags
      const nextCatalog = stripGuidTagKeys(mergeDiaryCatalogs(
        choice ? diaryCatalog : { ...diaryCatalog, activities: {}, people: {}, pointsOfInterest: {} },
        rc,
      ))
      setStatusMessage(choice
        ? `Catalog merged from ${sl}. Click Save to persist.`
        : `Local catalog replaced with remote from ${sl}. Click Save to persist.`)

      const next = applyDiaryCatalogToSettings(ns, nextCatalog)
      setSettings(next); saveSettings(next); applyDiaryCatalog(nextCatalog)
    } catch (error) {
      setSyncProgress(null)
      setStatusMessage(error instanceof Error ? `Catalog pull failed: ${error.message}` : 'Catalog pull failed.')
    }
  }

  function countCatalogTags(catalog: DiaryCatalog): number {
    return Object.keys(catalog.activities).length + Object.keys(catalog.people).length + Object.keys(catalog.pointsOfInterest).length
  }

  return (
    <main className="app-shell">
      <Sidebar draftId={draft.id} allEntriesLabel={allEntriesLabel} searchQuery={searchQuery} searchResultCount={sidebarSearchResultCount}
        selectedNotebook={selectedNotebook} syncTarget={syncTarget} tagFilter={tagFilter} tagFilterOptions={tagFilterOptions}
        notebookGroups={notebookGroups} expandedDecades={expandedDecades} expandedYears={expandedYears} expandedMonths={expandedMonths}
        isDraftDirty={isDraftDirty} unsavedEntryIds={unsavedEntryIds} contextMenu={contextMenu} statusMessage={sidebarStatusMessage}
        isCatalogOpen={currentPage === 'catalog'} isSettingsOpen={currentPage === 'settings'}
        onNewEntry={startNewEntry} onImportEvernoteFiles={(f) => { void handleImportEvernoteFiles(f) }}
        onOpenCatalog={() => setCurrentPage('catalog')} onOpenSettings={() => setCurrentPage('settings')}
        onSearchChange={setSearchQuery} onTagFilterChange={setTagFilter} onSelectEntry={handleEntryClick}
        onToggleDecade={toggleDecade} onToggleYear={toggleYear} onToggleMonth={toggleMonth}
        onOpenContextMenu={setContextMenu} onCloseContextMenu={() => setContextMenu(null)}
        onExportEntry={exportEntry} onPullEntry={(e) => { void pullSingleEntry(e) }} onPushEntry={(e) => { void pushSingleEntry(e) }}
        onDeleteEntry={requestDeleteEntry}
        onPushTarget={(t) => { void pushTargetEntries(t) }} onPullTarget={(t) => { void pullTargetEntries(t) }}
        onExportTarget={exportTargetEntries} onDeleteTarget={deleteTargetEntries}
        selectedEntryIds={selectedEntryIds} />
      <section className="editor">
        {currentPage === 'settings' || currentPage === 'catalog' ? (
          <SettingsPage variant={currentPage} settings={settings} draft={draft} entries={entries} diaryCatalog={diaryCatalog}
            onSettingsChange={setSettings} onDiaryCatalogChange={applyDiaryCatalog} onDraftChange={applyDraft}
            onEntriesChange={applyEntries} onStatusChange={setStatusMessage}
            onSave={currentPage === 'catalog' ? saveCatalogLocally : persistSettings}
            onPushCatalog={pushCatalog}
            onExportCatalog={exportCatalogFile} onImportCatalog={(f) => { void importCatalogFile(f) }}
            onPullCatalog={() => { void pullCatalogFromProvider() }} onNavigateDate={navigateToDate} onBack={() => setCurrentPage('diary')}
            onCleanCatalog={cleanCatalog} />
        ) : (
          <>
            <MetadataEditor draft={draft} entries={entries} diaryCatalog={diaryCatalog} settings={settings}
              onSettingsChange={setSettings} onUpdateDraft={updateDraft} onUpdateDraftIfCurrent={updateDraftIfCurrent}
              onDraftChange={applyDraft} onEntriesChange={applyEntries} onDiaryCatalogChange={applyDiaryCatalog}
              onStatusChange={setStatusMessage} onErrorLog={setSyncErrorLog}
              onNavigateDate={navigateToDate} />
            <EntryEditor content={draft.content} people={richTextTags.people} peopleOptions={peopleMentionOptions}
              personColorGroupNames={settings.personColorGroupNames} personColors={richTextTags.personColors}
              pointsOfInterest={richTextTags.pointsOfInterest} pointOfInterestColors={richTextTags.pointOfInterestColors}
              onContentChange={(c) => updateDraft({ content: c })} onPersonMention={mentionPerson}
              saveLabel={editedEntryCount > 1 ? 'Save All' : 'Save'} onSave={saveEditedEntries} />
          </>
        )}
      </section>
      {pendingDeleteEntry && <DeleteEntryDialog entry={pendingDeleteEntry}
        onCancel={() => setPendingDeleteEntry(null)} onDeleteLocal={() => { deleteLocalEntry(pendingDeleteEntry); setPendingDeleteEntry(null) }} />}
      {pendingForcePushTarget && <ForcePushDialog targetLabel={getSyncTargetLabel(pendingForcePushTarget)}
        entryCount={getSyncTargetEntries(entries, pendingForcePushTarget).length} onCancel={() => setPendingForcePushTarget(null)}
        onConfirm={() => { void forcePushTarget(pendingForcePushTarget) }} />}
      {pendingPullReview && <PullConflictDialog localEntry={pendingPullReview.conflicts[pendingPullReview.index].localEntry}
        cloudEntry={pendingPullReview.conflicts[pendingPullReview.index].cloudEntry}
        conflictIndex={pendingPullReview.index} conflictCount={pendingPullReview.conflicts.length}
        onCancel={() => { setPendingPullReview(null); setStatusMessage('Pull canceled.') }}
        onUseLocal={() => resolvePullConflict(false)} onUseCloud={() => resolvePullConflict(true)} />}
      {pushedDiaryDates && <PushSuccessDialog diaryDates={pushedDiaryDates} onClose={() => setPushedDiaryDates(null)} />}
      {syncProgress && <SyncProgressDialog target={syncProgress.target} title={syncProgress.title}
        message={syncProgress.message} current={syncProgress.current} total={syncProgress.total}
        logLines={syncProgress.logLines} errorLog={syncProgress.errorLog}
        onClose={() => setSyncProgress(null)} />}
      {pendingCloseConfirmation && <UnsavedCloseDialog unsavedCount={closeUnsavedCount}
        onCancel={() => setPendingCloseConfirmation(false)} onDiscard={closeWindowWithoutPrompt}
        onSave={() => { saveEditedEntries(); closeWindowWithoutPrompt() }} />}
      {syncErrorLog && !syncProgress && <SyncErrorDialog log={syncErrorLog} onClose={() => setSyncErrorLog(null)} />}
    </main>
  )
}
