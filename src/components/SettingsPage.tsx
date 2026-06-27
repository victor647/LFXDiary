import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  HardDrive,
  MapPin,
  Network,
  PersonStanding,
  Save,
  Tags,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_TAG_COLOR, LOCATION_COLOR_PALETTE, TAG_COLOR_PALETTE } from '../domain/constants'
import type { AppSettings, DiaryEntry } from '../domain/types'
import { getLocationNameKey, updateEntryActivity, updateEntryLocations } from '../utils/diaryEntryHelpers'
import { getActiveNasUrl, getActivityColorGroupName } from '../utils/settings'
import { normalizeTag } from '../utils/tags'

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
  const activityTags = useMemo(() => getActivityTags(catalogEntries), [catalogEntries])
  const activityColorGroups = useMemo(() => getActivityColorGroups(activityTags, settings), [activityTags, settings])
  const locationTags = useMemo(() => getLocationTags(catalogEntries), [catalogEntries])
  const [activityDraftNames, setActivityDraftNames] = useState<Record<string, string>>({})
  const [locationDraftNames, setLocationDraftNames] = useState<Record<string, string>>({})
  const [expandedActivityManagerColor, setExpandedActivityManagerColor] = useState<string | null>(null)

  useEffect(() => {
    setActivityDraftNames((current) => syncDraftNames(current, activityTags, (tag) => tag.name, (tag) => tag.name))
  }, [activityTags])

  useEffect(() => {
    setLocationDraftNames((current) => syncDraftNames(current, locationTags, (location) => location.key, (location) => location.name))
  }, [locationTags])

  function applyActivityTag(oldTag: string, fallbackName: string, color: string) {
    const nextTag = normalizeTag(activityDraftNames[oldTag] ?? fallbackName)

    if (!nextTag) {
      onStatusChange('Activity name cannot be empty.')
      return
    }

    const nextEntries = entries.map((entry) => updateEntryActivity(entry, oldTag, nextTag, color))
    const nextDraft = updateEntryActivity(draft, oldTag, nextTag, color)
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    onStatusChange(`Updated activity: ${nextTag}`)
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
    if (!window.confirm(`Delete activity "${tag}" from all entries?`))
      return

    const nextEntries = entries.map((entry) => deleteEntryActivity(entry, tag))
    const nextDraft = deleteEntryActivity(draft, tag)
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    onStatusChange(`Deleted activity: ${tag}`)
  }

  function applyLocationTag(location: LocationTagItem, color: string) {
    const nextName = (locationDraftNames[location.key] ?? location.name).trim()

    if (!nextName) {
      onStatusChange('Location name cannot be empty.')
      return
    }

    const nextEntries = entries.map((entry) => updateEntryLocations(entry, location.key, nextName, color))
    const nextDraft = updateEntryLocations(draft, location.key, nextName, color)
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    onStatusChange(`Updated location: ${nextName}`)
  }

  function deleteLocationTag(location: LocationTagItem) {
    if (!window.confirm(`Delete location "${location.name}" from all entries?`))
      return

    const nextEntries = entries.map((entry) => deleteEntryLocation(entry, location.key))
    const nextDraft = deleteEntryLocation(draft, location.key)
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    onStatusChange(`Deleted location: ${location.name}`)
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
                      <div className="activity-manager-tags">
                        {group.tags.map((tag) => (
                          <div className="activity-manager-tag-row" key={tag.name}>
                            <input
                              aria-label={`Activity ${tag.name}`}
                              value={activityDraftNames[tag.name] ?? tag.name}
                              onChange={(event) =>
                                setActivityDraftNames((current) => ({ ...current, [tag.name]: event.target.value }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter')
                                  applyActivityTag(tag.name, tag.name, tag.color)
                              }}
                            />
                            <span className="tag-manager-count">{tag.count}</span>
                            <select
                              aria-label={`Move ${tag.name} to activity group`}
                              value={tag.color}
                              onChange={(event) => applyActivityTag(tag.name, tag.name, event.target.value)}
                            >
                              {activityColorGroups.map((option) => (
                                <option key={option.color} value={option.color}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="tag-manager-icon-button"
                              type="button"
                              title={`Save ${tag.name}`}
                              onClick={() => applyActivityTag(tag.name, tag.name, tag.color)}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className="tag-manager-icon-button danger-button"
                              type="button"
                              title={`Delete ${tag.name}`}
                              onClick={() => deleteActivityTag(tag.name)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
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
                  <input
                    aria-label={`Location ${location.name}`}
                    value={locationDraftNames[location.key] ?? location.name}
                    onChange={(event) =>
                      setLocationDraftNames((current) => ({ ...current, [location.key]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter')
                        applyLocationTag(location, location.color)
                    }}
                  />
                  <span className="tag-manager-count">{location.count}</span>
                  <div className="tag-manager-palette" aria-label={`Location ${location.name} color`}>
                    {LOCATION_COLOR_PALETTE.map((color) => (
                      <button
                        className={location.color === color ? 'selected' : ''}
                        key={color}
                        type="button"
                        style={{ backgroundColor: color }}
                        title={`Set color ${color}`}
                        onClick={() => applyLocationTag(location, color)}
                      />
                    ))}
                  </div>
                  <button
                    className="tag-manager-icon-button"
                    type="button"
                    title={`Save ${location.name}`}
                    onClick={() => applyLocationTag(location, location.color)}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="tag-manager-icon-button danger-button"
                    type="button"
                    title={`Delete ${location.name}`}
                    onClick={() => deleteLocationTag(location)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="tag-manager-empty">No locations</p>
            )}
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={onSave}>
          <Save size={16} />
          Save Settings
        </button>
      </div>
    </section>
  )
}

function getActivityTags(entries: DiaryEntry[]): ActivityTagItem[] {
  const tags = new Map<string, ActivityTagItem>()

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

function syncDraftNames<T>(
  current: Record<string, string>,
  items: T[],
  getKey: (item: T) => string,
  getName: (item: T) => string,
): Record<string, string> {
  const next: Record<string, string> = {}

  for (const item of items) {
    const key = getKey(item)
    next[key] = current[key] ?? getName(item)
  }

  return next
}

function deleteEntryActivity(entry: DiaryEntry, tag: string): DiaryEntry {
  if (!entry.tags.includes(tag))
    return entry

  const tagColors = { ...entry.tagColors }
  delete tagColors[tag]

  return {
    ...entry,
    tags: entry.tags.filter((item) => item !== tag),
    tagColors,
    updatedAt: new Date().toISOString(),
  }
}

function deleteEntryLocation(entry: DiaryEntry, locationKey: string): DiaryEntry {
  const removedCityIds = new Set(entry.cities.filter((city) => getLocationNameKey(city) === locationKey).map((city) => city.id))

  if (!removedCityIds.size)
    return entry

  const locationColors = { ...entry.locationColors }

  for (const cityId of removedCityIds)
    delete locationColors[cityId]

  const hasRemovedWeatherSample = entry.weatherSamples.some((sample) => removedCityIds.has(sample.cityId))

  return {
    ...entry,
    cities: entry.cities.filter((city) => !removedCityIds.has(city.id)),
    locationColors,
    weatherSamples: hasRemovedWeatherSample ? [] : entry.weatherSamples,
    dailyWeatherCode: hasRemovedWeatherSample ? null : entry.dailyWeatherCode,
    dailyWeatherText: hasRemovedWeatherSample ? 'Not fetched' : entry.dailyWeatherText,
    dailyPrecipitationMm: hasRemovedWeatherSample ? 0 : entry.dailyPrecipitationMm,
    updatedAt: new Date().toISOString(),
  }
}
