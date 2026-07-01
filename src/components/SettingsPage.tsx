import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GitBranch,
  HardDrive,
  MapPin,
  Network,
  PersonStanding,
  Save,
  Tags,
  Thermometer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { DEFAULT_TAG_COLOR, LOCATION_COLOR_PALETTE, TAG_COLOR_PALETTE } from '../domain/constants'
import type { AppSettings, DiaryEntry } from '../domain/types'
import { getLocationNameKey, updateEntryActivity } from '../utils/diaryEntryHelpers'
import {
  getActiveNasUrl,
  getActivityColorGroupName,
  getTemperatureColorBands,
  normalizeTemperatureThresholds,
} from '../utils/settings'
import { normalizeTag } from '../utils/tags'
import {
  ActivityAddButton,
  ActivityAddDialog,
  ActivityChipButton,
  ActivityEditDialog,
} from './ActivityTagControls'

type SettingsPageProps = {
  settings: AppSettings
  draft: DiaryEntry
  entries: DiaryEntry[]
  onSettingsChange: (settings: AppSettings) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
  onSave: () => void
  onBack: () => void
}

type ActivityTagItem = {
  name: string
  color: string
  count: number
}

type LocationTagItem = {
  key: string
  name: string
  color: string
  count: number
}

type ActivityColorGroupItem = {
  color: string
  name: string
  tags: ActivityTagItem[]
}

export function SettingsPage({
  settings,
  draft,
  entries,
  onSettingsChange,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
  onSave,
  onBack,
}: SettingsPageProps) {
  const activeNasUrl = getActiveNasUrl(settings)
  const isNasSync = settings.syncProvider === 'nas'
  const isGitSync = settings.syncProvider === 'git'
  const catalogEntries = useMemo(() => [draft, ...entries.filter((entry) => entry.id !== draft.id)], [draft, entries])
  const activityTags = useMemo(() => getActivityTags(catalogEntries, settings), [catalogEntries, settings])
  const activityColorGroups = useMemo(() => getActivityColorGroups(activityTags, settings), [activityTags, settings])
  const locationTags = useMemo(() => getLocationTags(catalogEntries), [catalogEntries])
  const temperatureColorBands = useMemo(
    () => getTemperatureColorBands(settings.temperatureThresholds),
    [settings.temperatureThresholds],
  )
  const [addingActivityColor, setAddingActivityColor] = useState<string | null>(null)
  const [editingActivityTag, setEditingActivityTag] = useState<ActivityTagItem | null>(null)
  const [expandedActivityManagerColor, setExpandedActivityManagerColor] = useState<string | null>(null)

  function applyActivityTag(oldTag: string, nextName: string, color: string) {
    const nextTag = normalizeTag(nextName)

    if (!nextTag) {
      onStatusChange('Activity name cannot be empty.')
      return
    }

    const nextEntries = entries.map((entry) => updateEntryActivity(entry, oldTag, nextTag, color))
    const nextDraft = updateEntryActivity(draft, oldTag, nextTag, color)
    onSettingsChange({
      ...settings,
      activityTags: updateActivityTagCatalog(settings.activityTags, oldTag, nextTag, color),
    })
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    setEditingActivityTag(null)
    onStatusChange(`Updated activity: ${nextTag}`)
  }

  function addActivityTag(rawTag: string, color: string) {
    const nextTag = normalizeTag(rawTag)

    if (!nextTag) {
      onStatusChange('Activity name cannot be empty.')
      return
    }

    if (activityTags.some((tag) => tag.name === nextTag)) {
      onStatusChange(`Activity already exists: ${nextTag}`)
      return
    }

    onSettingsChange({
      ...settings,
      activityTags: {
        ...settings.activityTags,
        [nextTag]: { color },
      },
    })
    setAddingActivityColor(null)
    onStatusChange(`Added activity: ${nextTag}`)
  }

  function updateActivityGroupName(color: string, name: string) {
    onSettingsChange({
      ...settings,
      activityColorGroupNames: {
        ...settings.activityColorGroupNames,
        [color]: name,
      },
    })
  }

  function deleteActivityTag(tag: string) {
    const usageCount = activityTags.find((activityTag) => normalizeTag(activityTag.name) === normalizeTag(tag))?.count ?? 0

    if (usageCount > 0 && !window.confirm(`Delete activity "${tag}" from ${usageCount} ${usageCount === 1 ? 'entry' : 'entries'}?`))
      return

    const nextEntries = entries.map((entry) => deleteEntryActivity(entry, tag))
    const nextDraft = deleteEntryActivity(draft, tag)
    onSettingsChange({
      ...settings,
      activityTags: deleteActivityTagCatalog(settings.activityTags, tag),
    })
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    setEditingActivityTag(null)
    onStatusChange(`Deleted activity: ${tag}`)
  }

  function applyLocationColor(location: LocationTagItem, color: string) {
    const nextEntries = entries.map((entry) => updateEntryLocationColor(entry, location.key, color))
    const nextDraft = updateEntryLocationColor(draft, location.key, color)
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    onStatusChange(`Updated location color: ${location.name}`)
  }

  function updateTemperatureThreshold(bandId: string, value: string) {
    const threshold = Number.parseInt(value, 10)

    if (!Number.isFinite(threshold))
      return

    onSettingsChange({
      ...settings,
      temperatureThresholds: normalizeTemperatureThresholds({
        ...settings.temperatureThresholds,
        [bandId]: threshold,
      }),
    })
  }

  return (
    <section className="settings-page">
      <div className="settings-header">
        <button type="button" className="settings-back-button" onClick={onBack} title="Back to diary">
          <ArrowLeft size={16} />
          Back
        </button>
        <div>
          <h2>Settings</h2>
          <p>Markdown diary storage and sync provider.</p>
        </div>
      </div>

      <div className="settings-body">
        <div className="settings-section">
          <div className="settings-section-title">
            <HardDrive size={16} />
            Sync Provider
          </div>
          <div className="settings-mode-control">
            <button
              className={isNasSync ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, syncProvider: 'nas' })}
            >
              NAS
            </button>
            <button
              className={isGitSync ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, syncProvider: 'git' })}
            >
              Git
            </button>
          </div>
        </div>

        {isNasSync && (
          <div className="settings-section">
          <div className="settings-section-title">
            <Network size={16} />
            NAS Connection
          </div>
          <div className="settings-mode-control">
            <button
              className={settings.nasMode === 'lan' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, nasMode: 'lan' })}
            >
              LAN
            </button>
            <button
              className={settings.nasMode === 'public' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, nasMode: 'public' })}
            >
              Public
            </button>
          </div>
          <label>
            Username
            <input
              value={settings.nasUsername}
              onChange={(event) => onSettingsChange({ ...settings, nasUsername: event.target.value })}
              placeholder="DSM username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              value={settings.nasPassword}
              onChange={(event) => onSettingsChange({ ...settings, nasPassword: event.target.value })}
              placeholder="DSM password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            LAN NAS Address
            <input
              value={settings.lanNasUrl}
              onChange={(event) => onSettingsChange({ ...settings, lanNasUrl: event.target.value })}
              placeholder="https://192.168.0.2:5001/"
            />
          </label>
          <label>
            Public NAS Address
            <input
              value={settings.publicNasUrl}
              onChange={(event) => onSettingsChange({ ...settings, publicNasUrl: event.target.value })}
              placeholder="https://lafaxi647.cn:5001/"
            />
          </label>
        </div>
      )}

      {isGitSync && (
        <div className="settings-section">
          <div className="settings-section-title">
            <GitBranch size={16} />
            Git Repository
          </div>
          <label>
            Remote URL
            <input
              value={settings.gitRemoteUrl}
              onChange={(event) => onSettingsChange({ ...settings, gitRemoteUrl: event.target.value })}
              placeholder="https://github.com/user/diary.git"
            />
          </label>
          <label>
            Branch
            <input
              value={settings.gitBranch}
              onChange={(event) => onSettingsChange({ ...settings, gitBranch: event.target.value })}
              placeholder="main"
            />
          </label>
          <label>
            Username
            <input
              value={settings.gitUsername}
              onChange={(event) => onSettingsChange({ ...settings, gitUsername: event.target.value })}
              placeholder="Git username"
              autoComplete="username"
            />
          </label>
          <label>
            Password or Token
            <input
              value={settings.gitPassword}
              onChange={(event) => onSettingsChange({ ...settings, gitPassword: event.target.value })}
              placeholder="Personal access token"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            Author Name
            <input
              value={settings.gitAuthorName}
              onChange={(event) => onSettingsChange({ ...settings, gitAuthorName: event.target.value })}
              placeholder="Diary"
            />
          </label>
          <label>
            Author Email
            <input
              value={settings.gitAuthorEmail}
              onChange={(event) => onSettingsChange({ ...settings, gitAuthorEmail: event.target.value })}
              placeholder="diary@example.com"
            />
          </label>
          <label>
            Repo Folder
            <input
              value={settings.gitDiaryPath}
              onChange={(event) => onSettingsChange({ ...settings, gitDiaryPath: event.target.value })}
              placeholder="Diary"
            />
          </label>
          <label>
            CORS Proxy
            <input
              value={settings.gitCorsProxy}
              onChange={(event) => onSettingsChange({ ...settings, gitCorsProxy: event.target.value })}
              placeholder="Optional, e.g. https://cors.isomorphic-git.org"
            />
          </label>
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title">
          <HardDrive size={16} />
          Markdown Storage
        </div>
        {isNasSync && (
          <label>
            NAS Folder
            <input
              value={settings.markdownFolder}
              onChange={(event) => onSettingsChange({ ...settings, markdownFolder: event.target.value })}
              placeholder="/Diary"
            />
          </label>
        )}
        <div className="settings-preview">
          <span>Provider</span>
          <strong>{isGitSync ? 'Git' : 'Synology NAS'}</strong>
          {isNasSync && (
            <>
              <span>Active NAS</span>
              <strong>{activeNasUrl}</strong>
            </>
          )}
          {isGitSync && (
            <>
              <span>Remote</span>
              <strong>{settings.gitRemoteUrl || 'Not configured'}</strong>
              <span>Branch</span>
              <strong>{settings.gitBranch || 'main'}</strong>
              <span>Repo folder</span>
              <strong>{settings.gitDiaryPath || 'Diary'}</strong>
            </>
          )}
          <span>Save format</span>
          <strong>Markdown (.md)</strong>
          {isNasSync && (
            <>
              <span>Remote folder</span>
              <strong>{settings.markdownFolder}</strong>
            </>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <Tags size={16} />
          Tag Manager
        </div>
        <div className="tag-manager-grid">
          <div className="tag-manager-list">
            <div className="tag-manager-list-title">
              <PersonStanding size={15} />
              Activities
            </div>
            {activityColorGroups.length ? (
              activityColorGroups.map((group) => {
                const isExpanded = group.color === expandedActivityManagerColor

                return (
                  <div className="activity-manager-group" key={group.color}>
                    <div className="activity-manager-group-header">
                      <button
                        className="tag-manager-icon-button"
                        type="button"
                        title={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
                        onClick={() => setExpandedActivityManagerColor(isExpanded ? null : group.color)}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span
                        className="tag-manager-swatch"
                        style={{ backgroundColor: group.color }}
                        title={`Activity color ${group.color}`}
                      />
                      <input
                        aria-label={`Activity group ${group.name}`}
                        value={settings.activityColorGroupNames[group.color] ?? group.name}
                        onChange={(event) => updateActivityGroupName(group.color, event.target.value)}
                      />
                      <span className="tag-manager-count">{group.tags.length}</span>
                    </div>
                    {isExpanded && (
                      <div className="activity-manager-chip-list">
                        {group.tags.map((tag) => (
                          <ActivityChipButton
                            count={tag.count}
                            color={tag.color}
                            key={tag.name}
                            name={tag.name}
                            onClick={() => setEditingActivityTag(tag)}
                          />
                        ))}
                        <ActivityAddButton
                          title={`Add activity to ${group.name}`}
                          onClick={() => setAddingActivityColor(group.color)}
                        />
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="tag-manager-empty">No activities</p>
            )}
          </div>

          <div className="tag-manager-list">
            <div className="tag-manager-list-title">
              <MapPin size={15} />
              Locations
            </div>
            {locationTags.length ? (
              locationTags.map((location) => (
                <div className="tag-manager-row" key={location.key}>
                  <span
                    className="tag-manager-swatch"
                    style={{ backgroundColor: location.color }}
                    title={`Location color ${location.color}`}
                  />
                  <span className="tag-manager-name" title={location.name}>{location.name}</span>
                  <span className="tag-manager-count">{location.count}</span>
                  <div className="tag-manager-palette" aria-label={`Location ${location.name} color`}>
                    {LOCATION_COLOR_PALETTE.map((color) => (
                      <button
                        className={location.color === color ? 'selected' : ''}
                        key={color}
                        type="button"
                        style={{ backgroundColor: color }}
                        title={`Set color ${color}`}
                        onClick={() => applyLocationColor(location, color)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="tag-manager-empty">No locations</p>
            )}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <Thermometer size={16} />
          Temperature Colors
        </div>
        <div className="temperature-settings-list">
          {temperatureColorBands.map((band, index) => (
            <div className="temperature-settings-row" key={band.id}>
              <span
                className="tag-manager-swatch"
                style={{ backgroundColor: band.color }}
                title={`Temperature color ${band.color}`}
              />
              <span className="tag-manager-name">{band.label}</span>
              <span
                className="temperature-settings-preview"
                style={{ backgroundColor: `${band.color}1f`, borderColor: band.color }}
              />
              {index < temperatureColorBands.length - 1 ? (
                <label className="temperature-threshold-input">
                  Ends below
                  <input
                    type="number"
                    value={band.maxC ?? ''}
                    onChange={(event) => updateTemperatureThreshold(band.id, event.target.value)}
                  />
                </label>
              ) : (
                <span className="temperature-threshold-tail">Above last limit</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {addingActivityColor && (
        <ActivityAddDialog
          colorNames={settings.activityColorGroupNames}
          initialColor={addingActivityColor}
          onAdd={addActivityTag}
          onCancel={() => setAddingActivityColor(null)}
        />
      )}
      {editingActivityTag && (
        <ActivityEditDialog
          colorNames={settings.activityColorGroupNames}
          initialColor={editingActivityTag.color}
          initialName={editingActivityTag.name}
          onCancel={() => setEditingActivityTag(null)}
          onDelete={() => deleteActivityTag(editingActivityTag.name)}
          onSave={(name, color) => applyActivityTag(editingActivityTag.name, name, color)}
        />
      )}

      <div className="settings-actions">
        <button type="button" onClick={onSave}>
          <Save size={16} />
          Save Settings
        </button>
      </div>
      </div>
    </section>
  )
}

function getActivityTags(entries: DiaryEntry[], settings: AppSettings): ActivityTagItem[] {
  const tags = new Map<string, ActivityTagItem>()

  for (const [name, tag] of Object.entries(settings.activityTags)) {
    const normalizedName = normalizeTag(name)

    if (!normalizedName)
      continue

    tags.set(normalizedName, {
      name: normalizedName,
      color: tag.color || DEFAULT_TAG_COLOR,
      count: 0,
    })
  }

  for (const entry of entries) {
    for (const tag of entry.tags) {
      const name = normalizeTag(tag)

      if (!name)
        continue

      const current = tags.get(name)
      tags.set(name, {
        name,
        color: current?.color ?? entry.tagColors[tag] ?? DEFAULT_TAG_COLOR,
        count: (current?.count ?? 0) + 1,
      })
    }
  }

  return Array.from(tags.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function getActivityColorGroups(activityTags: ActivityTagItem[], settings: AppSettings): ActivityColorGroupItem[] {
  const tagsByColor = new Map<string, ActivityTagItem[]>()

  for (const tag of activityTags) {
    const color = tag.color || DEFAULT_TAG_COLOR
    tagsByColor.set(color, [...(tagsByColor.get(color) ?? []), tag])
  }

  const customColors = Array.from(tagsByColor.keys()).filter((color) => !TAG_COLOR_PALETTE.includes(color))

  return [...TAG_COLOR_PALETTE, ...customColors].map((color) => ({
    color,
    name: getActivityColorGroupName(settings, color),
    tags: tagsByColor.get(color) ?? [],
  }))
}

function updateActivityTagCatalog(
  activityTags: AppSettings['activityTags'],
  oldTag: string,
  nextTag: string,
  color: string,
): AppSettings['activityTags'] {
  const nextActivityTags = { ...activityTags }

  delete nextActivityTags[oldTag]
  nextActivityTags[nextTag] = { color }

  return nextActivityTags
}

function deleteActivityTagCatalog(
  activityTags: AppSettings['activityTags'],
  tag: string,
): AppSettings['activityTags'] {
  const normalizedTag = normalizeTag(tag)
  const nextActivityTags: AppSettings['activityTags'] = {}

  for (const [name, activityTag] of Object.entries(activityTags)) {
    if (normalizeTag(name) !== normalizedTag)
      nextActivityTags[name] = activityTag
  }

  return nextActivityTags
}

function getLocationTags(entries: DiaryEntry[]): LocationTagItem[] {
  const locations = new Map<string, LocationTagItem>()

  for (const entry of entries) {
    for (const city of entry.cities) {
      const key = getLocationNameKey(city)
      const current = locations.get(key)

      locations.set(key, {
        key,
        name: current?.name ?? city.name,
        color: current?.color ?? entry.locationColors[city.id] ?? DEFAULT_TAG_COLOR,
        count: (current?.count ?? 0) + 1,
      })
    }
  }

  return Array.from(locations.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function deleteEntryActivity(entry: DiaryEntry, tag: string): DiaryEntry {
  const normalizedTag = normalizeTag(tag)
  const matchingTags = entry.tags.filter((item) => normalizeTag(item) === normalizedTag)

  if (!matchingTags.length)
    return entry

  const tagColors = { ...entry.tagColors }

  for (const matchingTag of matchingTags)
    delete tagColors[matchingTag]

  return {
    ...entry,
    tags: entry.tags.filter((item) => normalizeTag(item) !== normalizedTag),
    tagColors,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}

function updateEntryLocationColor(entry: DiaryEntry, locationKey: string, color: string): DiaryEntry {
  const matchingCityIds = entry.cities.filter((city) => getLocationNameKey(city) === locationKey).map((city) => city.id)

  if (!matchingCityIds.length)
    return entry

  const locationColors = { ...entry.locationColors }

  for (const cityId of matchingCityIds)
    locationColors[cityId] = color

  return {
    ...entry,
    locationColors,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}
