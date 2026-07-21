import { Users } from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_PEOPLE_PER_ENTRY } from '../../domain/constants'
import type { AppSettings, DiaryCatalog, DiaryEntry } from '../../domain/types'
import { personTagManager } from '../../domain/tagModels'
import { dispatchTagEvent } from '../../application/tagEvents'
import { analyzePeopleFromContent } from '../../utils/evernoteImport'
import { EntryTagPanel } from './EntryTagPanel'

type PeoplePanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  diaryCatalog: DiaryCatalog
  onNavigateDate?: (date: string) => void
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onDiaryCatalogChange: (catalog: DiaryCatalog) => void
  onStatusChange: (message: string) => void
}

export function PeoplePanel(props: PeoplePanelProps) {
  function autoAnalyzePeople() {
    const result = analyzePeopleFromContent(props.draft.content, props.entries, props.settings)
    let nextState = { settings: props.settings, draft: props.draft, entries: props.entries, diaryCatalog: props.diaryCatalog }
    let addedCount = 0

    for (const personName of result.people) {
      const normalizedName = personTagManager.normalizeName(personName)
      if (!normalizedName) continue

      const currentTags = personTagManager.getEntryTagIds(nextState.draft)
      const isDuplicate = currentTags.some((id) => personTagManager.resolveTagName(nextState.settings, id) === normalizedName)
      if (isDuplicate || currentTags.length >= MAX_PEOPLE_PER_ENTRY) continue

      nextState = dispatchTagEvent(nextState, {
        type: 'entry-tag-added',
        manager: personTagManager,
        tagId: normalizedName,
        name: personName,
        color: result.personColors[personName] ?? DEFAULT_TAG_COLOR,
      })
      addedCount++
    }

    if (nextState.settings !== props.settings) props.onSettingsChange(nextState.settings)
    if (nextState.draft !== props.draft) props.onDraftChange(nextState.draft)
    if (nextState.entries !== props.entries) props.onEntriesChange(nextState.entries)
    if (nextState.diaryCatalog !== props.diaryCatalog) props.onDiaryCatalogChange(nextState.diaryCatalog)

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
      getClearableTags={(tags, draft) => tags.filter((tagId) => draft.content.includes(personTagManager.resolveTagName(props.settings, tagId)))}
      icon={<Users size={16} />}
      manager={personTagManager}
      onAutoAnalyze={autoAnalyzePeople}
    />
  )
}
