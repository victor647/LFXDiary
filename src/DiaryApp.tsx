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
import { DEFAULT_TAG_COLOR, MAX_PEOPLE_PER_ENTRY } from './domain/constants'
import {
  DIARY_CATALOG_FILE_NAME,
  applyDiaryCatalogToSettings,
  applySettingsToDiaryCatalog,
  deserializeDiaryCatalog,
  mergeDiaryCatalogs,
  removeDiaryCatalogEntry,
  serializeDiaryCatalog,
  syncDiaryCatalogEntry,
} from './domain/diaryCatalog'
import { serializeDiaryEntryMarkdown } from './domain/diaryEntrySerialization'
import type { AppSettings, DiaryCatalog, DiaryEntry, PendingPullReview, SyncProgress, SyncTarget, TagFilter } from './domain/types'
import { formatDiaryDate, getNotebookKey, getNotebookYear, toDateInputValue } from './utils/date'
import {
  getEditedEntryCount,
  getSidebarStatusMessage,
  getUnsavedEntryIds,
  getUnuploadedEntryCount,
  hasCloudCopy,
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
import { getSettingsPersonColor, getSettingsPointOfInterestColor, loadSettings, normalizeSettings, saveSettings } from './utils/settings'
import { formatSyncErrorLog } from './utils/syncErrorLog'
import { normalizePersonTag, normalizePersonTags, normalizePointOfInterestTag } from './utils/tags'
import { getDecadeKey, getFilteredMonthEntryCounts, getTagFilterEntryReferences, getTagFilterOptions, sumMonthEntryCounts } from './utils/diaryFilterHelpers'
import { getSyncTargetEntries, getSyncTargetLabel, getSyncTargetNotebookKeys, getSyncTargetPullSource } from './utils/syncTargetHelpers'
import { importEvernoteFiles } from './application/importOperations'

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: DiaryEntry } | null>(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<DiaryEntry | null>(null)
  const [pendingForcePushTarget, setPendingForcePushTarget] = useState<SyncTarget | null>(null)
  const [pendingPullReview, setPendingPullReview] = useState<PendingPullReview | null>(null)
  const [pushedDiaryDates, setPushedDiaryDates] = useState<string[] | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [pendingCloseConfirmation, setPendingCloseConfirmation] = useState(false)
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
      if (tagFilterEntryReferences && !tagFilterEntryReferences.has(entry.diaryDate) && !tagFilterEntryReferences.has(entry.id)) return false
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
    for (const r of draft.people ?? []) { const n = normalizePersonTag(r); if (!n) continue; const c = getSettingsPersonColor(settings, n) ?? draft.personColors?.[n]; p.add(n); if (c) pc[n] = c }
    for (const r of draft.pointsOfInterest ?? []) { const n = normalizePointOfInterestTag(r); if (!n) continue; const c = getSettingsPointOfInterestColor(settings, n) ?? draft.pointOfInterestColors?.[n]; pi.add(n); if (c) pic[n] = c }
    return { people: Array.from(p), personColors: pc, pointsOfInterest: Array.from(pi), pointOfInterestColors: pic }
  }, [draft.people, draft.personColors, draft.pointOfInterestColors, draft.pointsOfInterest, settings])
  const peopleMentionOptions = useMemo(() => getPeopleMentionOptions(settings, diaryCatalog, draft), [diaryCatalog, draft, settings])
  const hasUnsavedEntries = isDraftDirty || unsavedEntryIds.size > 0
  const closeUnsavedCount = hasUnsavedEntries ? Math.max(1, unsavedEntryIds.size) : 0
  const sidebarStatusMessage = getSidebarStatusMessage(unsavedEntryIds.size, unuploadedEntryCount) ?? statusMessage

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
    setEntries((current) => {
      const re = typeof nextEntries === 'function' ? nextEntries(current) : nextEntries
      const ms = new Set(nextLoadedMonthKeys); const ids = new Set(re.map((e) => e.id)); const ds = new Set(re.map((e) => e.diaryDate))
      const rd = current.filter((e) => !ids.has(e.id) && !ds.has(e.diaryDate)).map((e) => e.diaryDate)
      for (const e of re) ms.add(getNotebookKey(e.diaryDate))
      setMonthIndex(saveLoadedEntries(re, ms))
      setDiaryCatalog((cc) => { let nc = cc; for (const d of rd) nc = removeDiaryCatalogEntry(nc, d); for (const e of re) nc = syncDiaryCatalogEntry(nc, e); if (ids.has(draft.id)) nc = syncDiaryCatalogEntry(nc, draft); saveStoredDiaryCatalog(nc); return nc })
      return re
    })
  }
  function applyDraft(nextDraft: DiaryEntry | ((current: DiaryEntry) => DiaryEntry)) {
    setDraft((c) => { const rd = typeof nextDraft === 'function' ? nextDraft(c) : nextDraft; setDiaryCatalog((cc) => { const nc = syncDiaryCatalogEntry(cc, rd); if (entries.some((e) => e.id === rd.id)) saveStoredDiaryCatalog(nc); return nc }); return rd })
  }
  function applyDiaryCatalog(nextCatalog: DiaryCatalog) { setDiaryCatalog(nextCatalog); saveStoredDiaryCatalog(nextCatalog) }
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
  function mentionPerson(person: { name: string; color: string }, content: string) {
    const normalizedPerson = normalizePersonTag(person.name)
    if (!normalizedPerson) { updateDraft({ content }); return }
    updateDraft({ content, people: normalizePersonTags([...draft.people, normalizedPerson]).slice(0, MAX_PEOPLE_PER_ENTRY), personColors: { ...draft.personColors, [normalizedPerson]: person.color || DEFAULT_TAG_COLOR } })
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
    try {
      const ns = normalizeSettings(settings)
      const adapter = await getDiarySyncAdapter(ns)
      const st = adapter.label
      const msg = `${isForce ? 'Force pushing' : 'Pushing'} ${toPush.length} ${toPush.length === 1 ? 'entry' : 'entries'} to ${st}...`
      setStatusMessage(msg); setSyncProgress({ target: st, message: msg, current: 0, total: toPush.length })
      await adapter.pushEntries(toPush, ns, loadAllStoredEntries(), (c, t) => setSyncProgress({ target: st, message: msg, current: c, total: t }))
      const syncedAt = new Date().toISOString()
      const pushed = toPush.map((e) => ({ ...e, syncedAt, isEdited: false }))
      const dest = adapter.getPushDestination(ns, toPush[0] ?? nd)
      applyDraft((c) => pushed.find((e) => e.id === c.id) ?? c)
      applyEntries((c) => upsertEntries(c, pushed))
      setPushedDiaryDates(pushed.map((e) => e.diaryDate))
      setStatusMessage(`${isForce ? 'Force pushed' : 'Pushed'} ${toPush.length} ${toPush.length === 1 ? 'entry' : 'entries'} from ${targetLabel} to ${dest}`)
    } catch (error) { const ns = normalizeSettings(settings); const a = await getDiarySyncAdapter(ns); setStatusMessage(error instanceof Error ? error.message : `${a.label} push failed.`); setSyncErrorLog(formatSyncErrorLog(error, ns, toPush[0] ?? nd)) }
    finally { setSyncProgress(null) }
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

  async function pullEntriesFromNas() {
    try {
      const ns = normalizeSettings(settings)
      const adapter = await getDiarySyncAdapter(ns)
      const sl = adapter.label; const target = syncTarget
      const tl = getSyncTargetLabel(target); const tns = getSyncTargetNotebookKeys(target)
      let le = entries
      if (isDraftDirty) { const sd = getSavedDraftEntry(draft, new Date().toISOString()); le = upsertEntry(entries, sd); applyDraft(sd); applyEntries(le) }
      revealSyncTarget(target)
      const msg = `Pulling Markdown entries from ${tl} on ${sl}...`
      setStatusMessage(msg); setSyncProgress({ target: sl, message: msg })
      const pulled = await adapter.pullNotebookEntries(ns, tns, { onProgress: (c, t) => setSyncProgress({ target: sl, message: msg, current: c, total: t }) })
      if (!pulled.length) { setStatusMessage(`No Markdown entries found in ${tl} on ${sl}.`); return }
      const localDates = new Set(le.map((e) => e.diaryDate))
      const newPulled = pulled.filter((e) => !localDates.has(e.diaryDate))
      if (!newPulled.length) { setStatusMessage(`All entries in ${tl} already exist locally.`); return }
      const sp = newPulled.map((e) => ({ ...e, syncedAt: new Date().toISOString(), isEdited: false }))
      const conflicts = getPullConflicts(le, sp)
      if (conflicts.length) {
        const cds = new Set(conflicts.map((c) => c.cloudEntry.diaryDate))
        setPendingPullReview({ syncTarget: sl, target, targetLabel: tl, baseEntries: le, resolvedEntries: sp.filter((e) => !cds.has(e.diaryDate)), conflicts, index: 0 })
        setStatusMessage(`Resolve ${conflicts.length} pull ${conflicts.length === 1 ? 'conflict' : 'conflicts'} from ${sl}.`)
        return
      }
      finishPulled(sp, sl, le, target)
    } catch (error) { const ns = normalizeSettings(settings); const a = await getDiarySyncAdapter(ns); setStatusMessage(error instanceof Error ? error.message : `${a.label} pull failed.`); setSyncErrorLog(formatSyncErrorLog(error, ns, undefined, getSyncTargetPullSource(a, ns, syncTarget))) }
    finally { setSyncProgress(null) }
  }
  async function pullSingleEntry(entry: DiaryEntry) {
    setContextMenu(null)
    try {
      const ns = normalizeSettings(settings); const adapter = await getDiarySyncAdapter(ns)
      const sl = adapter.label; const tn = getNotebookKey(entry.diaryDate)
      let le = entries
      if (isDraftDirty) { const sd = getSavedDraftEntry(draft, new Date().toISOString()); le = upsertEntry(entries, sd); applyDraft(sd); applyEntries(le) }
      if (le.some((e) => e.diaryDate === entry.diaryDate)) { setStatusMessage(`Entry for ${formatDiaryDate(entry.diaryDate)} already exists locally.`); return }
      revealSyncTarget({ kind: 'entry', key: entry.diaryDate, notebookKey: tn })
      const msg = `Pulling ${formatDiaryDate(entry.diaryDate)} from ${sl}...`
      setStatusMessage(msg); setSyncProgress({ target: sl, message: msg })
      const pulled = await adapter.pullEntries(ns, tn, (c, t) => setSyncProgress({ target: sl, message: msg, current: c, total: t }))
      const pe = pulled.find((item) => item.diaryDate === entry.diaryDate)
      if (!pe) { setStatusMessage(`No Markdown entry found for ${formatDiaryDate(entry.diaryDate)} on ${sl}.`); return }
      const sp = { ...pe, syncedAt: new Date().toISOString(), isEdited: false }
      const conflicts = getPullConflicts(le, [sp])
      if (conflicts.length) { setPendingPullReview({ syncTarget: sl, target: { kind: 'month', key: tn }, targetLabel: tn, baseEntries: le, resolvedEntries: [], conflicts, index: 0 }); setStatusMessage(`Resolve pull conflict for ${formatDiaryDate(entry.diaryDate)} from ${sl}.`); return }
      finishPulled([sp], sl, le, { kind: 'month', key: tn })
    } catch (error) { const ns = normalizeSettings(settings); const a = await getDiarySyncAdapter(ns); setStatusMessage(error instanceof Error ? error.message : `${a.label} pull failed.`); setSyncErrorLog(formatSyncErrorLog(error, ns, entry)) }
    finally { setSyncProgress(null) }
  }
  function finishPulled(pulled: DiaryEntry[], st: string, base: DiaryEntry[], target: SyncTarget, resolvedCount = 0) {
    const next = mergePulledEntries(base, pulled)
    const newest = [...pulled].sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))[0]
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
  function requestDeleteEntry(entry: DiaryEntry) { setContextMenu(null); if (hasCloudCopy(entry)) { setPendingDeleteEntry(entry); return }; deleteLocalEntry(entry) }
  function deleteLocalEntry(entry: DiaryEntry) {
    const next = entries.filter((item) => item.id !== entry.id); applyEntries(next)
    if (draft.id === entry.id) { const nd = next[0] ?? makeBlankEntry(); applyDraft(nd); setSelectedNotebook(next[0] ? getNotebookKey(nd.diaryDate) : null) }
    setStatusMessage(`Deleted local entry: ${formatDiaryDate(entry.diaryDate)}`)
  }
  async function deleteEntryEverywhere(entry: DiaryEntry) {
    const ns = normalizeSettings(settings); const nextEntries = entries.filter((item) => item.id !== entry.id)
    try {
      const adapter = await getDiarySyncAdapter(ns); setPendingDeleteEntry(null)
      setStatusMessage(`Deleting ${formatDiaryDate(entry.diaryDate)} from ${adapter.label}...`)
      await adapter.deleteEntry(entry, ns, loadAllStoredEntries().filter((item) => item.id !== entry.id))
      applyEntries(nextEntries)
      if (draft.id === entry.id) { const nd = nextEntries[0] ?? makeBlankEntry(); applyDraft(nd); setSelectedNotebook(nextEntries[0] ? getNotebookKey(nd.diaryDate) : null) }
      setStatusMessage(`Deleted ${formatDiaryDate(entry.diaryDate)} locally and from ${adapter.label}`)
    } catch (error) { setStatusMessage(error instanceof Error ? error.message : 'Delete failed.'); setSyncErrorLog(formatSyncErrorLog(error, ns, entry)) }
  }

  function persistSettings() { const ns = normalizeSettings(settings); setSettings(ns); saveSettings(ns); setStatusMessage('Settings saved locally') }
  async function persistCatalog() {
    const ns = normalizeSettings(settings); const nextCatalog = getDateReferencedCatalog(ns)
    setSettings(ns); saveSettings(ns); applyDiaryCatalog(nextCatalog)
    try {
      const adapter = await getDiarySyncAdapter(ns); const msg = `Syncing catalog to ${adapter.label}...`
      setStatusMessage(msg); setSyncProgress({ target: adapter.label, title: 'Saving Catalog', message: msg, current: 0, total: 2 })
      await adapter.pushCatalog(nextCatalog, ns, (c, t, l) => setSyncProgress({ target: adapter.label, title: 'Saving Catalog', message: l ? `Synced ${l} to ${adapter.label}.` : msg, current: c, total: t }))
      setStatusMessage(`Catalog saved and synced to ${adapter.label}`)
    } catch (error) { setStatusMessage(error instanceof Error ? `Catalog saved locally. Sync failed: ${error.message}` : 'Catalog saved locally. Sync failed.'); setSyncErrorLog(formatSyncErrorLog(error, ns)) }
    finally { setSyncProgress(null) }
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
    return applySettingsToDiaryCatalog(nextCatalog, ns)
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
      setStatusMessage(`Pulling catalog from ${sl}...`); const rc = await adapter.pullCatalog(ns)
      if (!rc) { setStatusMessage(`No catalog found on ${sl}.`); return }
      const mc = mergeDiaryCatalogs(rc, diaryCatalog); const next = applyDiaryCatalogToSettings(ns, mc)
      setSettings(next); saveSettings(next); applyDiaryCatalog(mc)
      setStatusMessage(`Catalog pulled from ${sl}. Click Save Catalog to persist.`)
    } catch (error) { setStatusMessage(error instanceof Error ? `Catalog pull failed: ${error.message}` : 'Catalog pull failed.') }
  }

  return (
    <main className="app-shell">
      <Sidebar draftId={draft.id} allEntriesLabel={allEntriesLabel} searchQuery={searchQuery} searchResultCount={sidebarSearchResultCount}
        selectedNotebook={selectedNotebook} syncTarget={syncTarget} tagFilter={tagFilter} tagFilterOptions={tagFilterOptions}
        notebookGroups={notebookGroups} expandedDecades={expandedDecades} expandedYears={expandedYears} expandedMonths={expandedMonths}
        isDraftDirty={isDraftDirty} unsavedEntryIds={unsavedEntryIds} contextMenu={contextMenu} statusMessage={sidebarStatusMessage}
        isCatalogOpen={currentPage === 'catalog'} isSettingsOpen={currentPage === 'settings'}
        onNewEntry={startNewEntry} onImportEvernoteFiles={(f) => { void handleImportEvernoteFiles(f) }}
        onSync={pushSelectedEntries} onPull={pullEntriesFromNas} onForcePull={pullEntriesFromNas}
        onOpenCatalog={() => setCurrentPage('catalog')} onOpenSettings={() => setCurrentPage('settings')}
        onSearchChange={setSearchQuery} onTagFilterChange={setTagFilter} onSelectEntry={selectEntry}
        onToggleDecade={toggleDecade} onToggleYear={toggleYear} onToggleMonth={toggleMonth}
        onOpenContextMenu={setContextMenu} onCloseContextMenu={() => setContextMenu(null)}
        onExportEntry={exportEntry} onPullEntry={(e) => { void pullSingleEntry(e) }} onPushEntry={(e) => { void pushSingleEntry(e) }}
        onDeleteEntry={requestDeleteEntry} />
      <section className="editor">
        {currentPage === 'settings' || currentPage === 'catalog' ? (
          <SettingsPage variant={currentPage} settings={settings} draft={draft} entries={entries} diaryCatalog={diaryCatalog}
            onSettingsChange={setSettings} onDiaryCatalogChange={applyDiaryCatalog} onDraftChange={applyDraft}
            onEntriesChange={applyEntries} onStatusChange={setStatusMessage}
            onSave={currentPage === 'catalog' ? persistCatalog : persistSettings}
            onExportCatalog={exportCatalogFile} onImportCatalog={(f) => { void importCatalogFile(f) }}
            onPullCatalog={() => { void pullCatalogFromProvider() }} onBack={() => setCurrentPage('diary')} />
        ) : (
          <>
            <MetadataEditor draft={draft} entries={entries} diaryCatalog={diaryCatalog} settings={settings}
              onSettingsChange={setSettings} onUpdateDraft={updateDraft} onUpdateDraftIfCurrent={updateDraftIfCurrent}
              onDraftChange={applyDraft} onEntriesChange={applyEntries} onStatusChange={setStatusMessage} onErrorLog={setSyncErrorLog} />
            <EntryEditor content={draft.content} people={richTextTags.people} peopleOptions={peopleMentionOptions}
              personColorGroupNames={settings.personColorGroupNames} personColors={richTextTags.personColors}
              pointsOfInterest={richTextTags.pointsOfInterest} pointOfInterestColors={richTextTags.pointOfInterestColors}
              onContentChange={(c) => updateDraft({ content: c })} onPersonMention={mentionPerson}
              saveLabel={editedEntryCount > 1 ? 'Save All' : 'Save'} onSave={saveEditedEntries} />
          </>
        )}
      </section>
      {pendingDeleteEntry && <DeleteEntryDialog entry={pendingDeleteEntry} syncProvider={normalizeSettings(settings).syncProvider}
        onCancel={() => setPendingDeleteEntry(null)} onDeleteLocal={() => { deleteLocalEntry(pendingDeleteEntry); setPendingDeleteEntry(null) }}
        onDeleteEverywhere={() => { void deleteEntryEverywhere(pendingDeleteEntry) }} />}
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
        message={syncProgress.message} current={syncProgress.current} total={syncProgress.total} />}
      {pendingCloseConfirmation && <UnsavedCloseDialog unsavedCount={closeUnsavedCount}
        onCancel={() => setPendingCloseConfirmation(false)} onDiscard={closeWindowWithoutPrompt}
        onSave={() => { saveEditedEntries(); closeWindowWithoutPrompt() }} />}
      {syncErrorLog && <SyncErrorDialog log={syncErrorLog} onClose={() => setSyncErrorLog(null)} />}
    </main>
  )
}
