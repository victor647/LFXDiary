import { DEFAULT_CITY, DEFAULT_LOCATION_COLOR } from '../constants'
import { formatCityDisplayName } from '../city'
import type { City, DiaryCatalog, DiaryEntry } from '../types'

export function serializeLocationMetadata(entry: DiaryEntry): string {
  return `Location: ${formatLocationIds(entry.cities)}`
}

export function deserializeLocationMetadata(line: string | undefined, catalog?: DiaryCatalog): City[] {
  const locationText = line?.replace(/^Location:\s*/, '').trim()

  if (!locationText || locationText === 'Not set')
    return [DEFAULT_CITY]

  return locationText.split(/\s+-\s+/).map((name) => cityFromName(name.trim(), catalog)).filter(Boolean)
}

export function getCatalogLocationColorMap(catalog: DiaryCatalog | undefined): Record<string, string> {
  if (!catalog)
    return {}

  const colors: Record<string, string> = {}

  for (const location of Object.values(catalog.locations)) {
    colors[location.city.id] = location.color
    colors[location.city.name] = location.color
    colors[formatCityDisplayName(location.city)] = location.color
  }

  return colors
}

export function findCatalogCity(name: string, catalog: DiaryCatalog | undefined): City | null {
  const normalizedName = name.trim().toLowerCase()

  if (!catalog || !normalizedName)
    return null

  return (
    Object.values(catalog.locations).find(({ city }) => {
      const displayName = formatCityDisplayName(city).toLowerCase()
      return city.name.toLowerCase() === normalizedName || displayName === normalizedName || city.id === normalizedName
    })?.city ?? null
  )
}

export function findCityByIdOrDisplayName(name: string, cities: City[]): City | null {
  const normalizedName = name.trim().toLowerCase()

  if (!normalizedName)
    return null

  return (
    cities.find((city) => {
      return (
        city.id.toLowerCase() === normalizedName ||
        city.name.toLowerCase() === normalizedName ||
        formatCityDisplayName(city).toLowerCase() === normalizedName
      )
    }) ?? null
  )
}

export function isCity(value: unknown): value is City {
  if (!value || typeof value !== 'object')
    return false

  const city = value as Partial<City>
  return Boolean(city.id && city.name && typeof city.latitude === 'number' && typeof city.longitude === 'number')
}

export { getLocationTagKey as getCityCatalogKey } from '../tagModels'

export function getDefaultLocationColor(): string {
  return DEFAULT_LOCATION_COLOR
}

function formatLocationIds(cities: City[]): string {
  if (!cities.length)
    return 'Not set'

  return cities.map((city) => city.id).join(' - ')
}

function cityFromName(name: string, catalog?: DiaryCatalog): City {
  if (name.toLowerCase() === 'hangzhou' || name.toLowerCase() === DEFAULT_CITY.id)
    return DEFAULT_CITY

  const catalogCity = findCatalogCity(name, catalog)

  if (catalogCity)
    return catalogCity

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown-city'

  return {
    id,
    name,
    country: 'Unknown',
    latitude: 0,
    longitude: 0,
    timezone: 'auto',
  }
}
