import type { City, GeocodingResult } from '../domain/types'
import { formatCityDisplayName } from '../domain/city'

export { formatCityDisplayName }

export function formatCityFullName(city: City): string {
  return [city.name, city.country === 'Unknown' ? '' : city.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index, parts) => parts.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
    .join(', ')
}

/** Look up a city name by latitude/longitude using reverse geocoding */
export async function searchCityByCoordinates(lat: number, lng: number): Promise<City | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&language=en`,
      { headers: { 'User-Agent': 'LFXDiary/1.0' } },
    )
    const data = await response.json() as {
      name?: string
      display_name?: string
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string; country?: string }
    } | { error?: string }
    if ('error' in data || !data.address) return null

    const addr = data.address
    const cityName = addr.city || addr.town || addr.village || addr.county || data.name || 'Unknown'
    const country = addr.country ?? 'Unknown'

    return {
      id: `${cityName.toLowerCase().replace(/\s+/g, '-')}-${lat}-${lng}`,
      name: cityName,
      country,
      latitude: lat,
      longitude: lng,
      timezone: 'auto',
    }
  } catch {
    return null
  }
}

export async function searchCitiesByName(query: string, count = 8): Promise<City[]> {
  const trimmed = query.trim()

  if (!trimmed)
    return []

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`,
  )
  const data = (await response.json()) as { results?: GeocodingResult[] }

  return (data.results ?? []).map(toCity)
}

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
