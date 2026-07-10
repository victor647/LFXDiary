import { Star } from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_POINTS_OF_INTEREST_PER_ENTRY } from '../../domain/constants'
import { pointOfInterestTagManager } from '../../domain/tagModels'
import type { AppSettings, DiaryEntry } from '../../domain/types'
import { analyzePointsOfInterestFromContent } from '../../utils/evernoteImport'
import { EntryTagPanel } from './EntryTagPanel'

type PointOfInterestPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function PointOfInterestPanel(props: PointOfInterestPanelProps) {
  function autoAnalyzePointsOfInterest() {
    const result = analyzePointsOfInterestFromContent(props.draft.content, props.draft.people, props.entries, props.settings)
    const pointsOfInterest = [...props.draft.pointsOfInterest]
    const pointOfInterestColors = { ...props.draft.pointOfInterestColors }
    const pointOfInterestTags = { ...props.settings.pointOfInterestTags }
    let addedCount = 0

    for (const pointOfInterest of result.pointsOfInterest) {
      if (!pointsOfInterest.includes(pointOfInterest) && pointsOfInterest.length < MAX_POINTS_OF_INTEREST_PER_ENTRY) {
        pointsOfInterest.push(pointOfInterest)
        addedCount += 1
      }

      pointOfInterestColors[pointOfInterest] =
        result.pointOfInterestColors[pointOfInterest] ?? pointOfInterestColors[pointOfInterest] ?? DEFAULT_TAG_COLOR
    }

    for (const pointOfInterest of result.addedPointsOfInterest)
      pointOfInterestTags[pointOfInterest] ??= { color: DEFAULT_TAG_COLOR }

    props.onSettingsChange({ ...props.settings, pointOfInterestTags })
    props.onUpdateDraft({ pointsOfInterest, pointOfInterestColors })
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
      getClearableTags={(tags, draft) => tags.filter((tag) => draft.content.includes(tag))}
      icon={<Star size={16} />}
      manager={pointOfInterestTagManager}
      onAutoAnalyze={autoAnalyzePointsOfInterest}
    />
  )
}
