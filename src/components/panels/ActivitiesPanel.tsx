import { ChevronRight, PersonStanding } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY, TAG_COLOR_PALETTE } from '../../domain/constants'
import type { AppSettings, DiaryEntry } from '../../domain/types'
import {
  ActivityAddButton,
  ActivityAddDialog,
  ActivityChipButton,
  ActivityEditDialog,
} from '../ActivityTagControls'
import { updateEntryActivity } from '../../utils/diaryEntryHelpers'
import { getRecentTags } from '../../utils/entries'
import { getActivityColorGroupName } from '../../utils/settings'
import { normalizeTag, normalizeTags } from '../../utils/tags'

type ActivitiesPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function ActivitiesPanel({
  draft,
  entries,
  settings,
  onSettingsChange,
  onUpdateDraft,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
}: ActivitiesPanelProps) {
  const [editingActivityName, setEditingActivityName] = useState<string | null>(null)
  const [isActivityAddOpen, setIsActivityAddOpen] = useState(false)
  const [addingActivityColor, setAddingActivityColor] = useState<string | null>(null)
  const [expandedActivityColor, setExpandedActivityColor] = useState(DEFAULT_TAG_COLOR)
  const activityAddRef = useRef<HTMLDivElement>(null)
  const availableRecentTags = useMemo(() => {
    const tags = new Map(getRecentTags(entries).map((tag) => [tag.name, tag.color]))

    for (const [name, tag] of Object.entries(settings.activityTags))
      tags.set(name, tag.color)

    return Array.from(tags.entries())
      .map(([name, color]) => ({ name, color }))
      .filter((tag) => !draft.tags.includes(tag.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [draft.tags, entries, settings.activityTags])
  const activityColorGroups = useMemo(() => {
    const groups = new Map<string, typeof availableRecentTags>()

    for (const tag of availableRecentTags) {
      const color = tag.color || DEFAULT_TAG_COLOR
      groups.set(color, [...(groups.get(color) ?? []), tag])
    }

    const customColors = Array.from(groups.keys()).filter((color) => !TAG_COLOR_PALETTE.includes(color))

    return [...TAG_COLOR_PALETTE, ...customColors]
      .map((color) => ({ color, tags: groups.get(color) ?? [] }))
  }, [availableRecentTags])
  const visibleExpandedActivityColor = activityColorGroups.some((group) => group.color === expandedActivityColor)
    ? expandedActivityColor
    : activityColorGroups[0]?.color ?? DEFAULT_TAG_COLOR

  useEffect(() => {
    if (!isActivityAddOpen)
      return

    function closeActivityAddOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node))
        return

      if (!activityAddRef.current || activityAddRef.current.contains(event.target))
        return

      setIsActivityAddOpen(false)
    }

    document.addEventListener('pointerdown', closeActivityAddOnOutsideClick)

    return () => document.removeEventListener('pointerdown', closeActivityAddOnOutsideClick)
  }, [isActivityAddOpen])

  function addTag(rawTag: string, color = DEFAULT_TAG_COLOR) {
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
    onSettingsChange({
      ...settings,
      activityTags: {
        ...settings.activityTags,
        [tag]: { color },
      },
    })
    setIsActivityAddOpen(false)
    setAddingActivityColor(null)
  }

  function openActivityDialog(color: string) {
    setIsActivityAddOpen(false)
    setAddingActivityColor(color)
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
  }

  function closeActivityEditor() {
    setEditingActivityName(null)
  }

  function confirmActivityEdit(nextName: string, color: string) {
    if (!editingActivityName)
      return

    const nextTag = normalizeTag(nextName)

    if (!nextTag)
      return

    const nextEntries = entries.map((entry) => updateEntryActivity(entry, editingActivityName, nextTag, color))
    const nextDraft = updateEntryActivity(draft, editingActivityName, nextTag, color)

    onSettingsChange({
      ...settings,
      activityTags: updateActivityTagCatalog(settings.activityTags, editingActivityName, nextTag, color),
    })
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    closeActivityEditor()
    onStatusChange(`Updated activity globally: ${nextTag}`)
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
      <div className="activity-chips" ref={activityAddRef}>
        {draft.tags.map((tag) => (
          <ActivityChipButton
            color={draft.tagColors[tag] ?? DEFAULT_TAG_COLOR}
            key={tag}
            name={tag}
            onClick={() => openActivityEditor(tag)}
          />
        ))}
        <ActivityAddButton
          disabled={draft.tags.length >= MAX_ACTIVITIES_PER_ENTRY}
          onClick={() => setIsActivityAddOpen((isOpen) => !isOpen)}
        />
        {isActivityAddOpen && (
          <div className="activity-recent-popover">
            {activityColorGroups.map((group) => {
              const isExpanded = group.color === visibleExpandedActivityColor

              return (
                <div
                  className="activity-color-group"
                  key={group.color}
                  onMouseEnter={() => setExpandedActivityColor(group.color)}
                >
                  <button
                    className="activity-color-toggle"
                    type="button"
                    title={`Activity color ${group.color}`}
                    onClick={() => setExpandedActivityColor(group.color)}
                  >
                    <span className="activity-color-toggle-main">
                      <span className="activity-color-dot" style={{ backgroundColor: group.color }} />
                      <span>{getActivityColorGroupName(settings, group.color)}</span>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  {isExpanded && (
                    <div className="activity-color-options">
                      {group.tags.map((tag) => (
                        <ActivityChipButton
                          color={tag.color}
                          key={tag.name}
                          name={tag.name}
                          onClick={() => addTag(tag.name, tag.color)}
                        />
                      ))}
                      <ActivityAddButton
                        title={`Add activity to ${getActivityColorGroupName(settings, group.color)}`}
                        onClick={() => openActivityDialog(group.color)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <button className="activity-other-option" type="button" onClick={() => openActivityDialog(DEFAULT_TAG_COLOR)}>
              Other
            </button>
          </div>
        )}
      </div>
      {addingActivityColor && (
        <ActivityAddDialog
          colorNames={settings.activityColorGroupNames}
          initialColor={addingActivityColor}
          onAdd={addTag}
          onCancel={() => setAddingActivityColor(null)}
        />
      )}
      {editingActivityName && (
        <ActivityEditDialog
          colorNames={settings.activityColorGroupNames}
          initialColor={draft.tagColors[editingActivityName] ?? DEFAULT_TAG_COLOR}
          initialName={editingActivityName}
          onCancel={closeActivityEditor}
          onDelete={deleteEditingActivity}
          onSave={confirmActivityEdit}
        />
      )}
    </div>
  )
}

function updateActivityTagCatalog(
  activityTags: AppSettings['activityTags'],
  oldTag: string,
  nextTag: string,
  color: string,
): AppSettings['activityTags'] {
  const normalizedOldTag = normalizeTag(oldTag)
  const normalizedNextTag = normalizeTag(nextTag)
  const nextActivityTags: AppSettings['activityTags'] = {}

  for (const [name, tag] of Object.entries(activityTags)) {
    if (normalizeTag(name) !== normalizedOldTag)
      nextActivityTags[name] = tag
  }

  if (normalizedNextTag)
    nextActivityTags[normalizedNextTag] = { color }

  return nextActivityTags
}
