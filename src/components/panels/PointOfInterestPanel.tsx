import { Star } from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_POINTS_OF_INTEREST_PER_ENTRY } from '../../domain/constants'
import { pointOfInterestTagManager } from '../../domain/tagModels'
import { dispatchTagEvent } from '../../application/tagEvents'
import type { AppSettings, DiaryCatalog, DiaryEntry } from '../../domain/types'
import { analyzePointsOfInterestFromContent } from '../../utils/evernoteImport'
import { EntryTagPanel } from './EntryTagPanel'

type PointOfInterestPanelProps = {
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

export function PointOfInterestPanel(props: PointOfInterestPanelProps) {
  function autoAnalyzePointsOfInterest() {
    const result = analyzePointsOfInterestFromContent(props.draft.content, props.draft.people, props.entries, props.settings)
    let nextState = { settings: props.settings, draft: props.draft, entries: props.entries, diaryCatalog: props.diaryCatalog }
    let addedCount = 0

    for (const poiName of result.pointsOfInterest) {
      const normalizedName = pointOfInterestTagManager.normalizeName(poiName)
      if (!normalizedName) continue

      const currentTags = pointOfInterestTagManager.getEntryTagIds(nextState.draft)
      const isDuplicate = currentTags.some((id) => pointOfInterestTagManager.resolveTagName(nextState.settings, id) === normalizedName)
      if (isDuplicate || currentTags.length >= MAX_POINTS_OF_INTEREST_PER_ENTRY) continue

      nextState = dispatchTagEvent(nextState, {
        type: 'entry-tag-added',
        manager: pointOfInterestTagManager,
        tagId: normalizedName,
        name: poiName,
        color: result.pointOfInterestColors[poiName] ?? DEFAULT_TAG_COLOR,
      })
      addedCount++
    }

    if (nextState.settings !== props.settings) props.onSettingsChange(nextState.settings)
    if (nextState.draft !== props.draft) props.onDraftChange(nextState.draft)
    if (nextState.entries !== props.entries) props.onEntriesChange(nextState.entries)
    if (nextState.diaryCatalog !== props.diaryCatalog) props.onDiaryCatalogChange(nextState.diaryCatalog)

    props.onStatusChange(
      addedCount
        ? `Auto analyzed points of interest: added ${addedCount}.`
        : 'Auto analyzed points of interest: no new places found.',
    )
  }

  return (
    <EntryTagPanel
      {...props}
      clearActionLabel="Clear points of interest from this entry"
      getClearableTags={(tags, draft) => tags.filter((tagId) => draft.content.includes(pointOfInterestTagManager.resolveTagName(props.settings, tagId)))}
      icon={<Star size={16} />}
      manager={pointOfInterestTagManager}
      onAutoAnalyze={autoAnalyzePointsOfInterest}
    />
  )
}
