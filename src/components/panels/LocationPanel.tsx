import { MapPin, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LOCATION_COLOR, LOCATION_COLOR_PALETTE } from '../../domain/constants'
import type { City, DiaryEntry } from '../../domain/types'
import { getTagBackgroundColor, getTagTextColor } from '../../utils/colors'
import { formatCityDisplayName, searchCitiesByName } from '../../utils/city'
import { getRecentCities } from '../../utils/entries'
import { getLocationNameKey, updateEntryLocations } from '../../utils/diaryEntryHelpers'

type LocationPanelProps = {
  draft: DiaryEntry
  entries: DiaryEntry[]
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onDraftChange: (draft: DiaryEntry) => void
  onEntriesChange: (entries: DiaryEntry[]) => void
  onStatusChange: (message: string) => void
}

export function LocationPanel({
  draft,
  entries,
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
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editingLocationName, setEditingLocationName] = useState('')
  const [editingLocationColor, setEditingLocationColor] = useState(DEFAULT_LOCATION_COLOR)
  const [pendingCity, setPendingCity] = useState<City | null>(null)
  const locationAddRef = useRef<HTMLDivElement>(null)
  const availableRecentCities = useMemo(
    () =>
      getRecentCities(entries)
        .filter((recentCity) => !draft.cities.some((draftCity) => draftCity.id === recentCity.city.id))
        .slice(0, 5),
    [draft.cities, entries],
  )

  useEffect(() => {
    if (!isLocationAddOpen)
      return

    function closeLocationAddOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node))
        return

      if (!locationAddRef.current || locationAddRef.current.contains(event.target))
        return

      setIsLocationAddOpen(false)
    }

    document.addEventListener('pointerdown', closeLocationAddOnOutsideClick)

    return () => document.removeEventListener('pointerdown', closeLocationAddOnOutsideClick)
  }, [isLocationAddOpen])

  function openOtherLocationDialog() {
    setIsLocationAddOpen(false)
    setIsOtherLocationDialogOpen(true)
    setCityQuery('')
    setCityResults([])
    setPendingCity(null)
    setCityStatus('')
    setSelectedLocationColor(DEFAULT_LOCATION_COLOR)
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

    onUpdateDraft({
      cities: [...draft.cities, city],
      locationColors: {
        ...draft.locationColors,
        [city.id]: color,
      },
      weatherSamples: [],
      dailyWeatherCode: null,
      dailyWeatherText: 'Not fetched',
      dailyPrecipitationMm: 0,
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

  function removeCity(cityId: string) {
    const nextLocationColors = { ...draft.locationColors }
    delete nextLocationColors[cityId]
    onUpdateDraft({
      cities: draft.cities.filter((city) => city.id !== cityId),
      locationColors: nextLocationColors,
      weatherSamples: [],
      dailyWeatherCode: null,
      dailyWeatherText: 'Not fetched',
      dailyPrecipitationMm: 0,
    })
    onStatusChange('Location changed. Fetch weather when ready.')
  }

  function openLocationEditor(city: City) {
    setEditingLocationId(city.id)
    setEditingLocationName(city.name)
    setEditingLocationColor(draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR)
  }

  function closeLocationEditor() {
    setEditingLocationId(null)
    setEditingLocationName('')
    setEditingLocationColor(DEFAULT_LOCATION_COLOR)
  }

  function confirmLocationEdit() {
    const editingCity = draft.cities.find((city) => city.id === editingLocationId)
    const nextName = editingLocationName.trim()

    if (!editingCity || !nextName)
      return

    const locationKey = getLocationNameKey(editingCity)
    const nextEntries = entries.map((entry) => updateEntryLocations(entry, locationKey, nextName, editingLocationColor))
    const nextDraft = updateEntryLocations(draft, locationKey, nextName, editingLocationColor)

    onEntriesChange(nextEntries)
    onDraftChange(nextDraft)
    closeLocationEditor()
    onStatusChange(`Updated location: ${nextName}`)
  }

  function deleteEditingLocation() {
    if (!editingLocationId)
      return

    removeCity(editingLocationId)
    closeLocationEditor()
  }

  return (
    <div className="compact-panel location-panel">
      <div className="compact-title">
        <MapPin size={16} />
        Location
      </div>
      <div className="current-location-block" ref={locationAddRef}>
        <div className="current-location-chips">
          {draft.cities.map((city) => (
            <button
              key={city.id}
              type="button"
              title={city.name}
              style={{
                backgroundColor: getTagBackgroundColor(draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR),
                borderColor: draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR,
                color: getTagTextColor(draft.locationColors[city.id] ?? DEFAULT_LOCATION_COLOR),
              }}
              onClick={() => openLocationEditor(city)}
            >
              {formatCityDisplayName(city)}
            </button>
          ))}
          <button
            className="location-add-toggle"
            type="button"
            title="Add location"
            onClick={() => setIsLocationAddOpen((isOpen) => !isOpen)}
          >
            <Plus size={15} />
          </button>
          {isLocationAddOpen && (
            <div className="location-recent-popover">
              {availableRecentCities.map((recentCity) => (
                <button
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
                  {formatCityDisplayName(recentCity.city)}
                </button>
              ))}
              <button className="location-other-option" type="button" onClick={openOtherLocationDialog}>
                Other
              </button>
            </div>
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
                onChange={(event) => setCityQuery(event.target.value)}
                placeholder="Search new city"
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    searchCities()
                }}
              />
              <button type="button" onClick={searchCities} title="Search city">
                <Search size={14} />
              </button>
            </div>
            <div className="city-results">
              {cityResults.map((city) => (
                <button
                  className={pendingCity?.id === city.id ? 'selected' : ''}
                  key={city.id}
                  type="button"
                  title={city.name}
                  onClick={() => setPendingCity(city)}
                >
                  {city.name}
                </button>
              ))}
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
            <input
              value={editingLocationName}
              onChange={(event) => setEditingLocationName(event.target.value)}
              placeholder="Location name"
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  confirmLocationEdit()
              }}
            />
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
