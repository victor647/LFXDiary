import { formatDiaryDate } from '../utils/date'
import type { DiaryEntry } from '../domain/types'

type DeleteEntryDialogProps = {
  entry: DiaryEntry
  onCancel: () => void
  onDeleteLocal: () => void
}

export function DeleteEntryDialog({
  entry,
  onCancel,
  onDeleteLocal,
}: DeleteEntryDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="delete-entry-dialog" role="dialog" aria-modal="true" aria-label="Delete diary entry">
        <div className="compact-title">Delete Entry</div>
        <p>
          Delete {formatDiaryDate(entry.diaryDate)} from local storage? This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={onDeleteLocal}>
            Delete Locally
          </button>
        </div>
      </div>
    </div>
  )
}
