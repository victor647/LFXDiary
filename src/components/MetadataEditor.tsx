import type { DiaryEntry } from '../domain/types'
import { ActivitiesPanel } from './panels/ActivitiesPanel'
import { DatePanel } from './panels/DatePanel'
import { LocationPanel } from './panels/LocationPanel'
import { MoodPanel } from './panels/MoodPanel'
import { WeatherPanel } from './panels/WeatherPanel'

type MetadataEditorProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
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
  onUpdateDraft,
  onUpdateDraftIfCurrent,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
  onErrorLog,
}: MetadataEditorProps) {
  return (
    <section className="metadata-deck">
      <DatePanel draft={draft} onUpdateDraft={onUpdateDraft} onStatusChange={onStatusChange} />
      <LocationPanel
        draft={draft}
        entries={entries}
        onUpdateDraft={onUpdateDraft}
        onDraftChange={onDraftChange}
        onEntriesChange={onEntriesChange}
        onStatusChange={onStatusChange}
      />
      <WeatherPanel
        draft={draft}
        onUpdateDraft={onUpdateDraft}
        onUpdateDraftIfCurrent={onUpdateDraftIfCurrent}
        onStatusChange={onStatusChange}
        onErrorLog={onErrorLog}
      />
      <ActivitiesPanel
        draft={draft}
        entries={entries}
        onUpdateDraft={onUpdateDraft}
        onDraftChange={onDraftChange}
        onEntriesChange={onEntriesChange}
        onStatusChange={onStatusChange}
      />
      <MoodPanel draft={draft} onUpdateDraft={onUpdateDraft} />
    </section>
  )
}
