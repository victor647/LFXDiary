import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GitBranch,
  HardDrive,
  Leaf,
  MapPin,
  Network,
  PersonStanding,
  Save,
  Tags,
  Thermometer,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { LOCATION_COLOR_PALETTE } from '../domain/constants'
import {
  activityTagManager,
  locationTagManager,
  personTagManager,
  type ActivityTag,
  type CatalogDiaryTagManager,
  type LocationTag,
  type PersonTag,
} from '../domain/tagModels'
import type { AppSettings, DiaryEntry } from '../domain/types'
import { toDateInputValue } from '../utils/date'
import { getLocationNameKey } from '../utils/diaryEntryHelpers'
import {
  getActiveNasUrl,
  getTemperatureColorBands,
  normalizeTemperatureThresholds,
  saveSettings,
} from '../utils/settings'
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

type ActivityTagItem = ActivityTag
type PeopleTagItem = PersonTag
type LocationTagItem = LocationTag
type CatalogManager = CatalogDiaryTagManager<ActivityTag | PersonTag>

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
  const maxBirthDate = toDateInputValue(new Date())
  const catalogEntries = useMemo(() => [draft, ...entries.filter((entry) => entry.id !== draft.id)], [draft, entries])
  const activityTags = useMemo(() => activityTagManager.collect(catalogEntries, settings), [catalogEntries, settings])
  const activityColorGroups = useMemo(() => activityTagManager.groupTags(activityTags, settings), [activityTags, settings])
  const peopleTags = useMemo(() => personTagManager.collect(catalogEntries, settings), [catalogEntries, settings])
  const peopleColorGroups = useMemo(() => personTagManager.groupTags(peopleTags, settings), [peopleTags, settings])
  const locationTags = useMemo(() => locationTagManager.collect(catalogEntries), [catalogEntries])
  const unusedActivityTagCount = activityTags.filter((tag) => tag.count === 0).length
  const unusedPeopleTagCount = peopleTags.filter((tag) => tag.count === 0).length
  const temperatureColorBands = useMemo(
    () => getTemperatureColorBands(settings.temperatureThresholds),
    [settings.temperatureThresholds],
  )
  const [addingActivityColor, setAddingActivityColor] = useState<string | null>(null)
  const [editingActivityTag, setEditingActivityTag] = useState<ActivityTagItem | null>(null)
  const [expandedActivityManagerColor, setExpandedActivityManagerColor] = useState<string | null>(null)
  const [addingPeopleColor, setAddingPeopleColor] = useState<string | null>(null)
  const [editingPeopleTag, setEditingPeopleTag] = useState<PeopleTagItem | null>(null)
  const [expandedPeopleManagerColor, setExpandedPeopleManagerColor] = useState<string | null>(null)

  function applyActivityTag(oldTag: string, nextName: string, color: string) {
    applyCatalogTag(activityTagManager, oldTag, nextName, color, () => setEditingActivityTag(null))
  }

  function addActivityTag(rawTag: string, color: string) {
    addCatalogTag(activityTagManager, rawTag, color, () => setAddingActivityColor(null))
  }

  function updateActivityGroupName(color: string, name: string) {
    updateCatalogGroupName(activityTagManager, color, name)
  }

  function applyPeopleTag(oldTag: string, nextName: string, color: string) {
    applyCatalogTag(personTagManager, oldTag, nextName, color, () => setEditingPeopleTag(null))
  }

  function addPeopleTag(rawTag: string, color: string) {
    addCatalogTag(personTagManager, rawTag, color, () => setAddingPeopleColor(null))
  }

  function updatePeopleGroupName(color: string, name: string) {
    updateCatalogGroupName(personTagManager, color, name)
  }

  function deletePeopleTag(tag: string) {
    deleteCatalogTag(personTagManager, tag, () => setEditingPeopleTag(null))
  }

  function clearUnusedPeopleTags() {
    clearUnusedCatalogTags(personTagManager, editingPeopleTag, () => setEditingPeopleTag(null))
  }

  function deleteActivityTag(tag: string) {
    deleteCatalogTag(activityTagManager, tag, () => setEditingActivityTag(null))
  }

  function clearUnusedActivityTags() {
    clearUnusedCatalogTags(activityTagManager, editingActivityTag, () => setEditingActivityTag(null))
  }

  function applyCatalogTag(
    manager: CatalogManager,
    oldTag: string,
    nextName: string,
    color: string,
    clearEditingTag: () => void,
  ) {
    const nextTag = manager.normalizeName(nextName)

    if (!nextTag) {
      onStatusChange(`${manager.itemLabel} name cannot be empty.`)
      return
    }

    const nextEntries = entries.map((entry) => manager.updateEntryTag(entry, oldTag, nextTag, color))
    const nextDraft = manager.updateEntryTag(draft, oldTag, nextTag, color)

    commitTagManagerSettings(manager.setCatalog(
      settings,
      manager.updateCatalog(manager.getCatalog(settings), oldTag, nextTag, color),
    ))
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    clearEditingTag()
    onStatusChange(`Updated ${manager.itemLabel.toLowerCase()}: ${nextTag}`)
  }

  function addCatalogTag(
    manager: CatalogManager,
    rawTag: string,
    color: string,
    closeDialog: () => void,
  ) {
    const nextTag = manager.normalizeName(rawTag)

    if (!nextTag) {
      onStatusChange(`${manager.itemLabel} name cannot be empty.`)
      return
    }

    if (manager.collect(catalogEntries, settings).some((tag) => tag.name === nextTag)) {
      onStatusChange(`${manager.itemLabel} already exists: ${nextTag}`)
      return
    }

    commitTagManagerSettings(manager.setCatalog(settings, {
      ...manager.getCatalog(settings),
      [nextTag]: { color },
    }))
    closeDialog()
    onStatusChange(`Added ${manager.itemLabel.toLowerCase()}: ${nextTag}`)
  }

  function updateCatalogGroupName(manager: CatalogManager, color: string, name: string) {
    commitTagManagerSettings(manager.setColorGroupName(settings, color, name))
  }

  function deleteCatalogTag(manager: CatalogManager, tag: string, clearEditingTag: () => void) {
    const normalizedTag = manager.normalizeName(tag)
    const usageCount = manager.collect(catalogEntries, settings).find((item) => manager.normalizeName(item.name) === normalizedTag)?.count ?? 0

    if (usageCount > 0 && !window.confirm(`Delete ${manager.itemLabel.toLowerCase()} "${tag}" from ${usageCount} ${usageCount === 1 ? 'entry' : 'entries'}?`))
      return

    const nextEntries = entries.map((entry) => manager.deleteEntryTag(entry, tag))
    const nextDraft = manager.deleteEntryTag(draft, tag)

    commitTagManagerSettings(manager.setCatalog(
      settings,
      manager.deleteCatalogTags(manager.getCatalog(settings), [tag]),
    ))
    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    clearEditingTag()
    onStatusChange(`Deleted ${manager.itemLabel.toLowerCase()}: ${tag}`)
  }

  function clearUnusedCatalogTags(manager: CatalogManager, editingTag: ActivityTagItem | PeopleTagItem | null, clearEditingTag: () => void) {
    const unusedTags = manager.collect(catalogEntries, settings).filter((tag) => tag.count === 0).map((tag) => tag.name)

    if (!unusedTags.length) {
      onStatusChange(`No unused ${manager.itemLabel.toLowerCase()} tags.`)
      return
    }

    commitTagManagerSettings(manager.setCatalog(
      settings,
      manager.deleteCatalogTags(manager.getCatalog(settings), unusedTags),
    ))

    if (editingTag && unusedTags.some((tag) => manager.normalizeName(tag) === manager.normalizeName(editingTag.name)))
      clearEditingTag()

    onStatusChange(`Cleared ${unusedTags.length} unused ${manager.itemLabel.toLowerCase()} ${unusedTags.length === 1 ? 'tag' : 'tags'}.`)
  }

  function commitTagManagerSettings(nextSettings: AppSettings) {
    onSettingsChange(nextSettings)
    saveSettings(nextSettings)
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
        <button type="button" className="settings-save-button" onClick={onSave}>
          <Save size={16} />
          Save Settings
        </button>
      </div>

      <div className="settings-body">
        <div className="settings-category settings-category-personal">Personal Information</div>
        <div className="settings-category settings-category-sync">Network Sync</div>
        <div className="settings-category settings-category-tags">Tags & Catalog</div>
        <div className="settings-category settings-category-weather">Weather</div>

        <div className="settings-section settings-sync-provider-section">
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

        <div className="settings-section settings-personal-section">
          <div className="settings-section-title">
            <CalendarDays size={16} />
            Personal Information
          </div>
          <label>
            Birthday
            <input
              value={settings.birthDate}
              max={maxBirthDate}
              type="date"
              onChange={(event) => onSettingsChange({ ...settings, birthDate: event.target.value })}
            />
          </label>
        </div>

        {isNasSync && (
          <div className="settings-section settings-sync-connection-section">
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
        <div className="settings-section settings-sync-connection-section">
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

      <div className="settings-section settings-storage-section">
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

      <div className="settings-section tag-manager-section settings-tags-section">
        <div className="settings-section-title">
          <Tags size={16} />
          Tag Manager
          <button
            className="tag-manager-clear-button"
            type="button"
            disabled={!unusedActivityTagCount}
            title="Clear activity tags that are not used by any diary entry"
            onClick={clearUnusedActivityTags}
          >
            Clear Unused Activities
          </button>
          <button
            className="tag-manager-clear-button"
            type="button"
            disabled={!unusedPeopleTagCount}
            title="Clear people tags that are not used by any diary entry"
            onClick={clearUnusedPeopleTags}
          >
            Clear Unused People
          </button>
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
                        title={group.name}
                      />
                      <input
                        aria-label={`Activity group ${group.name}`}
                        value={activityTagManager.getColorNames(settings)[group.color] ?? group.name}
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
              <Users size={15} />
              People
            </div>
            {peopleColorGroups.length ? (
              peopleColorGroups.map((group) => {
                const isExpanded = group.color === expandedPeopleManagerColor

                return (
                  <div className="activity-manager-group" key={group.color}>
                    <div className="activity-manager-group-header">
                      <button
                        className="tag-manager-icon-button"
                        type="button"
                        title={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
                        onClick={() => setExpandedPeopleManagerColor(isExpanded ? null : group.color)}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span
                        className="tag-manager-swatch"
                        style={{ backgroundColor: group.color }}
                        title={group.name}
                      />
                      <input
                        aria-label={`People group ${group.name}`}
                        value={personTagManager.getColorNames(settings)[group.color] ?? group.name}
                        onChange={(event) => updatePeopleGroupName(group.color, event.target.value)}
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
                            onClick={() => setEditingPeopleTag(tag)}
                          />
                        ))}
                        <ActivityAddButton
                          title={`Add person to ${group.name}`}
                          onClick={() => setAddingPeopleColor(group.color)}
                        />
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="tag-manager-empty">No people</p>
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
                    title={location.name}
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
                        title={`Set ${location.name} color`}
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

      <div className="settings-section settings-weather-section">
        <div className="settings-section-title">
          <Leaf size={16} />
          Weather
        </div>
        <div className="settings-subsection">
          <div className="settings-subsection-title">
            <Leaf size={15} />
            Data Source
          </div>
          <p className="settings-section-note">
            Current-day AQI prefers WAQI/AQICN. Historical AQI in mainland China prefers Aliyun when AppCode is configured. Weather uses Open-Meteo.
          </p>
          <label>
            WAQI / AQICN API Token
            <input
              value={settings.aqicnToken}
              onChange={(event) => onSettingsChange({ ...settings, aqicnToken: event.target.value })}
              placeholder="api.waqi.info token"
              type="password"
              autoComplete="off"
            />
          </label>
          <label>
            Aliyun Air API AppCode
            <input
              value={settings.aliyunAirAppCode}
              onChange={(event) => onSettingsChange({ ...settings, aliyunAirAppCode: event.target.value })}
              placeholder="Aliyun Cloud Market AppCode"
              type="password"
              autoComplete="off"
            />
          </label>
          <label>
            Aliyun Air API AppKey
            <input
              value={settings.aliyunAirAppKey}
              onChange={(event) => onSettingsChange({ ...settings, aliyunAirAppKey: event.target.value })}
              placeholder="Optional AppKey"
              type="password"
              autoComplete="off"
            />
          </label>
          <label>
            Aliyun Air API AppSecret
            <input
              value={settings.aliyunAirAppSecret}
              onChange={(event) => onSettingsChange({ ...settings, aliyunAirAppSecret: event.target.value })}
              placeholder="Optional AppSecret"
              type="password"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="settings-subsection">
          <div className="settings-subsection-title">
            <Thermometer size={15} />
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
      {addingPeopleColor && (
        <ActivityAddDialog
          colorNames={settings.personColorGroupNames}
          initialColor={addingPeopleColor}
          itemLabel="Person"
          onAdd={addPeopleTag}
          onCancel={() => setAddingPeopleColor(null)}
        />
      )}
      {editingPeopleTag && (
        <ActivityEditDialog
          colorNames={settings.personColorGroupNames}
          initialColor={editingPeopleTag.color}
          initialName={editingPeopleTag.name}
          itemLabel="Person"
          onCancel={() => setEditingPeopleTag(null)}
          onDelete={() => deletePeopleTag(editingPeopleTag.name)}
          onSave={(name, color) => applyPeopleTag(editingPeopleTag.name, name, color)}
        />
      )}

      </div>
    </section>
  )
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
