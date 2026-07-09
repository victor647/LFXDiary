import { Pin, Plus } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_ACTIVITY_COLOR_GROUP_NAMES, DEFAULT_TAG_COLOR, TAG_COLOR_PALETTE } from '../domain/constants'
import { getTagBackgroundColor, getTagTextColor } from '../utils/colors'

type ActivityChipButtonProps = {
  name: string
  color: string
  count?: number
  pinned?: boolean
  onClick: () => void
}

type ActivityAddButtonProps = {
  disabled?: boolean
  onClick: () => void
  title?: string
}

type ActivityAddDialogProps = {
  colorNames?: Record<string, string>
  initialColor?: string
  itemLabel?: string
  onAdd: (name: string, color: string) => void
  onCancel: () => void
}

type ActivityEditDialogProps = {
  colorNames?: Record<string, string>
  initialColor: string
  initialName: string
  itemLabel?: string
  showDelete?: boolean
  onCancel: () => void
  onDelete: () => void
  onSave: (name: string, color: string) => void
}

export function ActivityChipButton({ name, color, count, pinned, onClick }: ActivityChipButtonProps) {
  return (
    <button
      type="button"
      title={typeof count === 'number' ? `${name}: ${count} ${count === 1 ? 'entry' : 'entries'}` : name}
      style={{
        backgroundColor: getTagBackgroundColor(color),
        borderColor: color,
        color: getTagTextColor(color),
      }}
      onClick={onClick}
    >
      {pinned && <Pin className="activity-chip-pin" size={11} />}
      <span className="activity-chip-name">{name}</span>
      {typeof count === 'number' && <span className="activity-chip-count">{count}</span>}
    </button>
  )
}

export function ActivityAddButton({ disabled, onClick, title = 'Add activity' }: ActivityAddButtonProps) {
  return (
    <button
      className="activity-add-toggle"
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <Plus size={15} />
    </button>
  )
}

export function ActivityAddDialog({
  colorNames,
  initialColor = DEFAULT_TAG_COLOR,
  itemLabel = 'Activity',
  onAdd,
  onCancel,
}: ActivityAddDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(initialColor)

  function confirm() {
    onAdd(name, color)
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="activity-dialog" role="dialog" aria-modal="true" aria-label={`Add ${itemLabel.toLowerCase()}`}>
        <div className="compact-title">Add {itemLabel}</div>
        <ActivityColorPalette color={color} colorNames={colorNames} label={`${itemLabel} color`} onColorChange={setColor} />
        <div className="tag-input">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter')
                confirm()
            }}
          />
          <button type="button" onClick={confirm}>
            Confirm
          </button>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export function ActivityEditDialog({
  colorNames,
  initialColor,
  initialName,
  itemLabel = 'Activity',
  showDelete = true,
  onCancel,
  onDelete,
  onSave,
}: ActivityEditDialogProps) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)

  function confirm() {
    onSave(name, color)
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="activity-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${itemLabel.toLowerCase()}`}>
        <div className="compact-title">Edit {itemLabel}</div>
        <ActivityColorPalette color={color} colorNames={colorNames} label={`${itemLabel} color`} onColorChange={setColor} />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter')
              confirm()
          }}
        />
        <div className="dialog-actions">
          {showDelete && (
            <button className="danger-button" type="button" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={confirm}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ActivityColorPalette({
  color,
  colorNames,
  label,
  onColorChange,
}: {
  color: string
  colorNames?: Record<string, string>
  label: string
  onColorChange: (color: string) => void
}) {
  return (
    <div className="location-color-palette" aria-label={label}>
      {TAG_COLOR_PALETTE.map((paletteColor) => (
        <button
          className={color === paletteColor ? 'tag-color-swatch selected' : 'tag-color-swatch'}
          key={paletteColor}
          type="button"
          style={{ backgroundColor: paletteColor }}
          title={colorNames?.[paletteColor] || DEFAULT_ACTIVITY_COLOR_GROUP_NAMES[paletteColor] || paletteColor}
          onClick={() => onColorChange(paletteColor)}
        />
      ))}
    </div>
  )
}
