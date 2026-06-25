import { PersonStanding, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY, TAG_COLOR_PALETTE } from '../../domain/constants'
import type { DiaryEntry } from '../../domain/types'
import { getTagBackgroundColor, getTagTextColor } from '../../utils/colors'
import { updateEntryActivity } from '../../utils/diaryEntryHelpers'
import { getRecentTags } from '../../utils/entries'
import { normalizeTag, normalizeTags } from '../../utils/tags'

type ActivitiesPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function ActivitiesPanel({
  draft,
  entries,
  onUpdateDraft,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
}: ActivitiesPanelProps) {
  const [tagInput, setTagInput] = useState('')
  const [selectedTagColor, setSelectedTagColor] = useState(DEFAULT_TAG_COLOR)
  const [editingActivityName, setEditingActivityName] = useState<string | null>(null)
  const [editingActivityDraftName, setEditingActivityDraftName] = useState('')
  const [editingActivityColor, setEditingActivityColor] = useState(DEFAULT_TAG_COLOR)
  const [isActivityAddOpen, setIsActivityAddOpen] = useState(false)
  const [isOtherActivityDialogOpen, setIsOtherActivityDialogOpen] = useState(false)
  const availableRecentTags = useMemo(
    () => getRecentTags(entries).filter((tag) => !draft.tags.includes(tag.name)),
    [draft.tags, entries],
  )

  function addTag(rawTag: string, color = selectedTagColor) {
    const tag = normalizeTag(rawTag)

    if (!tag)
      return

    if (!draft.tags.includes(tag) && draft.tags.length >= MAX_ACTIVITIES_PER_ENTRY) {
      onStatusChange(`Each entry can have up to ${MAX_ACTIVITIES_PER_ENTRY} activities.`)
      return
    }

    onUpdateDraft({
      tags: normalizeTags([...draft.tags, tag]),
      tagColors: {
        ...draft.tagColors,
        [tag]: color,
      },
    })
    setTagInput('')
    setIsActivityAddOpen(false)
    setIsOtherActivityDialogOpen(false)
  }

  function addRecentTag(tagName: string) {
    const recentTag = getRecentTags(entries).find((tag) => tag.name === tagName)
    addTag(tagName, recentTag?.color ?? selectedTagColor)
  }

  function openOtherActivityDialog() {
    setIsActivityAddOpen(false)
    setIsOtherActivityDialogOpen(true)
    setTagInput('')
    setSelectedTagColor(DEFAULT_TAG_COLOR)
  }

  function removeTag(tag: string) {
    const nextTagColors = { ...draft.tagColors }
    delete nextTagColors[tag]
    onUpdateDraft({
      tags: draft.tags.filter((item) => item !== tag),
      tagColors: nextTagColors,
    })
  }

  function openActivityEditor(tag: string) {
    setEditingActivityName(tag)
    setEditingActivityDraftName(tag)
    setEditingActivityColor(draft.tagColors[tag] ?? DEFAULT_TAG_COLOR)
  }

  function closeActivityEditor() {
    setEditingActivityName(null)
    setEditingActivityDraftName('')
    setEditingActivityColor(DEFAULT_TAG_COLOR)
  }

  function confirmActivityEdit() {
    if (!editingActivityName)
      return

    const nextTag = normalizeTag(editingActivityDraftName)

    if (!nextTag)
      return

    const nextEntries = entries.map((entry) => updateEntryActivity(entry, editingActivityName, nextTag, editingActivityColor))
    const nextDraft = updateEntryActivity(draft, editingActivityName, nextTag, editingActivityColor)

    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    closeActivityEditor()
    onStatusChange(`Updated activity: ${nextTag}`)
  }

  function deleteEditingActivity() {
    if (!editingActivityName)
      return

    removeTag(editingActivityName)
    closeActivityEditor()
  }

  return (
    <div className="compact-panel tag-panel">
      <div className="compact-title">
        <PersonStanding size={16} />
        Activities
      </div>
      <div className="activity-chips">
        {draft.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            style={{
              backgroundColor: getTagBackgroundColor(draft.tagColors[tag] ?? DEFAULT_TAG_COLOR),
              borderColor: draft.tagColors[tag] ?? DEFAULT_TAG_COLOR,
              color: getTagTextColor(draft.tagColors[tag] ?? DEFAULT_TAG_COLOR),
            }}
            onClick={() => openActivityEditor(tag)}
          >
            {tag}
          </button>
        ))}
        <button
          className="activity-add-toggle"
          type="button"
          disabled={draft.tags.length >= MAX_ACTIVITIES_PER_ENTRY}
          title="Add activity"
          onClick={() => setIsActivityAddOpen((isOpen) => !isOpen)}
        >
          <Plus size={15} />
        </button>
        {isActivityAddOpen && (
          <div className="activity-recent-popover">
            {availableRecentTags.slice(0, 5).map((tag) => (
              <button
                key={tag.name}
                type="button"
                style={{
                  backgroundColor: getTagBackgroundColor(tag.color),
                  borderColor: tag.color,
                  color: getTagTextColor(tag.color),
                }}
                onClick={() => addRecentTag(tag.name)}
              >
                {tag.name}
              </button>
            ))}
            <button className="activity-other-option" type="button" onClick={openOtherActivityDialog}>
              Other
            </button>
          </div>
        )}
      </div>
      {isOtherActivityDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div className="activity-dialog" role="dialog" aria-modal="true" aria-label="Add activity">
            <div className="compact-title">Add Activity</div>
            <div className="location-color-palette" aria-label="Activity color">
              {TAG_COLOR_PALETTE.map((color) => (
                <button
                  className={selectedTagColor === color ? 'tag-color-swatch selected' : 'tag-color-swatch'}
                  key={color}
                  type="button"
                  style={{ backgroundColor: color }}
                  title={`Activity color ${color}`}
                  onClick={() => setSelectedTagColor(color)}
                />
              ))}
            </div>
            <div className="tag-input">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="Movie Night"
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    addTag(tagInput)
                }}
              />
              <button type="button" onClick={() => addTag(tagInput)}>
                Confirm
              </button>
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setIsOtherActivityDialogOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {editingActivityName && (
        <div className="dialog-backdrop" role="presentation">
          <div className="activity-dialog" role="dialog" aria-modal="true" aria-label="Edit activity">
            <div className="compact-title">Edit Activity</div>
            <div className="location-color-palette" aria-label="Activity color">
              {TAG_COLOR_PALETTE.map((color) => (
                <button
                  className={editingActivityColor === color ? 'tag-color-swatch selected' : 'tag-color-swatch'}
                  key={color}
                  type="button"
                  style={{ backgroundColor: color }}
                  title={`Activity color ${color}`}
                  onClick={() => setEditingActivityColor(color)}
                />
              ))}
            </div>
            <input
              value={editingActivityDraftName}
              onChange={(event) => setEditingActivityDraftName(event.target.value)}
              placeholder="Movie Night"
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  confirmActivityEdit()
              }}
            />
            <div className="dialog-actions">
              <button className="danger-button" type="button" onClick={deleteEditingActivity}>
                Delete
              </button>
              <button type="button" onClick={closeActivityEditor}>
                Cancel
              </button>
              <button type="button" onClick={confirmActivityEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
