import type { City, DiaryEntry, Period } from '../domain/types'
import { formatCityDisplayName } from './city'
import { formatDiaryDate } from './date'

type WeatherErrorLogContext = {
  entry: DiaryEntry
  scope: 'default' | 'manual'
  city?: City
  period?: Period
  sampleTime?: string
  cityByPeriod?: Record<Period, string>
}

const periodLabels: Record<Period, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export function formatWeatherErrorLog(error: unknown, context: WeatherErrorLogContext): string {
  const lines = [
    `Time: ${new Date().toISOString()}`,
    `Message: ${getErrorMessage(error)}`,
    'Feature: Weather fetch',
    `Scope: ${context.scope === 'default' ? 'default Hangzhou auto fetch' : 'manual fetch'}`,
    `Entry date: ${context.entry.diaryDate}`,
    `Display date: ${formatDiaryDate(context.entry.diaryDate)}`,
    `Locations: ${formatLocations(context.entry.cities)}`,
  ]

  if (context.period)
    lines.push(`Period: ${periodLabels[context.period]}`)

  if (context.sampleTime)
    lines.push(`Sample time: ${context.sampleTime}`)

  if (context.city)
    lines.push(`City: ${formatCityDisplayName(context.city)} (${context.city.latitude}, ${context.city.longitude})`)

  if (context.cityByPeriod) {
    lines.push('Selected cities:')
    lines.push(...formatSelectedCities(context.entry.cities, context.cityByPeriod))
  }

  if (error instanceof Error && error.stack)
    lines.push(`Stack:\n${error.stack}`)

  lines.push(
    'Hint: Weather fetch uses Open-Meteo weather data plus locally calculated U.S. AQI from raw pollutant concentrations. CNEMC pollutant data is preferred for mainland China dates from today through the previous 13 days, Aliyun pollutant data is used when available, and Open-Meteo pollutant data is the fallback. Check the network connection, city coordinates/timezone, CORS/proxy, tokens, and whether the requested date is available from forecast or archive data.',
  )

  return lines.join('\n')
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message

  return String(error)
}

function formatLocations(cities: City[]): string {
  if (!cities.length)
    return 'none'

  return cities.map((city) => `${formatCityDisplayName(city)} [${city.id}]`).join(' | ')
}

function formatSelectedCities(cities: City[], cityByPeriod: Record<Period, string>): string[] {
  return (Object.entries(periodLabels) as Array<[Period, string]>).map(([period, label]) => {
    const city = cities.find((item) => item.id === cityByPeriod[period])
    const cityText = city ? `${formatCityDisplayName(city)} [${city.id}]` : 'not selected'

    return `- ${label}: ${cityText}`
  })
}
