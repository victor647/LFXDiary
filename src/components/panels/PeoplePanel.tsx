import { Users } from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_PEOPLE_PER_ENTRY } from '../../domain/constants'
import type { AppSettings, DiaryCatalog, DiaryEntry } from '../../domain/types'
import { personTagManager } from '../../domain/tagModels'
import { analyzePeopleFromContent } from '../../utils/evernoteImport'
import { EntryTagPanel } from './EntryTagPanel'

type PeoplePanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  diaryCatalog?: DiaryCatalog
  onNavigateDate?: (date: string) => void
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function PeoplePanel(props: PeoplePanelProps) {
  function autoAnalyzePeople() {
    const result = analyzePeopleFromContent(props.draft.content, props.entries, props.settings)
    const people = [...props.draft.people]
    const personColors = { ...props.draft.personColors }
    const peopleTags = { ...props.settings.peopleTags }
    let addedCount = 0

    for (const person of result.people) {
      if (!people.includes(person) && people.length < MAX_PEOPLE_PER_ENTRY) {
        people.push(person)
        addedCount += 1
      }

      personColors[person] = result.personColors[person] ?? personColors[person] ?? DEFAULT_TAG_COLOR
    }

    for (const person of result.addedPeople)
      peopleTags[person] ??= { name: person, color: DEFAULT_TAG_COLOR }

    props.onSettingsChange({ ...props.settings, peopleTags })
    props.onUpdateDraft({ people, personColors })
    props.onStatusChange(
      addedCount
        ? `Auto analyzed people: added ${addedCount}.`
        : 'Auto analyzed people: no new people found.',
    )
  }

  return (
    <EntryTagPanel
      {...props}
      clearActionLabel="Clear people from this entry"
      getClearableTags={(tags, draft) => tags.filter((tag) => draft.content.includes(tag))}
      icon={<Users size={16} />}
      manager={personTagManager}
      onAutoAnalyze={autoAnalyzePeople}
    />
  )
}
