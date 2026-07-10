import { ChevronRight, MapPin, Pin, Plus, Search, X } from 'lucide-react'
import { type DragEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dispatchTagEvent, type TagEvent } from '../../application/tagEvents'
import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR, LOCATION_COLOR_PALETTE } from '../../domain/constants'
import { locationTagManager } from '../../domain/tagModels'
import type { AppSettings, City, DiaryCatalog, DiaryEntry, RecentCity } from '../../domain/types'
import { getTagBackgroundColor, getTagTextColor } from '../../utils/colors'
import { formatCityDisplayName, formatCityFullName, searchCitiesByName } from '../../utils/city'
import { getLocationNameKey } from '../../utils/diaryEntryHelpers'
import { reorderByKey } from '../../utils/reorder'
import { ActivityAddButton } from '../ActivityTagControls'

type LocationPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  diaryCatalog: DiaryCatalog
  settings: AppSettings
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

type LocationPopoverPosition = {
  top: number
  left: number
}

const LOCATION_POPOVER_MAX_WIDTH = 240
const LOCATION_POPOVER_EDGE_GAP = 12
const LOCATION_POPOVER_OFFSET_Y = 6

export function LocationPanel({
  draft,
  entries,
  diaryCatalog,
  settings,
  onUpdateDraft,
  onDraftChange,
  onEntriesChange,
  onStatusChange,
}: LocationPanelProps) {
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState<City[]>([])
  const [cityStatus, setCityStatus] = useState('')
  const [isLocationAddOpen, setIsLocationAddOpen] = useState(false)
  const [isOtherLocationDialogOpen, setIsOtherLocationDialogOpen] = useState(false)
  const [selectedLocationColor, setSelectedLocationColor] = useState(DEFAULT_LOCATION_COLOR)
  const [expandedLocationColor, setExpandedLocationColor] = useState(DEFAULT_LOCATION_COLOR)
  const [locationPopoverPosition, setLocationPopoverPosition] = useState<LocationPopoverPosition | null>(null)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editingLocationColor, setEditingLocationColor] = useState(DEFAULT_LOCATION_COLOR)
  const [pendingCity, setPendingCity] = useState<City | null>(null)
  const [draggingLocationId, setDraggingLocationId] = useState<string | null>(null)
  const locationAddRef = useRef<HTMLSpanElement>(null)
  const locationPopoverRef = useRef<HTMLDivElement>(null)
  const availableRecentCities = useMemo(
    () =>
      Object.values(diaryCatalog.locations)
        .map((location): RecentCity => ({
          city: location.city,
          color: location.color || DEFAULT_LOCATION_COLOR,
          pinned: location.pinned === true,
        }))
        .filter((recentCity) => !draft.cities.some((draftCity) => draftCity.id === recentCity.city.id))
        .sort(compareRecentCities),
    [diaryCatalog.locations, draft.cities],
  )
  const locationColorGroups = useMemo(() => {
    const groups = new Map<string, typeof availableRecentCities>()

    for (const recentCity of availableRecentCities) {
      const color = recentCity.color || DEFAULT_LOCATION_COLOR
      groups.set(color, [...(groups.get(color) ?? []), recentCity])
    }

    const customColors = Array.from(groups.keys()).filter((color) => !LOCATION_COLOR_PALETTE.includes(color))

    return [...LOCATION_COLOR_PALETTE, ...customColors]
      .map((color) => ({ color, cities: groups.get(color) ?? [] }))
  }, [availableRecentCities])
  const visibleExpandedLocationColor = locationColorGroups.some((group) => group.color === expandedLocationColor)
    ? expandedLocationColor
    : locationColorGroups[0]?.color ?? DEFAULT_LOCATION_COLOR
  const catalogLocationTags = useMemo(
    () => locationTagManager.collectFromCatalog(diaryCatalog),
    [diaryCatalog],
  )

  useEffect(() => {
    if (!isLocationAddOpen)
      return

    function closeLocationAddOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node))
        return

      if (locationAddRef.current?.contains(event.target) || locationPopoverRef.current?.contains(event.target))
        return

      setIsLocationAddOpen(false)
    }

    document.addEventListener('pointerdown', closeLocationAddOnOutsideClick)

    return () => document.removeEventListener('pointerdown', closeLocationAddOnOutsideClick)
  }, [isLocationAddOpen])

  useLayoutEffect(() => {
    if (!isLocationAddOpen)
      return

    function updateLocationPopoverPosition() {
      const locationAdd = locationAddRef.current

      if (!locationAdd)
        return

      const rect = locationAdd.getBoundingClientRect()
      const maxLeft = window.innerWidth - LOCATION_POPOVER_MAX_WIDTH - LOCATION_POPOVER_EDGE_GAP
      const left = Math.max(LOCATION_POPOVER_EDGE_GAP, Math.min(rect.left, maxLeft))
      const top = Math.max(LOCATION_POPOVER_EDGE_GAP, rect.bottom + LOCATION_POPOVER_OFFSET_Y)

      setLocationPopoverPosition({ top, left })
    }

    updateLocationPopoverPosition()
    window.addEventListener('resize', updateLocationPopoverPosition)
    window.addEventListener('scroll', updateLocationPopoverPosition, true)

    return () => {
      window.removeEventListener('resize', updateLocationPopoverPosition)
      window.removeEventListener('scroll', updateLocationPopoverPosition, true)
    }
  }, [isLocationAddOpen])

  function applyTagEvent(event: TagEvent) {
    const nextState = dispatchTagEvent({ settings, draft, entries }, event)

    if (nextState.entries !== entries)
      onEntriesChange(nextState.entries)

    if (nextState.draft !== draft)
      onDraftChange(nextState.draft)
  }

  function openOtherLocationDialog(color = DEFAULT_LOCATION_COLOR) {
    setIsLocationAddOpen(false)
    setIsOtherLocationDialogOpen(true)
    setCityQuery('')
    setCityResults([])
    setPendingCity(null)
    setCityStatus('')
    setSelectedLocationColor(color)
  }

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

      if (results.length === 1)
        setPendingCity(results[0])

      setCityStatus(results.length ? '' : 'No cities found')
    } catch {
      setCityStatus('City search failed. Check your network and try again.')
    }
  }

  function addCity(city: City, color = selectedLocationColor) {
    if (draft.cities.some((item) => item.id === city.id))
      return

    applyTagEvent({
      type: 'entry-location-added',
      city,
      color,
    })
    setCityQuery('')
    setCityResults([])
    setIsLocationAddOpen(false)
    setIsOtherLocationDialogOpen(false)
    setPendingCity(null)
    onStatusChange('Location changed. Fetch weather when ready.')
  }

  function confirmOtherLocation() {
    if (!pendingCity) {
      setCityStatus('Choose a location first.')
      return
    }

    addCity(pendingCity, selectedLocationColor)
  }

  function choosePendingCity(city: City) {
    setPendingCity(city)
    setCityQuery(formatCityFullName(city))
    setCityResults([])
    setCityStatus('')
  }

  function removeCity(cityId: string) {
    applyTagEvent({
      type: 'entry-location-deleted',
      cityId,
    })
    onStatusChange('Location changed. Fetch weather when ready.')
  }

  function clearLocations() {
    if (draft.cities.length === 1 && draft.cities[0].id === DEFAULT_CITY.id)
      return

    onUpdateDraft({
      cities: [DEFAULT_CITY],
      locationColors: { [DEFAULT_CITY.id]: DEFAULT_LOCATION_COLOR },
      weatherSamples: [],
      dailyWeatherCode: null,
      dailyWeatherText: 'Not fetched',
      dailyPrecipitationMm: 0,
    })
    onStatusChange('Cleared locations.')
  }

  function openLocationEditor(city: City) {
    setEditingLocationId(city.id)
    setEditingLocationColor(draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR)
    setCityQuery(city.name)
    setCityResults([])
    setPendingCity(city)
    setCityStatus('')
  }

  function closeLocationEditor() {
    setEditingLocationId(null)
    setEditingLocationColor(DEFAULT_LOCATION_COLOR)
    setCityQuery('')
    setCityResults([])
    setPendingCity(null)
    setCityStatus('')
  }

  function confirmLocationEdit() {
    const editingCity = draft.cities.find((city) => city.id === editingLocationId)

    if (!editingCity)
      return

    if (!pendingCity) {
      setCityStatus('Choose a location first.')
      return
    }

    const locationKey = getLocationNameKey(editingCity)
    const nextLocationKey = getLocationNameKey(pendingCity)
    const duplicateLocation = catalogLocationTags.find((tag) => tag.key === nextLocationKey && tag.key !== locationKey)
    const shouldMerge = Boolean(duplicateLocation)

    if (duplicateLocation && !window.confirm(`Location "${pendingCity.name}" already exists. Merge "${editingCity.name}" into "${duplicateLocation.name}"?`)) {
      onStatusChange('Location name already exists. Choose another name or merge it.')
      return
    }

    applyTagEvent({
      type: 'location-city-updated',
      locationKey,
      nextCity: pendingCity,
      color: editingLocationColor,
      merge: shouldMerge,
    })
    closeLocationEditor()
    onStatusChange(`Updated location: ${pendingCity.name}`)
  }

  function deleteEditingLocation() {
    if (!editingLocationId)
      return

    removeCity(editingLocationId)
    closeLocationEditor()
  }

  function beginLocationDrag(event: DragEvent<HTMLButtonElement>, cityId: string) {
    setDraggingLocationId(cityId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', cityId)
  }

  function allowLocationDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function dropLocation(event: DragEvent<HTMLButtonElement>, targetCityId: string) {
    event.preventDefault()
    const draggedCityId = draggingLocationId ?? event.dataTransfer.getData('text/plain')

    if (!draggedCityId || draggedCityId === targetCityId) {
      setDraggingLocationId(null)
      return
    }

    const nextCities = reorderByKey(draft.cities, draggedCityId, targetCityId, (city) => city.id)

    if (nextCities === draft.cities) {
      setDraggingLocationId(null)
      return
    }

    onUpdateDraft({ cities: nextCities })
    setDraggingLocationId(null)
    onStatusChange('Location order updated.')
  }

  return (
    <div className="compact-panel location-panel">
      <div className="compact-title">
        <MapPin size={16} />
        Location
        <span className="tag-panel-title-actions" ref={locationAddRef}>
          <button
            className="tag-panel-title-icon-button"
            type="button"
            title="Add location"
            onClick={() => setIsLocationAddOpen((isOpen) => !isOpen)}
          >
            <Plus size={13} />
          </button>
          <button
            className="tag-panel-title-icon-button"
            type="button"
            disabled={draft.cities.length === 1 && draft.cities[0].id === DEFAULT_CITY.id}
            title="Clear locations from this entry"
            onClick={clearLocations}
          >
            <X size={13} />
          </button>
        </span>
      </div>
      <div className="current-location-block">
        <div className="current-location-chips">
          {draft.cities.map((city) => (
            <button
              className={draggingLocationId === city.id ? 'location-chip dragging' : 'location-chip'}
              draggable={draft.cities.length > 1}
              key={city.id}
              type="button"
              title={city.name}
              style={{
                backgroundColor: getTagBackgroundColor(draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR),
                borderColor: draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR,
                color: getTagTextColor(draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR),
              }}
              onDragEnd={() => setDraggingLocationId(null)}
              onDragOver={allowLocationDrop}
              onDragStart={(event) => beginLocationDrag(event, city.id)}
              onDrop={(event) => dropLocation(event, city.id)}
              onClick={() => openLocationEditor(city)}
            >
              {formatCityDisplayName(city)}
            </button>
          ))}
          {isLocationAddOpen && createPortal(
            <div
              className="activity-recent-popover activity-recent-popover-floating"
              ref={locationPopoverRef}
              style={locationPopoverPosition ?? undefined}
            >
              {locationColorGroups.map((group) => {
                const isExpanded = group.color === visibleExpandedLocationColor
                const groupName = locationTagManager.getColorGroupName(settings, group.color)

                return (
                  <div
                    className="activity-color-group"
                    key={group.color}
                    onMouseEnter={() => setExpandedLocationColor(group.color)}
                  >
                    <button
                      className="activity-color-toggle"
                      type="button"
                      title={groupName}
                      onClick={() => setExpandedLocationColor(group.color)}
                    >
                      <span className="activity-color-toggle-main">
                        <span className="activity-color-dot" style={{ backgroundColor: group.color }} />
                        <span>{groupName}</span>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                    {isExpanded && (
                      <div className="activity-color-options">
                        {group.cities.map((recentCity) => (
                          <button
                            className="location-option-button"
                            key={recentCity.city.id}
                            type="button"
                            title={recentCity.city.name}
                            style={{
                              backgroundColor: getTagBackgroundColor(recentCity.color),
                              borderColor: recentCity.color,
                              color: getTagTextColor(recentCity.color),
                            }}
                            onClick={() => addCity(recentCity.city, recentCity.color)}
                          >
                            {recentCity.pinned && <Pin className="activity-chip-pin" size={11} />}
                            {formatCityDisplayName(recentCity.city)}
                          </button>
                        ))}
                        <ActivityAddButton
                          title={`Search location in ${groupName}`}
                          onClick={() => openOtherLocationDialog(group.color)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              <button className="activity-other-option" type="button" onClick={() => openOtherLocationDialog(DEFAULT_LOCATION_COLOR)}>
                Other
              </button>
            </div>,
            document.body,
          )}
        </div>
      </div>

      {isOtherLocationDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div className="location-dialog" role="dialog" aria-modal="true" aria-label="Add location">
            <div className="compact-title">Add Location</div>
            <div className="location-color-palette" aria-label="Location color">
              {LOCATION_COLOR_PALETTE.map((color) => (
                <button
                  className={selectedLocationColor === color ? 'tag-color-swatch selected' : 'tag-color-swatch'}
                  key={color}
                  type="button"
                  style={{ backgroundColor: color }}
                  title={`Location color ${color}`}
                  onClick={() => setSelectedLocationColor(color)}
                />
              ))}
            </div>
            <div className="new-location-search">
              <input
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value)
                  setPendingCity(null)
                }}
                placeholder="Search new city"
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
                      className={pendingCity?.id === city.id ? 'selected' : ''}
                      key={city.id}
                      type="button"
                      title={formatCityFullName(city)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choosePendingCity(city)}
                    >
                      {formatCityFullName(city)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setIsOtherLocationDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={confirmOtherLocation}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {editingLocationId && (
        <div className="dialog-backdrop" role="presentation">
          <div className="location-dialog" role="dialog" aria-modal="true" aria-label="Edit location">
            <div className="compact-title">Edit Location</div>
            <div className="location-color-palette" aria-label="Location color">
              {LOCATION_COLOR_PALETTE.map((color) => (
                <button
                  className={editingLocationColor === color ? 'tag-color-swatch selected' : 'tag-color-swatch'}
                  key={color}
                  type="button"
                  style={{ backgroundColor: color }}
                  title={`Location color ${color}`}
                  onClick={() => setEditingLocationColor(color)}
                />
              ))}
            </div>
            <div className="new-location-search">
              <input
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value)
                  setPendingCity(null)
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
                      className={pendingCity?.id === city.id ? 'selected' : ''}
                      key={city.id}
                      type="button"
                      title={formatCityFullName(city)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choosePendingCity(city)}
                    >
                      {formatCityFullName(city)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="dialog-actions">
              <button className="danger-button" type="button" onClick={deleteEditingLocation}>
                Delete
              </button>
              <button type="button" onClick={closeLocationEditor}>
                Cancel
              </button>
              <button type="button" onClick={confirmLocationEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {cityStatus && <p className="helper">{cityStatus}</p>}
    </div>
  )
}

function compareRecentCities(a: RecentCity, b: RecentCity): number {
  if (a.pinned !== b.pinned)
    return a.pinned ? -1 : 1

  return a.city.name.localeCompare(b.city.name)
}
