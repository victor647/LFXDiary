import { Users } from 'lucide-react'
import type { AppSettings, DiaryEntry } from '../../domain/types'
import { personTagManager } from '../../domain/tagModels'
import { EntryTagPanel } from './EntryTagPanel'

type PeoplePanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function PeoplePanel(props: PeoplePanelProps) {
  return (
    <EntryTagPanel
      {...props}
      icon={<Users size={16} />}
      manager={personTagManager}
    />
  )
}
