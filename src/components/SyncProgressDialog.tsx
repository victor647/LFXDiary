import { LoaderCircle } from 'lucide-react'

type SyncProgressDialogProps = {
  message: string
  target: string
  title?: string
  current?: number
  total?: number
}

export function SyncProgressDialog({ message, target, title, current, total }: SyncProgressDialogProps) {
  const hasProgress = typeof current === 'number' && typeof total === 'number' && total > 0
  const progressPercent = hasProgress ? Math.min(100, Math.max(0, (current / total) * 100)) : 0

  return (
    <div className="dialog-backdrop sync-progress-backdrop" role="presentation">
      <div className="sync-progress-dialog" role="dialog" aria-modal="true" aria-label="Sync in progress">
        <div className="sync-progress-spinner" aria-hidden="true">
          <LoaderCircle size={24} strokeWidth={2.4} />
        </div>
        <div className="sync-progress-copy" aria-live="polite">
          <div className="compact-title">{title ?? `Syncing ${target}`}</div>
          <p>{message}</p>
          {hasProgress && (
            <div className="sync-progress-meter" aria-label={`Progress ${current} of ${total}`}>
              <div className="sync-progress-count">{current}/{total}</div>
              <div className="sync-progress-track" aria-hidden="true">
                <div className="sync-progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
