type SyncErrorDialogProps = {
  log: string
  onClose: () => void
}

export function SyncErrorDialog({ log, onClose }: SyncErrorDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="sync-error-dialog" role="dialog" aria-modal="true" aria-label="Error log">
        <div className="compact-title">Error Log</div>
        <pre>{log}</pre>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
