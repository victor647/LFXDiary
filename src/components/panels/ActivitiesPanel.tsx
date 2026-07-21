import type { AppSettings, DiaryCatalog, DiaryEntry } from '../../domain/types'
import { PersonStanding } from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY } from '../../domain/constants'
import { activityTagManager } from '../../domain/tagModels'
import { dispatchTagEvent } from '../../application/tagEvents'
import { analyzeActivitiesFromContent } from '../../utils/evernoteImport'
import { EntryTagPanel } from './EntryTagPanel'

type ActivitiesPanelProps = {
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

export function ActivitiesPanel(props: ActivitiesPanelProps) {
  function autoAnalyzeActivities() {
    const result = analyzeActivitiesFromContent(props.draft.content, props.entries, props.settings)
    let nextState = { settings: props.settings, draft: props.draft, entries: props.entries, diaryCatalog: props.diaryCatalog }
    let addedCount = 0

    for (const tagName of result.tags) {
      const normalizedName = activityTagManager.normalizeName(tagName)
      if (!normalizedName) continue

      const currentTags = activityTagManager.getEntryTagIds(nextState.draft)
      const isDuplicate = currentTags.some((id) => activityTagManager.resolveTagName(nextState.settings, id) === normalizedName)
      if (isDuplicate || currentTags.length >= MAX_ACTIVITIES_PER_ENTRY) continue

      nextState = dispatchTagEvent(nextState, {
        type: 'entry-tag-added',
        manager: activityTagManager,
        tagId: normalizedName,
        name: tagName,
        color: result.tagColors[tagName] ?? DEFAULT_TAG_COLOR,
      })
      addedCount++
    }

    if (nextState.settings !== props.settings) props.onSettingsChange(nextState.settings)
    if (nextState.draft !== props.draft) props.onDraftChange(nextState.draft)
    if (nextState.entries !== props.entries) props.onEntriesChange(nextState.entries)
    if (nextState.diaryCatalog !== props.diaryCatalog) props.onDiaryCatalogChange(nextState.diaryCatalog)

    props.onStatusChange(
      addedCount
        ? `Auto analyzed activities: added ${addedCount}.`
        : 'Auto analyzed activities: no new activities found.',
    )
  }

  return (
    <EntryTagPanel
      {...props}
      clearActionLabel="Clear activities from this entry"
      icon={<PersonStanding size={16} />}
      manager={activityTagManager}
      onAutoAnalyze={autoAnalyzeActivities}
    />
  )
}
