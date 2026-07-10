import type { AppSettings, DiaryCatalog, DiaryEntry } from '../domain/types'
import { ActivitiesPanel } from './panels/ActivitiesPanel'
import { DatePanel } from './panels/DatePanel'
import { LocationPanel } from './panels/LocationPanel'
import { MoodPanel } from './panels/MoodPanel'
import { PeoplePanel } from './panels/PeoplePanel'
import { PointOfInterestPanel } from './panels/PointOfInterestPanel'
import { WeatherPanel } from './panels/WeatherPanel'

type MetadataEditorProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  diaryCatalog: DiaryCatalog
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onUpdateDraftIfCurrent: (entryId: string, diaryDate: string, patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
  onErrorLog: (log: string) => void
}

export function MetadataEditor({
  draft,
  entries,
  diaryCatalog,
  settings,
  onSettingsChange,
  onUpdateDraft,
  onUpdateDraftIfCurrent,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
  onErrorLog,
}: MetadataEditorProps) {
  return (
    <section className="metadata-deck">
      <div className="metadata-row metadata-row-primary">
        <DatePanel draft={draft} settings={settings} onUpdateDraft={onUpdateDraft} onStatusChange={onStatusChange} />
        <WeatherPanel
          key={draft.id}
          draft={draft}
          settings={settings}
          onUpdateDraftIfCurrent={onUpdateDraftIfCurrent}
          onStatusChange={onStatusChange}
          onErrorLog={onErrorLog}
        />
        <MoodPanel draft={draft} onUpdateDraft={onUpdateDraft} />
      </div>
      <div className="metadata-row metadata-row-tags">
        <LocationPanel
          draft={draft}
          entries={entries}
          diaryCatalog={diaryCatalog}
          settings={settings}
          onUpdateDraft={onUpdateDraft}
          onDraftChange={onDraftChange}
          onEntriesChange={onEntriesChange}
          onStatusChange={onStatusChange}
        />
        <ActivitiesPanel
          draft={draft}
          entries={entries}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onUpdateDraft={onUpdateDraft}
          onDraftChange={onDraftChange}
          onEntriesChange={onEntriesChange}
          onStatusChange={onStatusChange}
        />
        <PeoplePanel
          draft={draft}
          entries={entries}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onUpdateDraft={onUpdateDraft}
          onDraftChange={onDraftChange}
          onEntriesChange={onEntriesChange}
          onStatusChange={onStatusChange}
        />
        <PointOfInterestPanel
          draft={draft}
          entries={entries}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onUpdateDraft={onUpdateDraft}
          onDraftChange={onDraftChange}
          onEntriesChange={onEntriesChange}
          onStatusChange={onStatusChange}
        />
      </div>
    </section>
  )
}
