import type { ActivityTag, CatalogDiaryTagManager, PersonTag, PointOfInterestTag } from '../domain/tagModels'
import { ActivityTagManager, PersonTagManager, PointOfInterestTagManager } from '../domain/tagModels'
import { moveDiaryCatalogNamedTag, updateDiaryCatalogLocationCity, updateDiaryCatalogLocationPin, updateDiaryCatalogNamedTagSection } from '../domain/diaryCatalog'
import type { AppSettings, City, DiaryCatalog, DiaryEntry, TagId } from '../domain/types'
import {
  mergeEntryLocationCity,
  mergeEntryLocations,
  updateEntryLocationCity,
  updateEntryLocations,
} from '../utils/diaryEntryHelpers'

export type CatalogTagManager = CatalogDiaryTagManager<ActivityTag | PersonTag | PointOfInterestTag>

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
    tagId: TagId
    name: string
    color: string
  }
  | {
    type: 'catalog-tag-updated'
    manager: CatalogTagManager
    oldTag: TagId
    nextTag: TagId
    name: string
    color: string
  }
  | {
    type: 'catalog-tags-deleted'
    manager: CatalogTagManager
    tagIds: TagId[]
  }
  | {
    type: 'catalog-tag-pin-updated'
    manager: CatalogTagManager
    tagId: TagId
    pinned: boolean
  }
  | {
    type: 'catalog-tag-moved'
    sourceManager: CatalogTagManager
    targetManager: CatalogTagManager
    tagId: TagId
    color: string
  }
  | {
    type: 'entry-tag-added'
    manager: CatalogTagManager
    tagId: TagId
    name: string
    color: string
  }
  | {
    type: 'entry-tags-deleted'
    manager: CatalogTagManager
    tagIds: TagId[]
  }
  | {
    type: 'entry-tags-reordered'
    manager: CatalogTagManager
    tagIds: TagId[]
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
        [event.tagId]: { name: event.name, color: event.color },
      }),
    }
  }

  if (event.type === 'catalog-tag-updated') {
    const nextState = {
      ...state,
      settings: event.manager.setCatalog(
        state.settings,
        event.manager.updateCatalog(event.manager.getCatalog(state.settings), event.oldTag, event.nextTag, event.color),
      ),
    }

    if (nextState.diaryCatalog) {
      nextState.diaryCatalog = updateDiaryCatalogSection(
        nextState.diaryCatalog, event.manager, event.oldTag, event.nextTag, event.color,
      )
    }

    return nextState
  }

  if (event.type === 'catalog-tags-deleted') {
    return {
      ...state,
      settings: event.manager.setCatalog(
        state.settings,
        event.manager.deleteCatalogTags(event.manager.getCatalog(state.settings), event.tagIds),
      ),
    }
  }

  if (event.type === 'catalog-tag-pin-updated') {
    return {
      ...state,
      settings: event.manager.setCatalog(
        state.settings,
        event.manager.updateCatalogPin(event.manager.getCatalog(state.settings), event.tagId, event.pinned),
      ),
    }
  }

  if (event.type === 'catalog-tag-moved') {
    const nextState = {
      ...state,
      settings: event.targetManager.setCatalog(
        event.sourceManager.setCatalog(
          state.settings,
          event.sourceManager.deleteCatalogTags(event.sourceManager.getCatalog(state.settings), [event.tagId]),
        ),
        {
          ...event.targetManager.getCatalog(state.settings),
          [event.tagId]: { name: event.targetManager.getCatalog(state.settings)[event.tagId]?.name ?? event.tagId, color: event.color },
        },
      ),
    }

    if (nextState.diaryCatalog) {
      nextState.diaryCatalog = moveDiaryCatalogBetweenSections(
        nextState.diaryCatalog, event.sourceManager, event.targetManager, event.tagId, event.color,
      )
    }

    return nextState
  }

  return state
}

function catalogEntryReferenceObserver(event: TagEvent, state: TagEventState): TagEventState {
  if (event.type === 'catalog-tag-updated') {
    if (event.oldTag === event.nextTag)
      return state

    return updateEntriesAndDraft(state, (entry) => {
      return event.manager.updateEntryTag(entry, event.oldTag, event.nextTag, event.color)
    })
  }

  if (event.type === 'catalog-tags-deleted') {
    return updateEntriesAndDraft(state, (entry) => {
      return event.tagIds.reduce((nextEntry, tagId) => event.manager.deleteEntryTag(nextEntry, tagId), entry)
    })
  }

  if (event.type === 'catalog-tag-moved') {
    return updateEntriesAndDraft(state, (entry) => {
      const afterDelete = event.sourceManager.deleteEntryTag(entry, event.tagId)
      const patch = event.targetManager.addToEntry(afterDelete, event.tagId, event.color)
      if (!patch) return afterDelete
      return {
        ...afterDelete,
        ...patch,
        updatedAt: new Date().toISOString(),
        isEdited: true,
      }
    })
  }

  return state
}

function currentEntryTagObserver(event: TagEvent, state: TagEventState): TagEventState {
  if (event.type === 'entry-tag-added') {
    const patch = event.manager.addToEntry(state.draft, event.tagId, event.color)

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
    const nextDraft = event.tagIds.reduce((entry, tagId) => event.manager.deleteEntryTag(entry, tagId), state.draft)

    if (nextDraft === state.draft)
      return state

    return {
      ...state,
      draft: nextDraft,
    }
  }

  if (event.type === 'entry-tags-reordered') {
    const patch = event.manager.buildDraftPatch(event.tagIds, event.manager.getEntryColors(state.draft))

    return {
      ...state,
      draft: markEntryEdited({
        ...state.draft,
        ...patch,
      }),
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

function updateDiaryCatalogSection(
  catalog: DiaryCatalog,
  manager: CatalogTagManager,
  oldTag: string,
  nextTag: string,
  color: string,
): DiaryCatalog {
  if (manager instanceof ActivityTagManager) {
    return {
      ...catalog,
      activities: updateDiaryCatalogNamedTagSection(catalog.activities, oldTag, nextTag, color),
    }
  }

  if (manager instanceof PersonTagManager) {
    return {
      ...catalog,
      people: updateDiaryCatalogNamedTagSection(catalog.people, oldTag, nextTag, color),
    }
  }

  if (manager instanceof PointOfInterestTagManager) {
    return {
      ...catalog,
      pointsOfInterest: updateDiaryCatalogNamedTagSection(catalog.pointsOfInterest, oldTag, nextTag, color),
    }
  }

  return catalog
}

function moveDiaryCatalogBetweenSections(
  catalog: DiaryCatalog,
  sourceManager: CatalogTagManager,
  targetManager: CatalogTagManager,
  tag: string,
  color: string,
): DiaryCatalog {
  const sourceSection = getCatalogSection(catalog, sourceManager)
  const targetSection = getCatalogSection(catalog, targetManager)
  const result = moveDiaryCatalogNamedTag(sourceSection, targetSection, tag, color)

  return setCatalogSection(setCatalogSection(catalog, sourceManager, result.sourceSection), targetManager, result.targetSection)
}

function getCatalogSection(
  catalog: DiaryCatalog,
  manager: CatalogTagManager,
): DiaryCatalog['activities'] {
  if (manager instanceof ActivityTagManager) return catalog.activities
  if (manager instanceof PersonTagManager) return catalog.people
  if (manager instanceof PointOfInterestTagManager) return catalog.pointsOfInterest
  return {} as DiaryCatalog['activities']
}

function setCatalogSection(
  catalog: DiaryCatalog,
  manager: CatalogTagManager,
  section: DiaryCatalog['activities'],
): DiaryCatalog {
  if (manager instanceof ActivityTagManager) return { ...catalog, activities: section }
  if (manager instanceof PersonTagManager) return { ...catalog, people: section }
  if (manager instanceof PointOfInterestTagManager) return { ...catalog, pointsOfInterest: section }
  return catalog
}
