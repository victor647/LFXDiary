import { formatDiaryDate } from '../utils/date'
import type { DiaryEntry } from '../domain/types'

type AutoSaveRecoveryDialogProps = {
  entry: DiaryEntry
  updatedAt: string
  onRecover: () => void
  onDiscard: () => void
}

export function AutoSaveRecoveryDialog({ entry, updatedAt, onRecover, onDiscard }: AutoSaveRecoveryDialogProps) {
  const savedTime = new Date(updatedAt).toLocaleString()

  return (
    <div className="dialog-backdrop close-confirmation-backdrop" role="presentation">
      <div className="autosave-recovery-dialog" role="dialog" aria-modal="true" aria-label="Auto-saved draft recovery">
        <div className="compact-title">Recover Auto-Saved Draft?</div>
        <p>
          A draft of your entry for{' '}
          <strong>{formatDiaryDate(entry.diaryDate)}</strong>
          {' '}was auto-saved at {savedTime}. Do you want to recover it?
        </p>
        <div className="dialog-actions">
          <button type="button" className="danger-button" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" onClick={onRecover}>
            Recover
          </button>
        </div>
      </div>
    </div>
  )
}
