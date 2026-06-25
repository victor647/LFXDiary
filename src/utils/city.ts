import type { City, GeocodingResult } from '../domain/types'

export function toCity(result: GeocodingResult): City {
  const nameParts = [result.name, result.admin1].filter(Boolean)
  const name = Array.from(new Set(nameParts)).join(', ')

  return {
    id: `${result.id ?? result.name}-${result.latitude}-${result.longitude}`,
    name,
    country: result.country ?? 'Unknown',
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone ?? 'auto',
  }
}

export function formatCityListDisplay(cities: City[]): string {
  if (!cities.length)
    return 'Not set'

  return cities.map(formatCityDisplayName).join(' - ')
}

export function formatCityDisplayName(city: City): string {
  return city.name.split(',')[0].trim() || city.name
}
