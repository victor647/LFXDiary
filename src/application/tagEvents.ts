import type { ActivityTag, CatalogDiaryTagManager, PersonTag } from '../domain/tagModels'
import { updateDiaryCatalogLocationCity, updateDiaryCatalogLocationPin } from '../domain/diaryCatalog'
import type { AppSettings, City, DiaryCatalog, DiaryEntry } from '../domain/types'
import {
  mergeEntryLocationCity,
  mergeEntryLocations,
  updateEntryLocationCity,
  updateEntryLocations,
} from '../utils/diaryEntryHelpers'

export type CatalogTagManager = CatalogDiaryTagManager<ActivityTag | PersonTag>

export type TagEventState = {
  settings: AppSettings
  draft: DiaryEntry
  entries: DiaryEntry[]
  diaryCatalog?: DiaryCatalog
}

export type TagEvent =
  | {
    type: 'catalog-tag-added'
    manager: CatalogTagManager
    tag: string
    color: string
  }
  | {
    type: 'catalog-tag-updated'
    manager: CatalogTagManager
    oldTag: string
    nextTag: string
    color: string
  }
  | {
    type: 'catalog-tags-deleted'
    manager: CatalogTagManager
    tags: string[]
  }
  | {
    type: 'catalog-tag-pin-updated'
    manager: CatalogTagManager
    tag: string
    pinned: boolean
  }
  | {
    type: 'entry-tag-added'
    manager: CatalogTagManager
    tag: string
    color: string
  }
  | {
    type: 'entry-tags-deleted'
    manager: CatalogTagManager
    tags: string[]
  }
  | {
    type: 'location-tag-updated'
    locationKey: string
    nextName: string
    color: string
    merge: boolean
  }
  | {
    type: 'location-city-updated'
    locationKey: string
    nextCity: City
    color: string
    merge: boolean
  }
  | {
    type: 'location-tag-pin-updated'
    locationKey: string
    pinned: boolean
  }
  | {
    type: 'entry-location-added'
    city: City
    color: string
  }
  | {
    type: 'entry-location-deleted'
    cityId: string
  }

type TagEventListener = (event: TagEvent, state: TagEventState) => TagEventState

const tagEventListeners: TagEventListener[] = [
  catalogTagObserver,
  catalogEntryReferenceObserver,
  currentEntryTagObserver,
  locationTagObserver,
]

export function dispatchTagEvent(state: TagEventState, event: TagEvent): TagEventState {
  return tagEventListeners.reduce((nextState, listener) => listener(event, nextState), state)
}

function catalogTagObserver(event: TagEvent, state: TagEventState): TagEventState {
  if (event.type === 'catalog-tag-added' || event.type === 'entry-tag-added') {
    return {
      ...state,
      settings: event.manager.setCatalog(state.settings, {
        ...event.manager.getCatalog(state.settings),
        [event.tag]: { color: event.color },
      }),
    }
  }

  if (event.type === 'catalog-tag-updated') {
    return {
      ...state,
      settings: event.manager.setCatalog(
        state.settings,
        event.manager.updateCatalog(event.manager.getCatalog(state.settings), event.oldTag, event.nextTag, event.color),
      ),
    }
  }

  if (event.type === 'catalog-tags-deleted') {
    return {
      ...state,
      settings: event.manager.setCatalog(
        state.settings,
        event.manager.deleteCatalogTags(event.manager.getCatalog(state.settings), event.tags),
      ),
    }
  }

  if (event.type === 'catalog-tag-pin-updated') {
    return {
      ...state,
      settings: event.manager.setCatalog(
        state.settings,
        event.manager.updateCatalogPin(event.manager.getCatalog(state.settings), event.tag, event.pinned),
      ),
    }
  }

  return state
}

function catalogEntryReferenceObserver(event: TagEvent, state: TagEventState): TagEventState {
  if (event.type === 'catalog-tag-updated') {
    if (event.manager.normalizeName(event.oldTag) === event.manager.normalizeName(event.nextTag))
      return state

    return updateEntriesAndDraft(state, (entry) => {
      return event.manager.updateEntryTag(entry, event.oldTag, event.nextTag, event.color)
    })
  }

  if (event.type === 'catalog-tags-deleted') {
    return updateEntriesAndDraft(state, (entry) => {
      return event.tags.reduce((nextEntry, tag) => event.manager.deleteEntryTag(nextEntry, tag), entry)
    })
  }

  return state
}

function currentEntryTagObserver(event: TagEvent, state: TagEventState): TagEventState {
  if (event.type === 'entry-tag-added') {
    const patch = event.manager.addToEntry(state.draft, event.tag, event.color)

    if (!patch)
      return state

    return {
      ...state,
      draft: markEntryEdited({
        ...state.draft,
        ...patch,
      }),
    }
  }

  if (event.type === 'entry-tags-deleted') {
    const nextDraft = event.tags.reduce((entry, tag) => event.manager.deleteEntryTag(entry, tag), state.draft)

    if (nextDraft === state.draft)
      return state

    return {
      ...state,
      draft: nextDraft,
    }
  }

  return state
}

function locationTagObserver(event: TagEvent, state: TagEventState): TagEventState {
  if (event.type === 'entry-location-added') {
    if (state.draft.cities.some((city) => city.id === event.city.id))
      return state

    return {
      ...state,
      draft: markEntryEdited({
        ...state.draft,
        cities: [...state.draft.cities, event.city],
        locationColors: {
          ...state.draft.locationColors,
          [event.city.id]: event.color,
        },
        ...getWeatherResetPatch(),
      }),
    }
  }

  if (event.type === 'entry-location-deleted') {
    if (!state.draft.cities.some((city) => city.id === event.cityId))
      return state

    const locationColors = { ...state.draft.locationColors }
    delete locationColors[event.cityId]

    return {
      ...state,
      draft: markEntryEdited({
        ...state.draft,
        cities: state.draft.cities.filter((city) => city.id !== event.cityId),
        locationColors,
        ...getWeatherResetPatch(),
      }),
    }
  }

  if (event.type === 'location-tag-updated') {
    const updateLocation = event.merge ? mergeEntryLocations : updateEntryLocations
    return updateEntriesAndDraft(state, (entry) => updateLocation(entry, event.locationKey, event.nextName, event.color))
  }

  if (event.type === 'location-city-updated') {
    const updateLocation = event.merge ? mergeEntryLocationCity : updateEntryLocationCity
    const nextState = updateEntriesAndDraft(state, (entry) => updateLocation(entry, event.locationKey, event.nextCity, event.color))

    if (!nextState.diaryCatalog)
      return nextState

    return {
      ...nextState,
      diaryCatalog: updateDiaryCatalogLocationCity(nextState.diaryCatalog, event.locationKey, event.nextCity, event.color, event.merge),
    }
  }

  if (event.type === 'location-tag-pin-updated') {
    if (!state.diaryCatalog)
      return state

    return {
      ...state,
      diaryCatalog: updateDiaryCatalogLocationPin(state.diaryCatalog, event.locationKey, event.pinned),
    }
  }

  return state
}

function updateEntriesAndDraft(state: TagEventState, updateEntry: (entry: DiaryEntry) => DiaryEntry): TagEventState {
  const nextEntries = mapChangedEntries(state.entries, updateEntry)
  const nextDraft = updateEntry(state.draft)

  if (nextEntries === state.entries && nextDraft === state.draft)
    return state

  return {
    ...state,
    entries: nextEntries,
    draft: nextDraft,
  }
}

function mapChangedEntries(entries: DiaryEntry[], updateEntry: (entry: DiaryEntry) => DiaryEntry): DiaryEntry[] {
  let changed = false
  const nextEntries = entries.map((entry) => {
    const nextEntry = updateEntry(entry)

    if (nextEntry !== entry)
      changed = true

    return nextEntry
  })

  return changed ? nextEntries : entries
}

function markEntryEdited(entry: DiaryEntry): DiaryEntry {
  return {
    ...entry,
    updatedAt: new Date().toISOString(),
    isEdited: true,
  }
}

function getWeatherResetPatch(): Pick<DiaryEntry, 'weatherSamples' | 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm'> {
  return {
    weatherSamples: [],
    dailyWeatherCode: null,
    dailyWeatherText: 'Not fetched',
    dailyPrecipitationMm: 0,
  }
}
