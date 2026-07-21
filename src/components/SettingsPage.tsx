import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  FileUp,
  GitBranch,
  HardDrive,
  Leaf,
  MapPin,
  Monitor,
  Network,
  PersonStanding,
  Pin,
  RotateCcw,
  Save,
  Tags,
  Search,
  Star,
  Thermometer,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { dispatchTagEvent, type NamedTagManager, type TagEvent } from '../application/tagEvents'
import { DEFAULT_CITY, LOCATION_COLOR_PALETTE } from '../domain/constants'
import {
  activityTagManager,
  locationTagManager,
  personTagManager,
  pointOfInterestTagManager,
  type ActivityTag,
  type DiaryTag,
  type LocationTag,
  type PersonTag,
  type PointOfInterestTag,
  type TagColorGroup,
} from '../domain/tagModels'
import type { AppSettings, City, DiaryCatalog, DiaryEntry } from '../domain/types'
import { getCityCatalogKey } from '../domain/metadata/locationMetadata'
import { toDateInputValue } from '../utils/date'
import { formatCityFullName, searchCitiesByName } from '../utils/city'
import { getTagBackgroundColor, getTagTextColor, resolveColorHex } from '../utils/colors'
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
  TagContextMenu,
} from './ActivityTagControls'

type SettingsPageProps = {
  variant: 'settings' | 'catalog'
  settings: AppSettings
  draft: DiaryEntry
  entries: DiaryEntry[]
  diaryCatalog: DiaryCatalog
  onSettingsChange: (settings: AppSettings) => void
  onDiaryCatalogChange: (catalog: DiaryCatalog) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
  onSave: () => void
  onPushCatalog: () => void
  onExportCatalog: () => void
  onImportCatalog: (file: File) => void
  onPullCatalog: () => void
  onCleanCatalog?: () => void
  onNavigateDate?: (date: string) => void
  onBack: () => void
}

type ActivityTagItem = ActivityTag
type PeopleTagItem = PersonTag
type PointOfInterestTagItem = PointOfInterestTag
type LocationTagItem = LocationTag
type CatalogManager = NamedTagManager

export function SettingsPage({
  variant,
  settings,
  draft,
  entries,
  diaryCatalog,
  onSettingsChange,
  onDiaryCatalogChange,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
  onSave,
  onPushCatalog,
  onExportCatalog,
  onImportCatalog,
  onPullCatalog,
  onCleanCatalog,
  onNavigateDate,
  onBack,
}: SettingsPageProps) {
  const isCatalogPage = variant === 'catalog'
  const isSettingsPage = variant === 'settings'
  const activeNasUrl = getActiveNasUrl(settings)
  const isNasSync = settings.syncProvider === 'nas'
  const isGitSync = settings.syncProvider === 'git'
  const maxBirthDate = toDateInputValue(new Date())
  const activityTags = useMemo(() => activityTagManager.collectFromCatalog(diaryCatalog.activities, settings), [diaryCatalog.activities, settings])
  const activityColorGroups = useMemo(() => activityTagManager.groupTags(activityTags, settings), [activityTags, settings])
  const peopleTags = useMemo(() => personTagManager.collectFromCatalog(diaryCatalog.people, settings), [diaryCatalog.people, settings])
  const peopleColorGroups = useMemo(() => personTagManager.groupTags(peopleTags, settings), [peopleTags, settings])
  const pointOfInterestTags = useMemo(
    () => pointOfInterestTagManager.collectFromCatalog(diaryCatalog.pointsOfInterest, settings),
    [diaryCatalog.pointsOfInterest, settings],
  )
  const pointOfInterestColorGroups = useMemo(
    () => pointOfInterestTagManager.groupTags(pointOfInterestTags, settings),
    [pointOfInterestTags, settings],
  )
  const locationTags = useMemo(() => locationTagManager.collectFromCatalog(diaryCatalog), [diaryCatalog])
  const locationColorGroups = useMemo(() => locationTagManager.groupTags(locationTags, settings), [locationTags, settings])
  const unusedActivityTagCount = activityTags.filter((tag) => tag.count === 0).length
  const unusedPeopleTagCount = peopleTags.filter((tag) => tag.count === 0).length
  const unusedPointOfInterestTagCount = pointOfInterestTags.filter((tag) => tag.count === 0).length
  const unusedLocationTagCount = locationTags.filter((tag) => tag.count === 0 && tag.key !== getCityCatalogKey(DEFAULT_CITY)).length
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
  const [addingPointOfInterestColor, setAddingPointOfInterestColor] = useState<string | null>(null)
  const [editingPointOfInterestTag, setEditingPointOfInterestTag] = useState<PointOfInterestTagItem | null>(null)
  const [expandedPointOfInterestManagerColor, setExpandedPointOfInterestManagerColor] = useState<string | null>(null)
  const [editingLocationTag, setEditingLocationTag] = useState<LocationTagItem | null>(null)
  const [expandedLocationManagerColor, setExpandedLocationManagerColor] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ items: import('./ActivityTagControls').ContextMenuItem[]; x: number; y: number } | null>(null)
  const catalogImportInputRef = useRef<HTMLInputElement>(null)

  function applyTagEvent(event: TagEvent) {
    const nextState = dispatchTagEvent({ settings, draft, entries, diaryCatalog }, event)

    if (nextState.settings !== settings)
      commitTagManagerSettings(nextState.settings)

    if (nextState.entries !== entries)
      onEntriesChange(nextState.entries)

    if (nextState.draft !== draft)
      onDraftChange(nextState.draft)

    if (nextState.diaryCatalog && nextState.diaryCatalog !== diaryCatalog)
      onDiaryCatalogChange(nextState.diaryCatalog)
  }

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

  function applyPointOfInterestTag(oldTag: string, nextName: string, color: string) {
    applyCatalogTag(pointOfInterestTagManager, oldTag, nextName, color, () => setEditingPointOfInterestTag(null))
  }

  function addPointOfInterestTag(rawTag: string, color: string) {
    addCatalogTag(pointOfInterestTagManager, rawTag, color, () => setAddingPointOfInterestColor(null))
  }

  function updatePointOfInterestGroupName(color: string, name: string) {
    updateCatalogGroupName(pointOfInterestTagManager, color, name)
  }

  function deletePeopleTag(tag: string) {
    deleteCatalogTag(personTagManager, tag, () => setEditingPeopleTag(null))
  }

  function deletePointOfInterestTag(tag: string) {
    deleteCatalogTag(pointOfInterestTagManager, tag, () => setEditingPointOfInterestTag(null))
  }

  function clearUnusedPeopleTags() {
    clearUnusedCatalogTags(personTagManager, editingPeopleTag, () => setEditingPeopleTag(null))
  }

  function clearUnusedPointOfInterestTags() {
    clearUnusedCatalogTags(pointOfInterestTagManager, editingPointOfInterestTag, () => setEditingPointOfInterestTag(null))
  }

  function deleteActivityTag(tag: string) {
    deleteCatalogTag(activityTagManager, tag, () => setEditingActivityTag(null))
  }

  function clearUnusedActivityTags() {
    clearUnusedCatalogTags(activityTagManager, editingActivityTag, () => setEditingActivityTag(null))
  }

  function clearUnusedLocationTags() {
    const defaultLocationKey = getCityCatalogKey(DEFAULT_CITY)
    const unusedLocationKeys = locationTags
      .filter((tag) => tag.count === 0 && tag.key !== defaultLocationKey)
      .map((tag) => tag.key)

    if (!unusedLocationKeys.length) {
      onStatusChange('No unused location tags.')
      return
    }

    const locations = { ...diaryCatalog.locations }

    for (const key of unusedLocationKeys)
      delete locations[key]

    onDiaryCatalogChange({
      ...diaryCatalog,
      updatedAt: new Date().toISOString(),
      locations,
    })

    if (editingLocationTag && unusedLocationKeys.includes(editingLocationTag.key))
      setEditingLocationTag(null)

    onStatusChange(`Cleared ${unusedLocationKeys.length} unused location ${unusedLocationKeys.length === 1 ? 'tag' : 'tags'}.`)
  }

  function updateActivityPin(tag: ActivityTagItem, pinned: boolean) {
    applyCatalogTagPin(activityTagManager, tag.name, pinned)
  }

  function updateLocationGroupName(color: string, name: string) {
    commitTagManagerSettings(locationTagManager.setColorGroupName(settings, color, name))
  }

  function updatePeoplePin(tag: PeopleTagItem, pinned: boolean) {
    applyCatalogTagPin(personTagManager, tag.name, pinned)
  }

  function updatePointOfInterestPin(tag: PointOfInterestTagItem, pinned: boolean) {
    applyCatalogTagPin(pointOfInterestTagManager, tag.name, pinned)
  }

  function updateLocationPin(tag: LocationTagItem, pinned: boolean) {
    applyTagEvent({
      type: 'location-tag-pin-updated',
      locationKey: tag.key,
      pinned,
    })
    onStatusChange(`${pinned ? 'Pinned' : 'Unpinned'} location: ${tag.name}`)
  }

  function applyLocationTag(location: LocationTagItem, nextCity: City, color: string) {
    const normalizedName = locationTagManager.normalizeName(nextCity.name)

    if (!normalizedName) {
      onStatusChange('Location name cannot be empty.')
      return
    }

    const duplicateLocation = locationTags.find((tag) => locationTagManager.normalizeName(tag.name) === normalizedName && tag.key !== location.key)
    const shouldMerge = Boolean(duplicateLocation)

    if (duplicateLocation && !window.confirm(`Location "${normalizedName}" already exists. Merge "${location.name}" into "${duplicateLocation.name}"?`)) {
      onStatusChange('Location name already exists. Choose another name or merge it.')
      return
    }

    applyTagEvent({
      type: 'location-city-updated',
      locationKey: location.key,
      nextCity,
      color,
      merge: shouldMerge,
    })
    setEditingLocationTag(null)
    onStatusChange(`Updated location: ${normalizedName}`)
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

    const duplicateTag = getManagerTags(manager).find((tag) => {
      return manager.normalizeName(tag.name) === nextTag && manager.normalizeName(tag.name) !== manager.normalizeName(oldTag)
    })

    if (duplicateTag && !window.confirm(`${manager.itemLabel} "${nextTag}" already exists. Merge "${oldTag}" into "${duplicateTag.name}"?`)) {
      onStatusChange(`${manager.itemLabel} name already exists. Choose another name or merge it.`)
      return
    }

    applyTagEvent({
      type: 'catalog-tag-updated',
      manager,
      oldTag,
      nextTag: duplicateTag?.name ?? nextTag,
      name: nextName,
      color,
    })
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

    if (getManagerTags(manager).some((tag) => tag.name === nextTag)) {
      onStatusChange(`${manager.itemLabel} already exists: ${nextTag}`)
      return
    }

    applyTagEvent({
      type: 'catalog-tag-added',
      manager,
      tagId: nextTag,
      name: rawTag,
      color,
    })
    closeDialog()
    onStatusChange(`Added ${manager.itemLabel.toLowerCase()}: ${nextTag}`)
  }

  function applyCatalogTagPin(manager: CatalogManager, tagId: string, pinned: boolean) {
    applyTagEvent({
      type: 'catalog-tag-pin-updated',
      manager,
      tagId,
      pinned,
    })
    onStatusChange(`${pinned ? 'Pinned' : 'Unpinned'} ${manager.itemLabel.toLowerCase()}: ${tagId}`)
  }

  function getMoveTargets(sourceManager: CatalogManager): CatalogManager[] {
    const all: CatalogManager[] = [activityTagManager, personTagManager, pointOfInterestTagManager]
    return all.filter((m) => m !== sourceManager)
  }

  function moveTag(sourceManager: CatalogManager, tagName: string, color: string, targetLabel: string) {
    const targetManager = getMoveTargets(sourceManager).find((m) => m.itemLabelPlural === targetLabel)
    if (!targetManager) return

    if (!window.confirm(`Move "${tagName}" from ${sourceManager.itemLabelPlural} to ${targetManager.itemLabelPlural}?`)) {
      return
    }

    applyTagEvent({
      type: 'catalog-tag-moved',
      sourceManager,
      targetManager,
      tagId: tagName,
      color,
    })
    onStatusChange(`Moved ${sourceManager.itemLabel.toLowerCase()} "${tagName}" to ${targetManager.itemLabelPlural}`)
  }

  function getCatalogSectionForManager(manager: CatalogManager): DiaryCatalog['activities'] {
    return manager.getCatalogSection(diaryCatalog)
  }

  function handleTagContextMenu(tag: { key: string; name: string; color: string }, manager: CatalogManager, event: React.MouseEvent) {
    event.preventDefault()
    const section = getCatalogSectionForManager(manager)
    const catalogEntry = section[tag.key]
    const dates = catalogEntry?.entries ?? []

    const items: import('./ActivityTagControls').ContextMenuItem[] = [
      { kind: 'references' as const, label: 'Show references', dates, onDateClick: (date) => onNavigateDate?.(date) },
      ...getMoveTargets(manager).map((target) => ({
        kind: 'action' as const,
        label: `Move to ${target.itemLabelPlural}`,
        onClick: () => moveTag(manager, tag.name, tag.color, target.itemLabelPlural),
      })),
    ]

    setContextMenu({ items, x: event.clientX, y: event.clientY })
  }

  function updateCatalogGroupName(manager: CatalogManager, color: string, name: string) {
    commitTagManagerSettings(manager.setColorGroupName(settings, color, name))
  }

  function deleteCatalogTag(manager: CatalogManager, tagId: string, clearEditingTag: () => void) {
    const usageCount = getManagerTags(manager).find((item) => item.key === tagId)?.count ?? 0

    if (usageCount > 0 && !window.confirm(`Delete ${manager.itemLabel.toLowerCase()} "${tagId}" from ${usageCount} ${usageCount === 1 ? 'entry' : 'entries'}?`))
      return

    applyTagEvent({
      type: 'catalog-tags-deleted',
      manager,
      tagIds: [tagId],
    })
    clearEditingTag()
    onStatusChange(`Deleted ${manager.itemLabel.toLowerCase()}.`)
  }

  function clearUnusedCatalogTags(
    manager: CatalogManager,
    editingTag: ActivityTagItem | PeopleTagItem | PointOfInterestTagItem | null,
    clearEditingTag: () => void,
  ) {
    const unusedTagIds = getManagerTags(manager).filter((tag) => tag.count === 0).map((tag) => tag.key)

    if (!unusedTagIds.length) {
      onStatusChange(`No unused ${manager.itemLabel.toLowerCase()} tags.`)
      return
    }

    applyTagEvent({
      type: 'catalog-tags-deleted',
      manager,
      tagIds: unusedTagIds,
    })

    if (editingTag && unusedTagIds.includes(editingTag.key))
      clearEditingTag()

    onStatusChange(`Cleared ${unusedTagIds.length} unused ${manager.itemLabel.toLowerCase()} ${unusedTagIds.length === 1 ? 'tag' : 'tags'}.`)
  }

  function getManagerTags(manager: CatalogManager): Array<ActivityTagItem | PeopleTagItem | PointOfInterestTagItem> {
    if (manager === activityTagManager)
      return activityTags

    if (manager === personTagManager)
      return peopleTags

    return pointOfInterestTags
  }

  function commitTagManagerSettings(nextSettings: AppSettings) {
    onSettingsChange(nextSettings)
    saveSettings(nextSettings)
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
          <h2>{isCatalogPage ? 'Catalog' : 'Settings'}</h2>
          <p>{isCatalogPage ? 'Tag catalog, colors, pins, and references.' : 'Local preferences, storage, and sync provider.'}</p>
        </div>
        <div className="settings-header-actions">
          <button type="button" className="settings-save-button" onClick={onSave}>
            <Save size={16} />
            {isCatalogPage ? 'Save' : 'Save Settings'}
          </button>
          {isCatalogPage && (
            <>
              <button type="button" className="settings-file-button" onClick={onPullCatalog}>
                <Download size={16} />
                Pull
              </button>
              <button type="button" className="settings-file-button" onClick={onPushCatalog}>
                <Upload size={16} />
                Push
              </button>
              <button type="button" className="settings-file-button" onClick={onExportCatalog}>
                <FileDown size={16} />
                Export
              </button>
              <button type="button" className="settings-file-button" onClick={() => catalogImportInputRef.current?.click()}>
                <FileUp size={16} />
                Import
              </button>
              {onCleanCatalog && (
                <button type="button" className="settings-file-button settings-clean-button" onClick={onCleanCatalog}>
                  <Trash2 size={16} />
                  Clean
                </button>
              )}
              <input
                ref={catalogImportInputRef}
                className="sidebar-file-input"
                type="file"
                accept=".json,application/json"
                aria-label="Import catalog JSON"
                onChange={(event) => {
                  const file = event.target.files?.[0]

                  if (file)
                    onImportCatalog(file)

                  event.target.value = ''
                }}
              />
            </>
          )}
        </div>
      </div>

      <div className="settings-body">
        <div className="settings-category settings-category-appearance" hidden={!isSettingsPage}>Appearance</div>
        <div className="settings-section settings-appearance-section" hidden={!isSettingsPage}>
          <div className="settings-section-title">
            <Monitor size={16} />
            Theme
          </div>
          <div className="settings-mode-control">
            <button
              className={settings.theme === 'light' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, theme: 'light' })}
            >
              Light
            </button>
            <button
              className={settings.theme === 'dark' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, theme: 'dark' })}
            >
              Dark
            </button>
            <button
              className={settings.theme === 'system' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, theme: 'system' })}
            >
              System
            </button>
          </div>
        </div>
        <div className="settings-category settings-category-personal" hidden={!isSettingsPage}>Personal Information</div>
        <div className="settings-category settings-category-sync" hidden={!isSettingsPage}>Network Sync</div>
        <div className="settings-category settings-category-tags" hidden={!isCatalogPage}>
          <Tags size={14} />
          Tag Manager
        </div>
        <div className="settings-category settings-category-weather" hidden={!isSettingsPage}>Weather</div>

        <div className="settings-section settings-sync-provider-section" hidden={!isSettingsPage}>
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

        <div className="settings-section settings-personal-section" hidden={!isSettingsPage}>
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
          <div className="settings-section settings-sync-connection-section" hidden={!isSettingsPage}>
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
        <div className="settings-section settings-sync-connection-section" hidden={!isSettingsPage}>
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

      <div className="settings-section settings-storage-section" hidden={!isSettingsPage}>
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

      <div className="settings-section settings-data-folder-section" hidden={!isSettingsPage}>
        <div className="settings-section-title">
          <Save size={16} />
          Local Data Folder
        </div>
        <p className="settings-section-note">All data is saved to this folder. Changing it moves existing data.</p>
        <label>
          Data Folder
          <input
            value={settings.dataFolder ?? ''}
            readOnly
            placeholder="Electron user data folder (default)"
          />
        </label>
        <button
          type="button"
          className="settings-file-button"
          onClick={async () => {
            const folder = await (await import('../utils/storage')).pickDataFolder()
            if (folder) onStatusChange(`Data folder changed to: ${folder}`)
          }}
        >
          Choose Folder...
        </button>
      </div>

      <div className="settings-section tag-manager-section settings-tags-section" hidden={!isCatalogPage}>
        <div className="tag-manager-grid">
          <TagManagerList
            addLabel="activity"
            colorNames={activityTagManager.getColorNames(settings)}
            emptyLabel="No activities"
            expandedColor={expandedActivityManagerColor}
            groups={activityColorGroups}
            icon={<PersonStanding size={15} />}
            title="Activities"
            unusedCount={unusedActivityTagCount}
            onAdd={(color) => setAddingActivityColor(color)}
            onClearUnused={clearUnusedActivityTags}
            onContextMenu={(tag, event) => handleTagContextMenu(tag, activityTagManager, event)}
            onExpandedColorChange={setExpandedActivityManagerColor}
            onGroupNameChange={updateActivityGroupName}
            onPinChange={updateActivityPin}
            onTagClick={setEditingActivityTag}
          />

          <TagManagerList
            addLabel="person"
            colorNames={personTagManager.getColorNames(settings)}
            emptyLabel="No people"
            expandedColor={expandedPeopleManagerColor}
            groups={peopleColorGroups}
            icon={<Users size={15} />}
            title="People"
            unusedCount={unusedPeopleTagCount}
            onAdd={(color) => setAddingPeopleColor(color)}
            onClearUnused={clearUnusedPeopleTags}
            onContextMenu={(tag, event) => handleTagContextMenu(tag, personTagManager, event)}
            onExpandedColorChange={setExpandedPeopleManagerColor}
            onGroupNameChange={updatePeopleGroupName}
            onPinChange={updatePeoplePin}
            onTagClick={setEditingPeopleTag}
          />

          <TagManagerList
            addLabel="point of interest"
            colorNames={pointOfInterestTagManager.getColorNames(settings)}
            emptyLabel="No points of interest"
            expandedColor={expandedPointOfInterestManagerColor}
            groups={pointOfInterestColorGroups}
            icon={<Star size={15} />}
            title="Points of Interest"
            unusedCount={unusedPointOfInterestTagCount}
            onAdd={(color) => setAddingPointOfInterestColor(color)}
            onClearUnused={clearUnusedPointOfInterestTags}
            onContextMenu={(tag, event) => handleTagContextMenu(tag, pointOfInterestTagManager, event)}
            onExpandedColorChange={setExpandedPointOfInterestManagerColor}
            onGroupNameChange={updatePointOfInterestGroupName}
            onPinChange={updatePointOfInterestPin}
            onTagClick={setEditingPointOfInterestTag}
          />

          <TagManagerList
            colorNames={locationTagManager.getColorNames(settings)}
            emptyLabel="No locations"
            expandedColor={expandedLocationManagerColor}
            groups={locationColorGroups}
            icon={<MapPin size={15} />}
            title="Locations"
            unusedCount={unusedLocationTagCount}
            onClearUnused={clearUnusedLocationTags}
            onExpandedColorChange={setExpandedLocationManagerColor}
            onGroupNameChange={updateLocationGroupName}
            onPinChange={updateLocationPin}
            onTagClick={setEditingLocationTag}
          />
        </div>
      </div>

      <div className="settings-section settings-weather-section" hidden={!isSettingsPage}>
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
                  style={{ backgroundColor: resolveColorHex(band.color) ?? band.color }}
                  title={`Temperature color ${band.color}`}
                />
                <span className="tag-manager-name">{band.label}</span>
                <span
                  className="temperature-settings-preview"
                  style={{ backgroundColor: `${resolveColorHex(band.color) ?? band.color}1f`, borderColor: resolveColorHex(band.color) ?? band.color }}
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

      {isCatalogPage && addingActivityColor && (
        <ActivityAddDialog
          colorNames={settings.activityColorGroupNames}
          initialColor={addingActivityColor}
          onAdd={addActivityTag}
          onCancel={() => setAddingActivityColor(null)}
        />
      )}
      {isCatalogPage && editingActivityTag && (
        <ActivityEditDialog
          colorNames={settings.activityColorGroupNames}
          initialColor={editingActivityTag.color}
          initialName={editingActivityTag.name}
          onCancel={() => setEditingActivityTag(null)}
          onDelete={() => deleteActivityTag(editingActivityTag.key)}
          onSave={(name, color) => applyActivityTag(editingActivityTag.name, name, color)}
        />
      )}
      {isCatalogPage && addingPeopleColor && (
        <ActivityAddDialog
          colorNames={settings.personColorGroupNames}
          initialColor={addingPeopleColor}
          itemLabel="Person"
          onAdd={addPeopleTag}
          onCancel={() => setAddingPeopleColor(null)}
        />
      )}
      {isCatalogPage && editingPeopleTag && (
        <ActivityEditDialog
          colorNames={settings.personColorGroupNames}
          initialColor={editingPeopleTag.color}
          initialName={editingPeopleTag.name}
          itemLabel="Person"
          onCancel={() => setEditingPeopleTag(null)}
          onDelete={() => deletePeopleTag(editingPeopleTag.key)}
          onSave={(name, color) => applyPeopleTag(editingPeopleTag.name, name, color)}
        />
      )}
      {isCatalogPage && addingPointOfInterestColor && (
        <ActivityAddDialog
          colorNames={settings.pointOfInterestColorGroupNames}
          initialColor={addingPointOfInterestColor}
          itemLabel="Point of Interest"
          onAdd={addPointOfInterestTag}
          onCancel={() => setAddingPointOfInterestColor(null)}
        />
      )}
      {isCatalogPage && editingPointOfInterestTag && (
        <ActivityEditDialog
          colorNames={settings.pointOfInterestColorGroupNames}
          initialColor={editingPointOfInterestTag.color}
          initialName={editingPointOfInterestTag.name}
          itemLabel="Point of Interest"
          onCancel={() => setEditingPointOfInterestTag(null)}
          onDelete={() => deletePointOfInterestTag(editingPointOfInterestTag.key)}
          onSave={(name, color) => applyPointOfInterestTag(editingPointOfInterestTag.name, name, color)}
        />
      )}
      {isCatalogPage && editingLocationTag && (
        <LocationSelectorDialog
          colorNames={settings.locationColorGroupNames}
          initialCity={diaryCatalog.locations[editingLocationTag.key]?.city}
          initialColor={editingLocationTag.color}
          initialName={editingLocationTag.name}
          onCancel={() => setEditingLocationTag(null)}
          onSave={(city, color) => applyLocationTag(editingLocationTag, city, color)}
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
    </section>
  )
}

type LocationSelectorDialogProps = {
  colorNames: Record<string, string>
  initialCity?: City
  initialColor: string
  initialName: string
  onCancel: () => void
  onSave: (city: City, color: string) => void
}

function LocationSelectorDialog({
  colorNames,
  initialCity,
  initialColor,
  initialName,
  onCancel,
  onSave,
}: LocationSelectorDialogProps) {
  const [cityQuery, setCityQuery] = useState(initialCity ? formatCityFullName(initialCity) : initialName)
  const [cityResults, setCityResults] = useState<City[]>([])
  const [cityStatus, setCityStatus] = useState('')
  const [selectedCity, setSelectedCity] = useState<City | null>(initialCity ?? null)
  const [color, setColor] = useState(initialColor)

  async function searchCities() {
    const query = cityQuery.trim()

    if (!query) {
      setCityStatus('Type a city name first.')
      return
    }

    setCityStatus('Searching...')

    try {
      const results = await searchCitiesByName(query)
      setCityResults(results)
      setSelectedCity(results.length === 1 ? results[0] : null)
      setCityStatus(results.length ? '' : 'No cities found')
    } catch {
      setCityStatus('City search failed. Check your network and try again.')
    }
  }

  function confirm() {
    if (!selectedCity) {
      setCityStatus('Choose a location first.')
      return
    }

    onSave(selectedCity, color)
  }

  function chooseCity(city: City) {
    setSelectedCity(city)
    setCityQuery(formatCityFullName(city))
    setCityResults([])
    setCityStatus('')
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="location-dialog" role="dialog" aria-modal="true" aria-label="Edit location">
        <div className="compact-title">Edit Location</div>
        <div className="location-color-palette" aria-label="Location color">
          {LOCATION_COLOR_PALETTE.map((paletteColor) => (
            <button
              className={color === paletteColor ? 'tag-color-swatch selected' : 'tag-color-swatch'}
              key={paletteColor}
              type="button"
              style={{ backgroundColor: paletteColor }}
              title={colorNames[paletteColor] || paletteColor}
              onClick={() => setColor(paletteColor)}
            />
          ))}
        </div>
        <div className="new-location-search">
          <input
            value={cityQuery}
            onChange={(event) => {
              setCityQuery(event.target.value)
              setSelectedCity(null)
            }}
            placeholder="Search location"
            onKeyDown={(event) => {
              if (event.key === 'Enter')
                void searchCities()
            }}
          />
          <button type="button" onClick={() => void searchCities()} title="Search city">
            <Search size={14} />
          </button>
          {!!cityResults.length && (
            <div className="city-results">
              {cityResults.map((city) => (
                <button
                  className={selectedCity?.id === city.id ? 'selected' : ''}
                  key={city.id}
                  type="button"
                  title={formatCityFullName(city)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCity(city)}
                >
                  {formatCityFullName(city)}
                </button>
              ))}
            </div>
          )}
        </div>
        {cityStatus && <p className="helper">{cityStatus}</p>}
        <div className="dialog-actions">
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

type TagManagerListProps<TTag extends DiaryTag> = {
  addLabel?: string
  colorNames: Record<string, string>
  emptyLabel: string
  expandedColor: string | null
  groups: TagColorGroup<TTag>[]
  icon: ReactNode
  title: string
  unusedCount?: number
  onAdd?: (color: string) => void
  onClearUnused?: () => void
  onContextMenu?: (tag: TTag, event: React.MouseEvent) => void
  onExpandedColorChange: (color: string | null) => void
  onGroupNameChange: (color: string, name: string) => void
  onPinChange: (tag: TTag, pinned: boolean) => void
  onTagClick: (tag: TTag) => void
}

function TagManagerList<TTag extends DiaryTag>({
  addLabel,
  colorNames,
  emptyLabel,
  expandedColor,
  groups,
  icon,
  title,
  unusedCount = 0,
  onAdd,
  onClearUnused,
  onContextMenu,
  onExpandedColorChange,
  onGroupNameChange,
  onPinChange,
  onTagClick,
}: TagManagerListProps<TTag>) {
  const expandedGroup = groups.find((group) => group.color === expandedColor) ?? null

  return (
    <div className="tag-manager-list">
      <div className="tag-manager-list-title">
        <span className="tag-manager-list-title-label">
          {icon}
          {title}
        </span>
        {onClearUnused && (
          <button
            className="tag-manager-clear-icon-button"
            type="button"
            disabled={!unusedCount}
            title={unusedCount ? `Clear ${unusedCount} unused ${title.toLowerCase()}` : `No unused ${title.toLowerCase()}`}
            onClick={onClearUnused}
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      {groups.length ? (
        <>
          <div className="tag-manager-color-row">
            {groups.map((group) => {
              const isExpanded = group.color === expandedColor

              return (
                <div className={isExpanded ? 'activity-manager-group expanded' : 'activity-manager-group'} key={group.color}>
                  <div className="activity-manager-group-header">
                    <button
                      className="tag-manager-icon-button"
                      type="button"
                      title={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
                      onClick={() => onExpandedColorChange(isExpanded ? null : group.color)}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span
                      className="tag-manager-swatch"
                      style={{ backgroundColor: resolveColorHex(group.color) ?? group.color }}
                      title={group.name}
                    />
                    <input
                      aria-label={`${title} group ${group.name}`}
                      value={colorNames[group.color] ?? group.name}
                      onChange={(event) => onGroupNameChange(group.color, event.target.value)}
                    />
                    <span className="tag-manager-count">{group.tags.length}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {expandedGroup && (
            <div className="activity-manager-chip-list">
              {expandedGroup.tags.map((tag) => (
                <span className={tag.pinned ? 'tag-manager-chip-item pinned' : 'tag-manager-chip-item'} key={tag.key}>
                  <ActivityChipButton
                    count={tag.count}
                    color={tag.color}
                    name={tag.name}
                    pinned={tag.pinned}
                    onClick={() => onTagClick(tag)}
                    onContextMenu={onContextMenu ? (e) => onContextMenu(tag, e) : undefined}
                  />
                  <button
                    className={tag.pinned ? 'tag-pin-button pinned' : 'tag-pin-button'}
                    type="button"
                    style={tag.pinned
                      ? {
                          backgroundColor: getTagBackgroundColor(tag.color),
                          borderColor: resolveColorHex(tag.color) ?? tag.color,
                          color: getTagTextColor(tag.color),
                        }
                      : undefined}
                    title={tag.pinned ? `Unpin ${tag.name}` : `Pin ${tag.name}`}
                    onClick={() => onPinChange(tag, !tag.pinned)}
                  >
                    <Pin size={12} />
                  </button>
                </span>
              ))}
              {onAdd && (
                <ActivityAddButton
                  title={`Add ${addLabel ?? title.toLowerCase()} to ${expandedGroup.name}`}
                  onClick={() => onAdd(expandedGroup.color)}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="tag-manager-empty">{emptyLabel}</p>
      )}
    </div>
  )
}

