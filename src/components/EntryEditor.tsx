type EntryEditorProps = {
  content: string
  saveLabel: string
  onContentChange: (content: string) => void
  onSave: () => void
}

export function EntryEditor({ content, saveLabel, onContentChange, onSave }: EntryEditorProps) {
  return (
    <section className="entry-body">
      <label>Entry</label>
      <textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="Write today's journal in English..."
      />
      <button className="entry-save-button" type="button" onClick={onSave}>
        {saveLabel}
      </button>
    </section>
  )
}
