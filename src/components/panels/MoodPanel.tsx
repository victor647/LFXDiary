import { periodConfig } from '../../domain/constants'
import type { DiaryEntry } from '../../domain/types'
import { getMoodAccentColor } from '../../utils/colors'
import { clampMood } from '../../utils/diaryEntryHelpers'
import { MoodIcon } from '../DiaryIcons'

type MoodPanelProps = {
  draft: DiaryEntry
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
}

export function MoodPanel({ draft, onUpdateDraft }: MoodPanelProps) {
  function updateMood(period: keyof DiaryEntry['mood'], value: number) {
    onUpdateDraft({
      mood: {
        ...draft.mood,
        [period]: clampMood(value),
      },
    })
  }

  return (
    <div className="compact-panel mood-panel">
      <div className="compact-title">
        <MoodIcon mood={draft.mood} />
        Mood
      </div>
      <div className="mood-list">
        {periodConfig.map((config) => (
          <div className="mood-rating-row" key={config.period}>
            <span>{config.label}</span>
            <div className="mood-rating-bar">
              {Array.from({ length: 11 }, (_, score) => (
                <button
                  className={score === draft.mood[config.period] ? 'selected' : ''}
                  key={score}
                  type="button"
                  style={
                    score === draft.mood[config.period]
                      ? { backgroundColor: getMoodAccentColor(draft.mood[config.period]) }
                      : undefined
                  }
                  title={`${config.label} mood ${score}`}
                  onClick={() => updateMood(config.period, score)}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
