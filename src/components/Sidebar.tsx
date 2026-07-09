import {
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  FilePlus2,
  Library,
  Settings,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiaryEntry, NotebookGroup, TagFilter, TagFilterKind, TagFilterOption } from '../domain/types'
import { getMoodBackgroundColor } from '../utils/colors'
import { formatDiaryDate } from '../utils/date'
import { isEntryUnsynced } from '../utils/diaryEntryHelpers'
import { DiaryWeatherIcon, EntryTagDots } from './DiaryIcons'

type SidebarContextMenu = {
  x: number
  y: number
  entry: DiaryEntry
}

type SidebarSyncTarget =
  | { kind: 'month'; key: string }
  | { kind: 'year'; year: string }

const tagKindOptions: Array<{ label: string; value: TagFilterKind }> = [
  { label: 'Locations', value: 'location' },
  { label: 'Activities', value: 'activity' },
  { label: 'People', value: 'person' },
]

type SidebarProps = {
  draftId: string
  searchQuery: string
  searchResultCount: number
  selectedNotebook: string | null
  selectedNotebookCount: number
  syncTarget: SidebarSyncTarget
  tagFilter: TagFilter
  tagFilterOptions: TagFilterOption[]
  notebookGroups: NotebookGroup[]
  expandedYears: Set<string>
  expandedMonths: Set<string>
  isDraftDirty: boolean
  unsavedEntryIds: Set<string>
  contextMenu: SidebarContextMenu | null
  statusMessage: string
  isCatalogOpen: boolean
  isSettingsOpen: boolean
  onNewEntry: () => void
  onImportEvernoteFiles: (files: File[]) => void
  onSync: () => void
  onPull: () => void
  onOpenCatalog: () => void
  onOpenSettings: () => void
  onSearchChange: (query: string) => void
  onTagFilterChange: (filter: TagFilter) => void
  onSelectNotebook: (key: string | null) => void
  onSelectEntry: (entry: DiaryEntry, notebookKey: string) => void
  onToggleYear: (year: string) => void
  onToggleMonth: (monthKey: string) => void
  onOpenContextMenu: (menu: SidebarContextMenu) => void
  onCloseContextMenu: () => void
  onExportEntry: (entry: DiaryEntry) => void
  onPullEntry: (entry: DiaryEntry) => void
  onPushEntry: (entry: DiaryEntry) => void
  onDeleteEntry: (entry: DiaryEntry) => void
}

export function Sidebar({
  draftId,
  searchQuery,
  searchResultCount,
  selectedNotebook,
  selectedNotebookCount,
  syncTarget,
  tagFilter,
  tagFilterOptions,
  notebookGroups,
  expandedYears,
  expandedMonths,
  isDraftDirty,
  unsavedEntryIds,
  contextMenu,
  statusMessage,
  isCatalogOpen,
  isSettingsOpen,
  onNewEntry,
  onImportEvernoteFiles,
  onSync,
  onPull,
  onOpenCatalog,
  onOpenSettings,
  onSearchChange,
  onTagFilterChange,
  onSelectNotebook,
  onSelectEntry,
  onToggleYear,
  onToggleMonth,
  onOpenContextMenu,
  onCloseContextMenu,
  onExportEntry,
  onPullEntry,
  onPushEntry,
  onDeleteEntry,
}: SidebarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const tagFilterMenuRef = useRef<HTMLDivElement>(null)
  const [isTagFilterMenuOpen, setIsTagFilterMenuOpen] = useState(false)
  const [activeTagKind, setActiveTagKind] = useState<TagFilterKind | null>(tagFilter.kind || null)
  const [activeTagColor, setActiveTagColor] = useState<string | null>(tagFilter.color || null)
  const tagFilterMenu = useMemo(() => {
    return tagKindOptions.map((kindOption) => {
      const options = tagFilterOptions
        .filter((option) => option.kind === kindOption.value)
        .sort((a, b) => a.name.localeCompare(b.name))
      const colorOptions = Array.from(
        new Map(options.filter((option) => option.color).map((option) => [option.color, option.colorLabel])).entries(),
      )

      return {
        ...kindOption,
        colorOptions,
        options,
      }
    })
  }, [tagFilterOptions])
  const activeKindMenu = tagFilterMenu.find((item) => item.value === activeTagKind)
  const activeColorTagOptions = activeKindMenu?.options
    .filter((option) => activeTagColor ? option.color === activeTagColor : true)
    .sort((a, b) => a.name.localeCompare(b.name)) ?? []
  const tagFilterSummary = getTagFilterSummary(tagFilter, tagFilterOptions, tagKindOptions)

  useEffect(() => {
    if (!isTagFilterMenuOpen)
      return

    function closeTagFilterMenuOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node))
        return

      if (tagFilterMenuRef.current?.contains(event.target))
        return

      setIsTagFilterMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeTagFilterMenuOnOutsideClick)

    return () => document.removeEventListener('pointerdown', closeTagFilterMenuOnOutsideClick)
  }, [isTagFilterMenuOpen])

  function openTagFilterMenu() {
    const nextOpen = !isTagFilterMenuOpen

    setIsTagFilterMenuOpen(nextOpen)

    if (!nextOpen)
      return

    const nextKind = tagFilter.kind || tagFilterMenu.find((item) => item.options.length)?.value || tagKindOptions[0].value
    const nextKindMenu = tagFilterMenu.find((item) => item.value === nextKind)

    setActiveTagKind(nextKind)
    setActiveTagColor(tagFilter.kind === nextKind ? tagFilter.color || nextKindMenu?.colorOptions[0]?.[0] || null : nextKindMenu?.colorOptions[0]?.[0] || null)
  }

  function applyTagKind(kind: TagFilterKind) {
    onTagFilterChange({ kind, color: '', tag: '' })
  }

  function applyTagColor(kind: TagFilterKind, color: string) {
    onTagFilterChange({ kind, color, tag: '' })
  }

  function applyConcreteTag(option: TagFilterOption) {
    onTagFilterChange({ kind: option.kind, color: option.color, tag: option.value })
    setIsTagFilterMenuOpen(false)
  }

  return (
    <aside className="sidebar">
      <div className="brand compact-brand">
        <div>
          <h1>Diary Book</h1>
        </div>
        <div className="brand-actions">
          <button className="sidebar-icon-button" type="button" onClick={onNewEntry} title="New entry">
            <FilePlus2 size={17} />
          </button>
          <button
            className="sidebar-icon-button"
            type="button"
            onClick={() => importInputRef.current?.click()}
            title="Import Evernote export"
          >
            <FileUp size={17} />
          </button>
          <input
            ref={importInputRef}
            className="sidebar-file-input"
            type="file"
            multiple
            accept=".html,.htm,.notes,.enex,text/html,text/xml,application/xml"
            aria-label="Import Evernote export"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])

              if (files.length)
                onImportEvernoteFiles(files)

              event.target.value = ''
            }}
          />
          <button
            className={isCatalogOpen ? 'settings-button selected' : 'settings-button'}
            type="button"
            title="Catalog"
            onClick={onOpenCatalog}
          >
            <Library size={17} />
          </button>
          <button
            className={isSettingsOpen ? 'settings-button selected' : 'settings-button'}
            type="button"
            title="Settings"
            onClick={onOpenSettings}
          >
            <Settings size={17} />
          </button>
        </div>
      </div>

      <div className="sidebar-search-tools">
        <label className="tag-filter-row">
          <span>Tag Filter</span>
          <div className="tag-filter-menu-wrap" ref={tagFilterMenuRef}>
            <button
              className={tagFilter.kind ? 'tag-filter-trigger active' : 'tag-filter-trigger'}
              type="button"
              onClick={openTagFilterMenu}
            >
              <span>{tagFilterSummary}</span>
              <ChevronDown size={14} />
            </button>
            {isTagFilterMenuOpen && (
              <div className="tag-filter-menu" role="menu">
                <div className="tag-filter-menu-column">
                  <button
                    className={!tagFilter.kind ? 'selected' : ''}
                    type="button"
                    onClick={() => {
                      onTagFilterChange({ kind: '', color: '', tag: '' })
                      setIsTagFilterMenuOpen(false)
                    }}
                  >
                    Any tag
                  </button>
                  {tagFilterMenu.map((kindOption) => (
                    <button
                      className={activeTagKind === kindOption.value ? 'selected' : ''}
                      key={kindOption.value}
                      type="button"
                      onClick={() => applyTagKind(kindOption.value)}
                      onMouseEnter={() => {
                        setActiveTagKind(kindOption.value)
                        setActiveTagColor(kindOption.colorOptions[0]?.[0] || null)
                      }}
                    >
                      <span>{kindOption.label}</span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </div>
                {activeKindMenu && (
                  <div className="tag-filter-menu-column">
                    <button
                      className={!tagFilter.color && tagFilter.kind === activeKindMenu.value ? 'selected' : ''}
                      type="button"
                      onClick={() => applyTagKind(activeKindMenu.value)}
                      onMouseEnter={() => setActiveTagColor(null)}
                    >
                      Any color
                    </button>
                    {activeKindMenu.colorOptions.map(([color, label]) => (
                      <button
                        className={activeTagColor === color ? 'tag-filter-color-item selected' : 'tag-filter-color-item'}
                        key={color}
                        type="button"
                        onClick={() => applyTagColor(activeKindMenu.value, color)}
                        onMouseEnter={() => setActiveTagColor(color)}
                      >
                        <span className="tag-filter-color-dot" style={{ backgroundColor: color }} />
                        <span>{label}</span>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </div>
                )}
                {activeKindMenu && (
                  <div className="tag-filter-menu-column tag-filter-menu-tags">
                    {activeColorTagOptions.length ? (
                      activeColorTagOptions.map((option) => (
                        <button
                          className={tagFilter.kind === option.kind && tagFilter.tag === option.value ? 'selected' : ''}
                          key={`${option.kind}-${option.value}`}
                          type="button"
                          onClick={() => applyConcreteTag(option)}
                        >
                          {option.name}
                        </button>
                      ))
                    ) : (
                      <span className="tag-filter-menu-empty">No tags</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </label>
        <label className="search-box">
          <span>Text Search</span>
          <div className="text-search-control">
            <Search size={18} />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search entry text"
            />
          </div>
        </label>
      </div>

      <div className="notebook-list">
        <button
          className={selectedNotebook ? 'notebook-all' : 'notebook-all selected'}
          type="button"
          onClick={() => onSelectNotebook(null)}
        >
          All Entries
          <span>{searchResultCount}</span>
        </button>
        {selectedNotebook && <p className="notebook-summary">{selectedNotebookCount} in selected notebook</p>}

        {notebookGroups.map((group) => {
          const isExpanded = expandedYears.has(group.year)
          const isSelectedYear = syncTarget.kind === 'year' && syncTarget.year === group.year

          return (
            <div className="year-group" key={group.year}>
              <button
                className={isSelectedYear ? 'year-toggle selected' : 'year-toggle'}
                type="button"
                onClick={() => onToggleYear(group.year)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{group.year}</span>
                <span>{group.months.reduce((sum, month) => sum + month.entryCount, 0)}</span>
              </button>

              {isExpanded && (
                <div className="month-list">
                  {group.months.map((month) => {
                    const unsyncedCount = month.isLoaded ? month.entries.filter(isEntryUnsynced).length : 0
                    const isSelectedMonth = syncTarget.kind === 'month' && syncTarget.key === month.key

                    return (
                      <div className={isSelectedMonth ? 'month-group selected' : 'month-group'} key={month.key}>
                        <button className="month-tab" type="button" onClick={() => onToggleMonth(month.key)}>
                          {expandedMonths.has(month.key) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span>{month.label}</span>
                          <span className={unsyncedCount ? 'month-count has-unsynced' : 'month-count'}>
                            {formatMonthEntryCount(month.entryCount, unsyncedCount)}
                          </span>
                        </button>

                        {expandedMonths.has(month.key) &&
                          (!selectedNotebook || selectedNotebook === month.key) &&
                          month.entries.map((entry) => (
                            <button
                              className={getEntryItemClassName(entry, draftId, isDraftDirty, unsavedEntryIds)}
                              key={entry.id}
                              type="button"
                              title={getEntryItemTitle(entry, draftId, isDraftDirty, unsavedEntryIds)}
                              style={{ backgroundColor: isEntryUnsynced(entry) ? 'transparent' : getMoodBackgroundColor(entry.mood) }}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                onOpenContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  entry,
                                })
                              }}
                              onClick={() => onSelectEntry(entry, month.key)}
                            >
                              <DiaryWeatherIcon entry={entry} />
                              <span className="entry-date">{formatDiaryDate(entry.diaryDate)}</span>
                              <span className="entry-word-count">{formatWordCount(entry.content)}</span>
                              <EntryTagDots entry={entry} />
                            </button>
                          ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={onCloseContextMenu}
        >
          <button type="button" onClick={() => onPullEntry(contextMenu.entry)}>
            <Download size={14} />
            Pull Entry
          </button>
          <button type="button" onClick={() => onPushEntry(contextMenu.entry)}>
            <Upload size={14} />
            Push Entry
          </button>
          <button type="button" onClick={() => onExportEntry(contextMenu.entry)}>
            <Download size={14} />
            Export Entry
          </button>
          <button className="danger-menu-item" type="button" onClick={() => onDeleteEntry(contextMenu.entry)}>
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}

      <div className="sync-panel">
        <button type="button" onClick={onPull} title="Pull Markdown entries from the sync provider">
          <Download size={18} />
          Pull
        </button>
        <button type="button" onClick={onSync} title="Push unsynced entries in the selected year or month to the sync provider">
          <Upload size={18} />
          Push
        </button>
        <p>{statusMessage}</p>
      </div>
    </aside>
  )
}

function getEntryItemClassName(
  entry: DiaryEntry,
  draftId: string,
  isDraftDirty: boolean,
  unsavedEntryIds: Set<string>,
): string {
  const classNames = ['entry-item']

  if (entry.id === draftId)
    classNames.push('selected')

  if (isEntryUnsaved(entry, draftId, isDraftDirty, unsavedEntryIds))
    classNames.push('unsaved')

  if (isEntryUnsynced(entry))
    classNames.push('unsynced')

  return classNames.join(' ')
}

function getEntryItemTitle(
  entry: DiaryEntry,
  draftId: string,
  isDraftDirty: boolean,
  unsavedEntryIds: Set<string>,
): string {
  const isUnsaved = isEntryUnsaved(entry, draftId, isDraftDirty, unsavedEntryIds)
  const isUnsynced = isEntryUnsynced(entry)

  if (isUnsaved && isUnsynced)
    return 'Unsaved local changes; saved version is not pushed'

  if (isUnsaved)
    return 'Unsaved local changes'

  if (isUnsynced)
    return 'Not pushed'

  return 'Synced'
}

function isEntryUnsaved(
  entry: DiaryEntry,
  draftId: string,
  isDraftDirty: boolean,
  unsavedEntryIds: Set<string>,
): boolean {
  return unsavedEntryIds.has(entry.id) || (entry.id === draftId && isDraftDirty)
}

function formatMonthEntryCount(entryCount: number, unsyncedCount: number): string {
  if (!unsyncedCount)
    return String(entryCount)

  return `${entryCount} (${unsyncedCount} unsynced)`
}

function getTagFilterSummary(
  tagFilter: TagFilter,
  tagFilterOptions: TagFilterOption[],
  kindOptions: Array<{ label: string; value: TagFilterKind }>,
): string {
  if (!tagFilter.kind)
    return 'Any tag'

  const kindLabel = kindOptions.find((option) => option.value === tagFilter.kind)?.label ?? 'Tag'
  const selectedTag = tagFilterOptions.find((option) => option.kind === tagFilter.kind && option.value === tagFilter.tag)
  const selectedColor = tagFilterOptions.find((option) => option.kind === tagFilter.kind && option.color === tagFilter.color)

  if (selectedTag)
    return `${kindLabel} / ${selectedTag.colorLabel} / ${selectedTag.name}`

  if (tagFilter.color && selectedColor)
    return `${kindLabel} / ${selectedColor.colorLabel}`

  return kindLabel
}

function formatWordCount(content: string): string {
  const count = content.trim().split(/\s+/).filter(Boolean).length

  return `${count} ${count === 1 ? 'word' : 'words'}`
}
