type UnsavedCloseDialogProps = {
  unsavedCount: number
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function UnsavedCloseDialog({ unsavedCount, onCancel, onDiscard, onSave }: UnsavedCloseDialogProps) {
  return (
    <div className="dialog-backdrop close-confirmation-backdrop" role="presentation">
      <div className="unsaved-close-dialog" role="dialog" aria-modal="true" aria-label="Save unsaved diary entries">
        <div className="compact-title">Save Before Closing?</div>
        <p>
          You have {unsavedCount}
          {' '}
          unsaved {unsavedCount === 1 ? 'diary entry' : 'diary entries'}. Save before closing?
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={onDiscard}>
            Don&apos;t Save
          </button>
          <button type="button" onClick={onSave}>
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  )
}
