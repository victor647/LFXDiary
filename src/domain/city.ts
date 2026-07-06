import type { City } from './types'

export function formatCityDisplayName(city: City): string {
  return city.name.split(',')[0].trim() || city.name
}
