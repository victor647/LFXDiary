import { LoaderCircle } from 'lucide-react'

type SyncProgressDialogProps = {
  message: string
  target: string
  title?: string
}

export function SyncProgressDialog({ message, target, title }: SyncProgressDialogProps) {
  return (
    <div className="dialog-backdrop sync-progress-backdrop" role="presentation">
      <div className="sync-progress-dialog" role="dialog" aria-modal="true" aria-label="Sync in progress">
        <div className="sync-progress-spinner" aria-hidden="true">
          <LoaderCircle size={24} strokeWidth={2.4} />
        </div>
        <div className="sync-progress-copy" aria-live="polite">
          <div className="compact-title">{title ?? `Syncing ${target}`}</div>
          <p>{message}</p>
        </div>
      </div>
    </div>
  )
}
