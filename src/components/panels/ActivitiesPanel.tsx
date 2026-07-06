import { PersonStanding } from 'lucide-react'
import type { AppSettings, DiaryEntry } from '../../domain/types'
import { activityTagManager } from '../../domain/tagModels'
import { EntryTagPanel } from './EntryTagPanel'

type ActivitiesPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function ActivitiesPanel(props: ActivitiesPanelProps) {
  return (
    <EntryTagPanel
      {...props}
      icon={<PersonStanding size={16} />}
      manager={activityTagManager}
    />
  )
}
