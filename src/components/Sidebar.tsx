import {
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  FilePlus2,
  Settings,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRef } from 'react'
import type { DiaryEntry, NotebookGroup } from '../domain/types'
import { getMoodBackgroundColor } from '../utils/colors'
import { formatDiaryDate } from '../utils/date'
import { isEntryUnsynced } from '../utils/diaryEntryHelpers'
import { DiaryWeatherIcon, EntryTagDots } from './DiaryIcons'

type SidebarContextMenu = {
  x: number
  y: number
  entry: DiaryEntry
}

type SidebarProps = {
  draftId: string
  searchQuery: string
  searchResultCount: number
  selectedNotebook: string | null
  selectedNotebookCount: number
  notebookGroups: NotebookGroup[]
  expandedYears: Set<string>
  expandedMonths: Set<string>
  isDraftDirty: boolean
  unsavedEntryIds: Set<string>
  contextMenu: SidebarContextMenu | null
  statusMessage: string
  isSettingsOpen: boolean
  onNewEntry: () => void
  onImportEvernoteFile: (file: File) => void
  onSync: () => void
  onPull: () => void
  onOpenSettings: () => void
  onSearchChange: (query: string) => void
  onSelectNotebook: (key: string | null) => void
  onSelectEntry: (entry: DiaryEntry, notebookKey: string) => void
  onToggleYear: (year: string) => void
  onToggleMonth: (monthKey: string) => void
  onOpenContextMenu: (menu: SidebarContextMenu) => void
  onCloseContextMenu: () => void
  onExportEntry: (entry: DiaryEntry) => void
  onDeleteEntry: (entry: DiaryEntry) => void
}

export function Sidebar({
  draftId,
  searchQuery,
  searchResultCount,
  selectedNotebook,
  selectedNotebookCount,
  notebookGroups,
  expandedYears,
  expandedMonths,
  isDraftDirty,
  unsavedEntryIds,
  contextMenu,
  statusMessage,
  isSettingsOpen,
  onNewEntry,
  onImportEvernoteFile,
  onSync,
  onPull,
  onOpenSettings,
  onSearchChange,
  onSelectNotebook,
  onSelectEntry,
  onToggleYear,
  onToggleMonth,
  onOpenContextMenu,
  onCloseContextMenu,
  onExportEntry,
  onDeleteEntry,
}: SidebarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)

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
            accept=".html,.htm,.notes,.enex,text/html,text/xml,application/xml"
            aria-label="Import Evernote export"
            onChange={(event) => {
              const file = event.target.files?.[0]

              if (file)
                onImportEvernoteFile(file)

              event.target.value = ''
            }}
          />
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

      <label className="search-box">
        <Search size={18} />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search tags, text, city, date"
        />
      </label>

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

          return (
            <div className="year-group" key={group.year}>
              <button className="year-toggle" type="button" onClick={() => onToggleYear(group.year)}>
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{group.year}</span>
                <span>{group.months.reduce((sum, month) => sum + month.entries.length, 0)}</span>
              </button>

              {isExpanded && (
                <div className="month-list">
                  {group.months.map((month) => (
                    <div className={selectedNotebook === month.key ? 'month-group selected' : 'month-group'} key={month.key}>
                      <button className="month-tab" type="button" onClick={() => onToggleMonth(month.key)}>
                        {expandedMonths.has(month.key) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span>{month.label}</span>
                        <span>{month.entries.length}</span>
                      </button>

                      {expandedMonths.has(month.key) &&
                        (!selectedNotebook || selectedNotebook === month.key) &&
                        month.entries.map((entry) => (
                          <button
                            className={getEntryItemClassName(entry, draftId, isDraftDirty, unsavedEntryIds)}
                            key={entry.id}
                            type="button"
                            title={getEntryItemTitle(entry, draftId, isDraftDirty, unsavedEntryIds)}
                            style={{ backgroundColor: getMoodBackgroundColor(entry.mood) }}
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
                  ))}
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
        <button type="button" onClick={onSync} title="Push unsynced entries in this month to the sync provider">
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

function formatWordCount(content: string): string {
  const count = content.trim().split(/\s+/).filter(Boolean).length

  return `${count} ${count === 1 ? 'word' : 'words'}`
}
