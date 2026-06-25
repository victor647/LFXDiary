import { formatDiaryDate } from '../utils/date'
import type { DiaryEntry, SyncProvider } from '../domain/types'

type DeleteEntryDialogProps = {
  entry: DiaryEntry
  syncProvider: SyncProvider
  onCancel: () => void
  onDeleteLocal: () => void
  onDeleteEverywhere: () => void
}

export function DeleteEntryDialog({
  entry,
  syncProvider,
  onCancel,
  onDeleteLocal,
  onDeleteEverywhere,
}: DeleteEntryDialogProps) {
  const target = syncProvider === 'git' ? 'Git remote' : 'NAS'

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="delete-entry-dialog" role="dialog" aria-modal="true" aria-label="Delete diary entry">
        <div className="compact-title">Delete Entry</div>
        <p>
          {formatDiaryDate(entry.diaryDate)} has been pushed before. Do you also want to delete its Markdown file from
          {' '}
          {target}?
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onDeleteLocal}>
            Local Only
          </button>
          <button type="button" className="danger-button" onClick={onDeleteEverywhere}>
            Delete Everywhere
          </button>
        </div>
      </div>
    </div>
  )
}
