import { periodConfig, weatherCodeText } from '../domain/constants'
import type { City, Period, TemperatureColorBand, WeatherSample } from '../domain/types'
import { formatCityDisplayName } from './city'
import { getTagBackgroundColor } from './colors'

export async function fetchWeatherSample(
  date: string,
  city: City,
  period: Period,
  sampleTime: '06:00' | '14:00' | '22:00',
): Promise<WeatherSample> {
  const sampleDateTime = new Date(`${date}T${sampleTime}:00`)
  const forecastHost = 'https://api.open-meteo.com/v1/forecast'
  const archiveHost = 'https://archive-api.open-meteo.com/v1/archive'
  const weatherHosts =
    sampleDateTime > new Date() ? [forecastHost, archiveHost] : [archiveHost, forecastHost]

  const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  airUrl.searchParams.set('latitude', String(city.latitude))
  airUrl.searchParams.set('longitude', String(city.longitude))
  airUrl.searchParams.set('start_date', date)
  airUrl.searchParams.set('end_date', date)
  airUrl.searchParams.set('hourly', 'us_aqi')
  airUrl.searchParams.set('timezone', city.timezone || 'auto')

  const [weatherData, airData] = await Promise.all([
    fetchWeatherData(weatherHosts, date, city, sampleTime),
    fetchAirQualityData(airUrl),
  ])
  const weatherIndex = findTimeIndex(weatherData.hourly?.time ?? [], sampleTime)
  const airIndex = findTimeIndex(airData.hourly?.time ?? [], sampleTime)
  const weatherCode = Number(weatherData.hourly?.weather_code?.[weatherIndex] ?? weatherData.daily?.weather_code?.[0] ?? 0)
  const dailyWeatherCode = Number(weatherData.daily?.weather_code?.[0] ?? weatherCode)
  const dailyPrecipitationMm = Number(weatherData.daily?.precipitation_sum?.[0] ?? 0)
  const temperatureC = Number(weatherData.hourly?.temperature_2m?.[weatherIndex] ?? 0)
  const relativeHumidityRaw = weatherData.hourly?.relative_humidity_2m?.[weatherIndex]
  const usAqiRaw = airData.hourly?.us_aqi?.[airIndex]

  return {
    period,
    sampleTime,
    cityId: city.id,
    weatherText: weatherCodeText[weatherCode] ?? 'Unknown',
    weatherCode,
    dailyWeatherCode,
    dailyPrecipitationMm: roundPrecipitation(dailyPrecipitationMm),
    temperatureC: Math.round(temperatureC),
    relativeHumidity: typeof relativeHumidityRaw === 'number' ? Math.round(relativeHumidityRaw) : null,
    usAqi: typeof usAqiRaw === 'number' ? Math.round(usAqiRaw) : null,
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo',
  }
}

async function fetchAirQualityData(url: URL): Promise<{
  hourly?: { time?: string[]; us_aqi?: number[] }
}> {
  const response = await fetch(url)

  if (!response.ok)
    throw new Error(`Air quality request failed: HTTP ${response.status} ${url.toString()}`)

  return response.json()
}

async function fetchWeatherData(
  hosts: string[],
  date: string,
  city: City,
  sampleTime: string,
): Promise<{
  hourly?: { time?: string[]; temperature_2m?: number[]; relative_humidity_2m?: number[]; weather_code?: number[] }
  daily?: { weather_code?: number[]; precipitation_sum?: number[] }
}> {
  const failures: string[] = []

  for (const host of hosts) {
    const weatherUrl = new URL(host)
    weatherUrl.searchParams.set('latitude', String(city.latitude))
    weatherUrl.searchParams.set('longitude', String(city.longitude))
    weatherUrl.searchParams.set('start_date', date)
    weatherUrl.searchParams.set('end_date', date)
    weatherUrl.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,weather_code')
    weatherUrl.searchParams.set('daily', 'weather_code,precipitation_sum')
    weatherUrl.searchParams.set('timezone', city.timezone || 'auto')

    try {
      const response = await fetch(weatherUrl)

      if (!response.ok) {
        failures.push(`${host}: HTTP ${response.status}`)
        continue
      }

      const data = await response.json()
      const times = data.hourly?.time ?? []

      if (Array.isArray(times) && findTimeIndex(times, sampleTime) !== -1)
        return data

      failures.push(`${host}: missing hourly data for ${date} ${sampleTime}`)
    } catch (error) {
      failures.push(`${host}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`Weather data unavailable for ${date} ${sampleTime}. ${failures.join(' | ')}`)
}

function findTimeIndex(times: string[], sampleTime: string): number {
  return times.findIndex((time) => time.endsWith(`T${sampleTime}`))
}

export function formatWeather(samples: WeatherSample[], dailyPrecipitationMm = 0, dailyWeatherText?: string): string {
  if (samples.length !== 3)
    return 'Not fetched'

  const ordered = periodConfig.map((config) => samples.find((sample) => sample.period === config.period))

  if (ordered.some((sample) => !sample))
    return 'Not fetched'

  const aqiValues = ordered
    .map((sample) => sample?.usAqi)
    .filter((value): value is number => typeof value === 'number')
  const weatherText = dailyWeatherText && dailyWeatherText !== 'Not fetched'
    ? dailyWeatherText
    : formatHourlyWeatherText(ordered.map((sample) => sample?.weatherText ?? 'Unknown'))
  const averageTemperatureText = formatAverageTemperature(ordered.map((sample) => sample?.temperatureC))
  const aqiText = formatAqi(aqiValues)
  const precipitationText = formatPrecipitation(dailyPrecipitationMm)

  return [weatherText, averageTemperatureText, precipitationText, aqiText].filter(Boolean).join(', ')
}

export function formatDailyWeatherText(dailyWeatherText: string): string {
  return dailyWeatherText && dailyWeatherText !== 'Not fetched' ? dailyWeatherText : 'Not fetched'
}

export function formatAverageTemperatureForSamples(samples: WeatherSample[]): string {
  const average = averageNumbers(samples.map((sample) => sample.temperatureC))

  return average === null ? '--°C' : `${average.toFixed(1)}°C`
}

export function formatAverageHumidityForSamples(samples: WeatherSample[]): string {
  const average = averageNumbers(samples.map((sample) => sample.relativeHumidity))

  return average === null ? '--%' : `${Math.round(average)}%`
}

export function formatAverageAqiForSamples(samples: WeatherSample[]): string {
  const average = averageNumbers(samples.map((sample) => sample.usAqi))

  return average === null ? 'AQI --' : `AQI ${Math.round(average)}`
}

export function formatDailyPrecipitation(dailyPrecipitationMm: number): string {
  return `${roundPrecipitation(dailyPrecipitationMm)}mm`
}

function formatHourlyWeatherText(weatherParts: string[]): string {
  return new Set(weatherParts).size === 1 ? weatherParts[0] : weatherParts.join('-')
}

function roundPrecipitation(value: number): number {
  return Math.round(value * 10) / 10
}

function formatPrecipitation(value: number): string | null {
  if (value <= 0)
    return null

  return `${roundPrecipitation(value)}mm`
}

function formatAverageTemperature(values: Array<number | undefined>): string | null {
  if (values.some((value) => typeof value !== 'number'))
    return null

  const temperatures = values as number[]
  const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length

  return `${average.toFixed(1)}℃`
}

function averageNumbers(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === 'number')

  if (!numbers.length)
    return null

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

export function formatTemperatureForPeriod(samples: WeatherSample[], period: Period): string {
  const sample = samples.find((item) => item.period === period)

  if (!sample)
    return '--°C'

  return `${sample.temperatureC}°C`
}

export function formatAqiForPeriod(samples: WeatherSample[], period: Period): string {
  const sample = samples.find((item) => item.period === period)

  if (!sample || sample.usAqi === null)
    return '--'

  return String(sample.usAqi)
}

export function formatHumidityForPeriod(samples: WeatherSample[], period: Period, showPercent = true): string {
  const sample = samples.find((item) => item.period === period)

  if (!sample || typeof sample.relativeHumidity !== 'number')
    return showPercent ? '--%' : '--'

  return showPercent ? `${sample.relativeHumidity}%` : String(sample.relativeHumidity)
}

export function getTemperatureCardStyle(samples: WeatherSample[], period: Period, temperatureColorBands: TemperatureColorBand[]) {
  const sample = samples.find((item) => item.period === period)

  if (!sample)
    return undefined

  const color = getTemperatureColor(sample.temperatureC, temperatureColorBands)

  return {
    backgroundColor: getTagBackgroundColor(color),
    borderColor: color,
  }
}

export function getAqiStyle(samples: WeatherSample[], period: Period) {
  const sample = samples.find((item) => item.period === period)

  if (!sample || sample.usAqi === null)
    return undefined

  return {
    color: getAqiColor(sample.usAqi),
  }
}

export function getDailyAqiStyle(samples: WeatherSample[]) {
  const average = averageNumbers(samples.map((sample) => sample.usAqi))

  if (average === null)
    return undefined

  return {
    color: getAqiColor(Math.round(average)),
  }
}

export function getHumidityStyle(samples: WeatherSample[], period: Period) {
  const sample = samples.find((item) => item.period === period)

  if (!sample || typeof sample.relativeHumidity !== 'number')
    return undefined

  return {
    color: getHumidityColor(sample.relativeHumidity),
  }
}

export function getDailyHumidityStyle(samples: WeatherSample[]) {
  const average = averageNumbers(samples.map((sample) => sample.relativeHumidity))

  if (average === null)
    return undefined

  return {
    color: getHumidityColor(Math.round(average)),
  }
}

function getTemperatureColor(temperatureC: number, temperatureColorBands: TemperatureColorBand[]): string {
  const band = temperatureColorBands.find((item) => {
    const isAboveMin = item.minC === null || temperatureC >= item.minC
    const isBelowMax = item.maxC === null || temperatureC < item.maxC

    return isAboveMin && isBelowMax
  })

  return band?.color ?? '#8e8e93'
}

function getAqiColor(aqi: number): string {
  if (aqi <= 50)
    return '#15803d'

  if (aqi <= 100)
    return '#a16207'

  if (aqi <= 200)
    return '#c2410c'

  return '#dc2626'
}

function getHumidityColor(relativeHumidity: number): string {
  if (relativeHumidity < 30)
    return '#dc2626'

  if (relativeHumidity < 50)
    return '#a16207'

  if (relativeHumidity < 70)
    return '#15803d'

  return '#2563eb'
}

export function formatWeatherLocationLabel(cities: City[], cityId: string): string {
  const city = cities.find((item) => item.id === cityId)

  if (!city)
    return 'No location'

  return formatCityDisplayName(city)
}

function formatAqi(values: number[]): string {
  if (values.length !== 3)
    return 'AQI=unknown'

  const max = Math.max(...values)
  const min = Math.min(...values)

  if (max - min <= 50) {
    const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    return `AQI=${average}`
  }

  return `AQI=${values.join('-')}`
}
