import type { AppSettings, DiaryCatalog, DiaryEntry } from '../../domain/types'
import { PersonStanding } from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY } from '../../domain/constants'
import { activityTagManager } from '../../domain/tagModels'
import { analyzeActivitiesFromContent } from '../../utils/evernoteImport'
import { EntryTagPanel } from './EntryTagPanel'

type ActivitiesPanelProps = {
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

export function ActivitiesPanel(props: ActivitiesPanelProps) {
  function autoAnalyzeActivities() {
    const result = analyzeActivitiesFromContent(props.draft.content, props.entries, props.settings)
    const tags = [...props.draft.tags]
    const tagColors = { ...props.draft.tagColors }
    const activityTags = { ...props.settings.activityTags }
    let addedCount = 0

    for (const tag of result.tags) {
      if (!tags.includes(tag) && tags.length < MAX_ACTIVITIES_PER_ENTRY) {
        tags.push(tag)
        addedCount += 1
      }

      tagColors[tag] = result.tagColors[tag] ?? tagColors[tag] ?? DEFAULT_TAG_COLOR
    }

    for (const tag of result.addedTags)
      activityTags[tag] ??= { name: tag, color: DEFAULT_TAG_COLOR }

    props.onSettingsChange({ ...props.settings, activityTags })
    props.onUpdateDraft({ tags, tagColors })
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
