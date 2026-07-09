type ForcePushDialogProps = {
  targetLabel: string
  entryCount: number
  onCancel: () => void
  onConfirm: () => void
}

export function ForcePushDialog({ targetLabel, entryCount, onCancel, onConfirm }: ForcePushDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="force-push-dialog" role="dialog" aria-modal="true" aria-label="Force reserialize entries">
        <div className="compact-title">Force Reserialize</div>
        <p>
          No unsynced entries were found in {targetLabel}. Force reserialize and push {entryCount}
          {' '}
          {entryCount === 1 ? 'entry' : 'entries'} anyway?
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            Force Push
          </button>
        </div>
      </div>
    </div>
  )
}
