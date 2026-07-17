import { ChevronRight, Plus, Sparkles, X } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dispatchTagEvent, type CatalogTagManager, type TagEvent } from '../../application/tagEvents'
import { createPortal } from 'react-dom'
import { DEFAULT_TAG_COLOR, TAG_COLOR_PALETTE } from '../../domain/constants'
import type { AppSettings, DiaryCatalog, DiaryEntry } from '../../domain/types'
import { reorderByKey } from '../../utils/reorder'
import {
  ActivityAddButton,
  ActivityAddDialog,
  ActivityChipButton,
  ActivityEditDialog,
  TagContextMenu,
} from '../ActivityTagControls'
import type { ContextMenuItem } from '../ActivityTagControls'

type EntryTagPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  settings: AppSettings
  diaryCatalog?: DiaryCatalog
  clearActionLabel?: string
  getClearableTags?: (tags: string[], draft: DiaryEntry) => string[]
  icon: ReactNode
  manager: CatalogTagManager
  onAutoAnalyze?: () => void
  onNavigateDate?: (date: string) => void
  onSettingsChange: (settings: AppSettings) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

type TagPopoverPosition = {
  top: number
  left: number
}

const TAG_POPOVER_MAX_WIDTH = 240
const TAG_POPOVER_EDGE_GAP = 12
const TAG_POPOVER_OFFSET_Y = 6

export function EntryTagPanel({
  draft,
  entries,
  settings,
  diaryCatalog,
  clearActionLabel,
  getClearableTags,
  icon,
  manager,
  onAutoAnalyze,
  onNavigateDate,
  onSettingsChange,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
}: EntryTagPanelProps) {
  const [editingTagName, setEditingTagName] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)
  const [isTagAddOpen, setIsTagAddOpen] = useState(false)
  const [addingTagColor, setAddingTagColor] = useState<string | null>(null)
  const [expandedTagColor, setExpandedTagColor] = useState(DEFAULT_TAG_COLOR)
  const [tagPopoverPosition, setTagPopoverPosition] = useState<TagPopoverPosition | null>(null)
  const [draggingTagName, setDraggingTagName] = useState<string | null>(null)
  const tagAddRef = useRef<HTMLSpanElement>(null)
  const tagPopoverRef = useRef<HTMLDivElement>(null)
  const catalogEntries = useMemo(() => [draft, ...entries.filter((entry) => entry.id !== draft.id)], [draft, entries])
  const currentTags = manager.getEntryTagIds(draft)
  const currentColors = manager.getEntryColors(draft)
  const catalogTags = manager.getCatalog(settings)
  const clearableTags = clearActionLabel ? getClearableTags?.(currentTags, draft) ?? currentTags : []
  const colorNames = manager.getColorNames(settings)
  const availableRecentTags = useMemo(() => {
    return manager.collectRecent(entries, settings)
      .filter((tag) => !currentTags.includes(tag.key))
  }, [currentTags, entries, manager, settings])
  const tagColorGroups = useMemo(() => {
    const groups = new Map<string, typeof availableRecentTags>()

    for (const tag of availableRecentTags) {
      const color = tag.color || DEFAULT_TAG_COLOR
      groups.set(color, [...(groups.get(color) ?? []), tag])
    }

    const customColors = Array.from(groups.keys()).filter((color) => !TAG_COLOR_PALETTE.includes(color))

    return [...TAG_COLOR_PALETTE, ...customColors]
      .map((color) => ({ color, tags: groups.get(color) ?? [] }))
  }, [availableRecentTags])
  const visibleExpandedTagColor = tagColorGroups.some((group) => group.color === expandedTagColor)
    ? expandedTagColor
    : tagColorGroups[0]?.color ?? DEFAULT_TAG_COLOR

  function applyTagEvent(event: TagEvent) {
    const nextState = dispatchTagEvent({ settings, draft, entries }, event)

    if (nextState.settings !== settings)
      onSettingsChange(nextState.settings)

    if (nextState.entries !== entries)
      onEntriesChange(nextState.entries)

    if (nextState.draft !== draft)
      onDraftChange(nextState.draft)
  }

  useEffect(() => {
    if (!isTagAddOpen)
      return

    function closeTagAddOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node))
        return

      if (tagAddRef.current?.contains(event.target) || tagPopoverRef.current?.contains(event.target))
        return

      setIsTagAddOpen(false)
    }

    document.addEventListener('pointerdown', closeTagAddOnOutsideClick)

    return () => document.removeEventListener('pointerdown', closeTagAddOnOutsideClick)
  }, [isTagAddOpen])

  useLayoutEffect(() => {
    if (!isTagAddOpen)
      return

    function updateTagPopoverPosition() {
      const tagAdd = tagAddRef.current

      if (!tagAdd)
        return

      const rect = tagAdd.getBoundingClientRect()
      const maxLeft = window.innerWidth - TAG_POPOVER_MAX_WIDTH - TAG_POPOVER_EDGE_GAP
      const left = Math.max(TAG_POPOVER_EDGE_GAP, Math.min(rect.left, maxLeft))
      const top = Math.max(TAG_POPOVER_EDGE_GAP, rect.bottom + TAG_POPOVER_OFFSET_Y)

      setTagPopoverPosition({ top, left })
    }

    updateTagPopoverPosition()
    window.addEventListener('resize', updateTagPopoverPosition)
    window.addEventListener('scroll', updateTagPopoverPosition, true)

    return () => {
      window.removeEventListener('resize', updateTagPopoverPosition)
      window.removeEventListener('scroll', updateTagPopoverPosition, true)
    }
  }, [isTagAddOpen])

  function addTag(rawTag: string, color = DEFAULT_TAG_COLOR) {
    const tag = manager.normalizeName(rawTag)

    if (!tag)
      return

    if (!currentTags.includes(tag) && currentTags.length >= manager.maxTags) {
      onStatusChange(`Each entry can have up to ${manager.maxTags} ${manager.itemLabelPlural.toLowerCase()}.`)
      return
    }

    applyTagEvent({
      type: 'entry-tag-added',
      manager,
      tagId: tag,
      name: rawTag,
      color,
    })
    setIsTagAddOpen(false)
    setAddingTagColor(null)
  }

  function openTagDialog(color: string) {
    setIsTagAddOpen(false)
    setAddingTagColor(color)
  }

  function removeTag(tag: string) {
    applyTagEvent({
      type: 'entry-tags-deleted',
      manager,
      tagIds: [tag],
    })
  }

  function closeTagEditor() {
    setEditingTagName(null)
  }

  function confirmTagEdit(nextName: string, color: string) {
    if (!editingTagName)
      return

    const nextTag = manager.normalizeName(nextName)

    if (!nextTag)
      return

    const duplicateTag = manager.collect(catalogEntries, settings).find((tag) => {
      return tag.key !== editingTagName && manager.normalizeName(tag.name) === nextTag
    })

    if (duplicateTag && !window.confirm(`${manager.itemLabel} "${nextTag}" already exists. Merge "${editingTagName}" into "${duplicateTag.name}"?`)) {
      onStatusChange(`${manager.itemLabel} name already exists. Choose another name or merge it.`)
      return
    }

    applyTagEvent({
      type: 'catalog-tag-updated',
      manager,
      oldTag: editingTagName,
      nextTag: duplicateTag?.key ?? editingTagName,
      name: nextName,
      color,
    })
    closeTagEditor()
    onStatusChange(`Updated ${manager.itemLabel.toLowerCase()} globally: ${nextTag}`)
  }

  function deleteEditingTag() {
    if (!editingTagName)
      return

    removeTag(editingTagName)
    closeTagEditor()
  }

  function clearCurrentTags() {
    if (!clearableTags.length)
      return

    applyTagEvent({
      type: 'entry-tags-deleted',
      manager,
      tagIds: clearableTags,
    })
    onStatusChange(`Cleared ${manager.itemLabelPlural.toLowerCase()}.`)
  }

  function beginTagDrag(event: DragEvent<HTMLSpanElement>, tag: string) {
    setDraggingTagName(tag)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tag)
  }

  function allowTagDrop(event: DragEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function dropTag(event: DragEvent<HTMLSpanElement>, targetTag: string) {
    event.preventDefault()
    const draggedTag = draggingTagName ?? event.dataTransfer.getData('text/plain')

    if (!draggedTag || draggedTag === targetTag) {
      setDraggingTagName(null)
      return
    }

    const nextTags = reorderByKey(currentTags, draggedTag, targetTag, (tag) => tag)

    if (nextTags === currentTags) {
      setDraggingTagName(null)
      return
    }

    applyTagEvent({
      type: 'entry-tags-reordered',
      manager,
      tagIds: nextTags,
    })
    setDraggingTagName(null)
    onStatusChange(`${manager.itemLabelPlural} order updated.`)
  }

  function getCurrentTagColor(tagId: string): string {
    return catalogTags[tagId]?.color ?? currentColors[tagId] ?? DEFAULT_TAG_COLOR
  }

  function getCurrentTagName(tagId: string): string {
    return catalogTags[tagId]?.name ?? tagId
  }

  function handleTagContextMenu(tagId: string, event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const catalogEntry = diaryCatalog
      ? diaryCatalog.activities[tagId] ?? diaryCatalog.people[tagId] ?? diaryCatalog.pointsOfInterest[tagId]
      : undefined
    const dates = catalogEntry?.entries ?? []

    const items: ContextMenuItem[] = [
      { kind: 'references', label: 'Show references', dates, onDateClick: (date) => onNavigateDate?.(date) },
    ]

    setContextMenu({ items, x: event.clientX, y: event.clientY })
  }

  return (
    <div className={`compact-panel tag-panel ${manager.panelClassName}`.trim()}>
      <div className="compact-title">
        {icon}
        {manager.itemLabelPlural}
        <span className="tag-panel-title-actions" ref={tagAddRef}>
          <button
            className="tag-panel-title-icon-button"
            type="button"
            disabled={currentTags.length >= manager.maxTags}
            title={`Add ${manager.itemLabel.toLowerCase()}`}
            onClick={() => setIsTagAddOpen((isOpen) => !isOpen)}
          >
            <Plus size={13} />
          </button>
          {onAutoAnalyze && (
            <button
              className="tag-panel-title-icon-button"
              type="button"
              title={`Auto analyze ${manager.itemLabelPlural.toLowerCase()}`}
              onClick={onAutoAnalyze}
            >
              <Sparkles size={13} />
            </button>
          )}
          {clearActionLabel && (
            <button
              className="tag-panel-title-icon-button"
              type="button"
              disabled={!clearableTags.length}
              title={clearActionLabel}
              onClick={clearCurrentTags}
            >
              <X size={13} />
            </button>
          )}
        </span>
      </div>
      <div className="activity-chips">
        {currentTags.map((tag) => (
          <span
            className={draggingTagName === tag ? 'tag-draggable-chip dragging' : 'tag-draggable-chip'}
            draggable={currentTags.length > 1}
            key={tag}
            onDragEnd={() => setDraggingTagName(null)}
            onDragOver={allowTagDrop}
            onDragStart={(event) => beginTagDrag(event, tag)}
            onDrop={(event) => dropTag(event, tag)}
          >
            <ActivityChipButton
              color={getCurrentTagColor(tag)}
              name={getCurrentTagName(tag)}
              onClick={() => setEditingTagName(tag)}
              onContextMenu={(e) => handleTagContextMenu(tag, e)}
            />
          </span>
        ))}
        {isTagAddOpen && createPortal(
          <div
            className="activity-recent-popover activity-recent-popover-floating"
            ref={tagPopoverRef}
            style={tagPopoverPosition ?? undefined}
          >
            {tagColorGroups.map((group) => {
              const isExpanded = group.color === visibleExpandedTagColor
              const groupName = manager.getColorGroupName(settings, group.color)

              return (
                <div
                  className="activity-color-group"
                  key={group.color}
                  onMouseEnter={() => setExpandedTagColor(group.color)}
                >
                  <button
                    className="activity-color-toggle"
                    type="button"
                    title={groupName}
                    onClick={() => setExpandedTagColor(group.color)}
                  >
                    <span className="activity-color-toggle-main">
                      <span className="activity-color-dot" style={{ backgroundColor: group.color }} />
                      <span>{groupName}</span>
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
                          pinned={tag.pinned}
                          onClick={() => addTag(tag.name, tag.color)}
                        />
                      ))}
                      <ActivityAddButton
                        title={`Add ${manager.itemLabel.toLowerCase()} to ${groupName}`}
                        onClick={() => openTagDialog(group.color)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <button className="activity-other-option" type="button" onClick={() => openTagDialog(DEFAULT_TAG_COLOR)}>
              Other
            </button>
          </div>,
          document.body,
        )}
      </div>
      {addingTagColor && (
        <ActivityAddDialog
          colorNames={colorNames}
          initialColor={addingTagColor}
          itemLabel={manager.itemLabel}
          onAdd={addTag}
          onCancel={() => setAddingTagColor(null)}
        />
      )}
      {editingTagName && (
        <ActivityEditDialog
          colorNames={colorNames}
          initialColor={getCurrentTagColor(editingTagName)}
          initialName={getCurrentTagName(editingTagName)}
          itemLabel={manager.itemLabel}
          onCancel={closeTagEditor}
          onDelete={deleteEditingTag}
          onSave={confirmTagEdit}
        />
      )}
      {contextMenu && (
        <TagContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
