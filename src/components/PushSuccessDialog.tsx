import { formatDiaryDate } from '../utils/date'

type PushSuccessDialogProps = {
  diaryDates: string[]
  onClose: () => void
}

export function PushSuccessDialog({ diaryDates, onClose }: PushSuccessDialogProps) {
  const sortedDates = [...diaryDates].sort((a, b) => b.localeCompare(a))

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="push-success-dialog" role="dialog" aria-modal="true" aria-label="Push complete">
        <div className="compact-title">Push Complete</div>
        <p>
          Pushed {sortedDates.length}
          {' '}
          {sortedDates.length === 1 ? 'entry' : 'entries'}:
        </p>
        <ul className="push-success-list">
          {sortedDates.map((diaryDate) => (
            <li key={diaryDate}>{formatDiaryDate(diaryDate)}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
