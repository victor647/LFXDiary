import {
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  FilePlus2,
  Library,
  MapPin,
  PersonStanding,
  Settings,
  Search,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiaryEntry, NotebookGroup, SyncTarget, TagFilter, TagFilterKind, TagFilterOption } from '../domain/types'
import { getMoodBackgroundColor, getTagBackgroundColor, getTagTextColor, resolveColorHex } from '../utils/colors'
import { formatDiaryDate } from '../utils/date'
import { isEntryUnsynced } from '../utils/diaryEntryHelpers'
import { DiaryWeatherIcon, EntryTagDots } from './DiaryIcons'

type SidebarContextMenu =
  | { x: number; y: number; entry: DiaryEntry }
  | { x: number; y: number; kind: 'month'; key: string; isEmpty?: boolean }
  | { x: number; y: number; kind: 'year'; year: string }

type SidebarSyncTarget =
  | { kind: 'entry'; key: string; notebookKey: string }
  | { kind: 'month'; key: string }
  | { kind: 'year'; year: string }
  | { kind: 'decade'; decade: string }

const tagKindOptions: Array<{ label: string; value: TagFilterKind; title: string }> = [
  { label: 'Locations', value: 'location', title: 'Add location filter' },
  { label: 'Activities', value: 'activity', title: 'Add activity filter' },
  { label: 'People', value: 'person', title: 'Add people filter' },
  { label: 'Points of Interest', value: 'pointOfInterest', title: 'Add point of interest filter' },
]

type SidebarProps = {
  draftId: string
  allEntriesLabel: string
  searchQuery: string
  searchResultCount: number
  selectedNotebook: string | null
  syncTarget: SidebarSyncTarget
  tagFilter: TagFilter
  tagFilterOptions: TagFilterOption[]
  notebookGroups: NotebookGroup[]
  expandedDecades: Set<string>
  expandedYears: Set<string>
  expandedMonths: Set<string>
  isDraftDirty: boolean
  unsavedEntryIds: Set<string>
  contextMenu: SidebarContextMenu | null
  statusMessage: string
  isCatalogOpen: boolean
  isSettingsOpen: boolean
  selectedEntryIds: Set<string>
  selectedMonthKeys: Set<string>
  selectedYearKeys: Set<string>
  onNewEntry: () => void
  onImportEvernoteFiles: (files: File[]) => void
  onOpenCatalog: () => void
  onOpenSettings: () => void
  onSearchChange: (query: string) => void
  onTagFilterChange: (filter: TagFilter) => void
  onSelectEntry: (entry: DiaryEntry, notebookKey: string, event: { ctrlKey: boolean; shiftKey: boolean }) => void
  onToggleDecade: (decade: string) => void
  onSelectYear: (year: string, event: { ctrlKey: boolean; shiftKey: boolean }) => void
  onSelectMonth: (monthKey: string, event: { ctrlKey: boolean; shiftKey: boolean }) => void
  onOpenContextMenu: (menu: SidebarContextMenu) => void
  onCloseContextMenu: () => void
  onExportEntry: (entry: DiaryEntry) => void
  onPullEntry: (entry: DiaryEntry) => void
  onPushEntry: (entry: DiaryEntry) => void
  onDeleteEntry: (entry: DiaryEntry) => void
  onPushTarget: (target: SyncTarget) => void
  onPullTarget: (target: SyncTarget) => void
  onExportTarget: (target: SyncTarget) => void
  onDeleteTarget: (target: SyncTarget) => void
}

export function Sidebar({
  draftId,
  allEntriesLabel,
  searchQuery,
  searchResultCount,
  selectedNotebook,
  syncTarget,
  tagFilter,
  tagFilterOptions,
  notebookGroups,
  expandedDecades,
  expandedYears,
  expandedMonths,
  isDraftDirty,
  unsavedEntryIds,
  contextMenu,
  statusMessage,
  isCatalogOpen,
  isSettingsOpen,
  selectedEntryIds,
  selectedMonthKeys,
  selectedYearKeys,
  onNewEntry,
  onImportEvernoteFiles,
  onOpenCatalog,
  onOpenSettings,
  onSearchChange,
  onTagFilterChange,
  onSelectEntry,
  onToggleDecade,
  onSelectYear,
  onSelectMonth,
  onOpenContextMenu,
  onCloseContextMenu,
  onExportEntry,
  onPullEntry,
  onPushEntry,
  onDeleteEntry,
  onPushTarget,
  onPullTarget,
  onExportTarget,
  onDeleteTarget,
}: SidebarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const tagFilterMenuRef = useRef<HTMLDivElement>(null)
  const [isTagFilterMenuOpen, setIsTagFilterMenuOpen] = useState(false)
  const [activeTagKind, setActiveTagKind] = useState<TagFilterKind | null>(tagFilter.kind || tagFilter.tags[0]?.kind || null)
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
  const selectedTagFilterOptions = useMemo(() => {
    return tagFilter.tags
      .map((selectedTag) => tagFilterOptions.find((option) => option.kind === selectedTag.kind && option.value === selectedTag.tag))
      .filter((option): option is TagFilterOption => Boolean(option))
  }, [tagFilter.tags, tagFilterOptions])
  const decadeGroups = useMemo(() => groupNotebookYearsByDecade(notebookGroups), [notebookGroups])

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

  function openTagFilterMenu(kind: TagFilterKind) {
    const nextOpen = activeTagKind === kind ? !isTagFilterMenuOpen : true

    setIsTagFilterMenuOpen(nextOpen)
    setActiveTagKind(kind)

    if (!nextOpen)
      return

    setActiveTagColor(tagFilterMenu.find((item) => item.value === kind)?.colorOptions[0]?.[0] || null)
  }

  function applyTagColor(kind: TagFilterKind, color: string) {
    setActiveTagKind(kind)
    setActiveTagColor(color)
  }

  function applyConcreteTag(option: TagFilterOption) {
    if (tagFilter.tags.some((tag) => tag.kind === option.kind && tag.tag === option.value))
      return

    onTagFilterChange({
      kind: option.kind,
      color: option.color,
      tag: option.value,
      tags: [...tagFilter.tags, { kind: option.kind, tag: option.value }],
    })
  }

  function removeConcreteTag(option: TagFilterOption) {
    const tags = tagFilter.tags.filter((tag) => !(tag.kind === option.kind && tag.tag === option.value))
    const lastTag = tags[tags.length - 1]
    const lastOption = lastTag
      ? tagFilterOptions.find((item) => item.kind === lastTag.kind && item.value === lastTag.tag)
      : null

    onTagFilterChange({
      kind: lastOption?.kind ?? '',
      color: lastOption?.color ?? '',
      tag: lastOption?.value ?? '',
      tags,
    })
  }

  function clearTagFilters() {
    onTagFilterChange({ kind: '', color: '', tag: '', tags: [] })
    setIsTagFilterMenuOpen(false)
  }

  function isConcreteTagSelected(option: TagFilterOption): boolean {
    return tagFilter.tags.some((tag) => tag.kind === option.kind && tag.tag === option.value)
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
          <div className="tag-filter-menu-wrap tag-filter-icon-wrap" ref={tagFilterMenuRef}>
            <div className="tag-filter-icon-bar">
              {tagKindOptions.map((kindOption) => (
                <button
                  className={activeTagKind === kindOption.value && isTagFilterMenuOpen ? 'tag-filter-kind-button selected' : 'tag-filter-kind-button'}
                  key={kindOption.value}
                  type="button"
                  title={kindOption.title}
                  onClick={() => openTagFilterMenu(kindOption.value)}
                >
                  {getTagKindIcon(kindOption.value)}
                </button>
              ))}
            </div>
            {isTagFilterMenuOpen && activeKindMenu && (
              <div className="activity-recent-popover tag-filter-selector-popover" role="menu">
                {activeKindMenu.colorOptions.length ? (
                  activeKindMenu.colorOptions.map(([color, label]) => {
                    const isExpanded = color === activeTagColor
                    const colorOptions = activeKindMenu.options
                      .filter((option) => option.color === color)
                      .sort((a, b) => a.name.localeCompare(b.name))

                    return (
                      <div
                        className="activity-color-group"
                        key={color}
                        onMouseEnter={() => applyTagColor(activeKindMenu.value, color)}
                      >
                        <button
                          className="activity-color-toggle"
                          type="button"
                          title={label}
                          onClick={() => applyTagColor(activeKindMenu.value, color)}
                        >
                          <span className="activity-color-toggle-main">
                            <span className="activity-color-dot" style={{ backgroundColor: resolveColorHex(color) ?? color }} />
                            <span>{label}</span>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                        {isExpanded && (
                          <div className="activity-color-options">
                            {colorOptions.map((option) => (
                              <button
                                className={isConcreteTagSelected(option) ? 'selected' : ''}
                                key={`${option.kind}-${option.value}`}
                                type="button"
                                title={option.name}
                                style={{
                                  backgroundColor: getTagBackgroundColor(option.color),
                                  borderColor: resolveColorHex(option.color) ?? option.color,
                                  color: getTagTextColor(option.color),
                                }}
                                onClick={() => applyConcreteTag(option)}
                              >
                                {option.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <span className="tag-filter-menu-empty">No tags</span>
                )}
                {!!tagFilter.tags.length && (
                  <button
                    className="activity-other-option"
                    type="button"
                    onClick={clearTagFilters}
                  >
                    Clear filters
                  </button>
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
        {!!selectedTagFilterOptions.length && (
          <div className="selected-tag-filters" aria-label="Selected tag filters">
            {selectedTagFilterOptions.map((option) => (
              <button
                className="selected-tag-filter-chip"
                key={`${option.kind}-${option.value}`}
                type="button"
                title={`Remove ${option.name}`}
                style={{
                  backgroundColor: getTagBackgroundColor(option.color),
                  borderColor: option.color,
                  color: getTagTextColor(option.color),
                }}
                onClick={() => removeConcreteTag(option)}
              >
                {getTagKindIcon(option.kind)}
                <span>{option.name}</span>
                <X size={12} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="notebook-list">
        <div className="notebook-range-label">
          <span>{allEntriesLabel}</span>
          <span>{searchResultCount}</span>
        </div>
        {decadeGroups.map((decadeGroup) => {
          const isDecadeExpanded = expandedDecades.has(decadeGroup.decade)
          const isSelectedDecade = syncTarget.kind === 'decade' && syncTarget.decade === decadeGroup.decade

          return (
            <div className="decade-group" key={decadeGroup.decade}>
              <button
                className={isSelectedDecade ? 'decade-toggle selected' : 'decade-toggle'}
                type="button"
                onClick={() => onToggleDecade(decadeGroup.decade)}
              >
                {isDecadeExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{decadeGroup.label}</span>
                <span>{decadeGroup.groups.reduce((sum, group) => sum + group.months.reduce((monthSum, month) => monthSum + month.entryCount, 0), 0)}</span>
              </button>

              {isDecadeExpanded && (
                <div className="year-list">
                  {decadeGroup.groups.map((group) => {
                    const isExpanded = expandedYears.has(group.year)
                    const isSelectedYear = syncTarget.kind === 'year' && syncTarget.year === group.year
                    const isMultiSelectedYear = selectedYearKeys.has(String(group.year))

                    return (
                      <div className="year-group" key={group.year}>
                        <button
                          className={isSelectedYear || isMultiSelectedYear ? 'year-toggle selected' : 'year-toggle'}
                          type="button"
                          onClick={(e) => onSelectYear(group.year, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            onOpenContextMenu({ x: event.clientX, y: event.clientY, kind: 'year', year: group.year })
                          }}
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <span>{group.year}</span>
                          <span>{group.months.reduce((sum, month) => sum + month.entryCount, 0)}</span>
                        </button>

                        {isExpanded && (
                          <div className="month-list">
                            {group.months.map((month) => {
                              const unsyncedCount = month.isLoaded ? month.entries.filter(isEntryUnsynced).length : 0
                              const isMultiSelected = selectedMonthKeys.has(month.key)
                              const isSelectedMonth = syncTarget.kind === 'month' && syncTarget.key === month.key
                              const isEmpty = month.entryCount === 0

                              return (
                                <div className={isSelectedMonth || isMultiSelected ? 'month-group selected' : 'month-group'} key={month.key}>
                                  <button className={`month-tab${isEmpty ? ' month-empty' : ''}`} type="button"
                                    onClick={(e) => onSelectMonth(month.key, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })}
                                    onContextMenu={(event) => {
                                      event.preventDefault()
                                      onOpenContextMenu({ x: event.clientX, y: event.clientY, kind: 'month', key: month.key, isEmpty })
                                    }}
                                  >
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
                                        className={getEntryItemClassName(entry, draftId, isDraftDirty, unsavedEntryIds, selectedEntryIds)}
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
                                        onClick={(e) => onSelectEntry(entry, month.key, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey })}
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
          onContextMenu={(e) => e.preventDefault()}
        >
          {'entry' in contextMenu ? (
            <>
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
            </>
          ) : contextMenu.kind === 'month' ? (
            contextMenu.isEmpty ? (
              <>
                <button type="button" onClick={() => onPullTarget({ kind: 'month', key: contextMenu.key })}>
                  <Download size={14} />
                  Pull Month
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onPushTarget({ kind: 'month', key: contextMenu.key })}>
                  <Upload size={14} />
                  Push Month
                </button>
                <button type="button" onClick={() => onPullTarget({ kind: 'month', key: contextMenu.key })}>
                  <Download size={14} />
                  Pull Month
                </button>
                <button type="button" onClick={() => onExportTarget({ kind: 'month', key: contextMenu.key })}>
                  <Download size={14} />
                  Export Month
                </button>
                <button className="danger-menu-item" type="button" onClick={() => onDeleteTarget({ kind: 'month', key: contextMenu.key })}>
                  <Trash2 size={14} />
                  Delete Month
                </button>
              </>
            )
          ) : (
            <>
              <button type="button" onClick={() => onPushTarget({ kind: 'year', year: contextMenu.year })}>
                <Upload size={14} />
                Push Year
              </button>
              <button type="button" onClick={() => onPullTarget({ kind: 'year', year: contextMenu.year })}>
                <Download size={14} />
                Pull Year
              </button>
              <button type="button" onClick={() => onExportTarget({ kind: 'year', year: contextMenu.year })}>
                <Download size={14} />
                Export Year
              </button>
              <button className="danger-menu-item" type="button" onClick={() => onDeleteTarget({ kind: 'year', year: contextMenu.year })}>
                <Trash2 size={14} />
                Delete Year
              </button>
            </>
          )}
        </div>
      )}

      <div className="sync-panel">
        {selectedEntryIds.size > 0 && (
          <p className="multi-select-count">{selectedEntryIds.size} selected</p>
        )}
        {selectedMonthKeys.size > 0 && (
          <p className="multi-select-count">{selectedMonthKeys.size} month{selectedMonthKeys.size !== 1 ? 's' : ''} selected</p>
        )}
        {selectedYearKeys.size > 0 && (
          <p className="multi-select-count">{selectedYearKeys.size} year{selectedYearKeys.size !== 1 ? 's' : ''} selected</p>
        )}
        <p>{statusMessage}</p>
      </div>
    </aside>
  )
}

function getTagKindIcon(kind: TagFilterKind) {
  if (kind === 'location')
    return <MapPin size={16} />

  if (kind === 'activity')
    return <PersonStanding size={16} />

  if (kind === 'person')
    return <Users size={16} />

  return <Star size={16} />
}

function groupNotebookYearsByDecade(notebookGroups: NotebookGroup[]): Array<{
  decade: string
  label: string
  groups: NotebookGroup[]
}> {
  const groupsByDecade = new Map<string, NotebookGroup[]>()

  for (const group of notebookGroups) {
    const decade = getDecadeKey(group.year)
    groupsByDecade.set(decade, [...(groupsByDecade.get(decade) ?? []), group])
  }

  return Array.from(groupsByDecade.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([decade, groups]) => ({
      decade,
      label: `${decade}-${Number(decade) + 9}`,
      groups,
    }))
}

function getDecadeKey(year: string): string {
  const yearValue = Number.parseInt(year, 10)

  if (!Number.isFinite(yearValue))
    return year

  return String(Math.floor(yearValue / 10) * 10)
}

function getEntryItemClassName(
  entry: DiaryEntry,
  draftId: string,
  isDraftDirty: boolean,
  unsavedEntryIds: Set<string>,
  selectedEntryIds: Set<string>,
): string {
  const classNames = ['entry-item']

  if (entry.id === draftId)
    classNames.push('selected')

  if (selectedEntryIds.has(entry.id) && entry.id !== draftId)
    classNames.push('multi-selected')

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

function formatWordCount(content: string): string {
  const count = content.trim().split(/\s+/).filter(Boolean).length

  return `${count} ${count === 1 ? 'word' : 'words'}`
}
