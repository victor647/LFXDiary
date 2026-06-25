import { DEFAULT_CITY, periodConfig, weatherCodeText } from '../constants'
import type { City, DiaryEntry, WeatherSample } from '../types'
import { findCityByIdOrDisplayName } from './locationMetadata'

export function serializeWeatherMetadata(entry: DiaryEntry): string[] {
  return [
    `Weather Code: ${formatDailyWeatherCode(entry)}`,
    `Precipitation: ${formatPrecipitationForMarkdown(entry.dailyPrecipitationMm)}`,
    `Weather Samples: ${formatWeatherSamples(entry)}`,
  ]
}

export function deserializeWeatherMetadata(
  summaryLine: string | undefined,
  codeLine: string | undefined,
  precipitationLine: string | undefined,
  samplesLine: string | undefined,
  cities: City[],
): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm' | 'weatherSamples'> {
  const summary = parseWeatherSummary(summaryLine)
  const samples = parseWeatherSamples(samplesLine, cities)
  const weatherCodeText = codeLine?.replace(/^Weather Code:\s*/, '').trim()
  const dailyWeatherCode = weatherCodeText && weatherCodeText !== 'Not fetched'
    ? Number(weatherCodeText)
    : summary.dailyWeatherCode
  const normalizedDailyWeatherCode = Number.isFinite(dailyWeatherCode) ? dailyWeatherCode : summary.dailyWeatherCode
  const dailyWeatherText = normalizedDailyWeatherCode === null
    ? summary.dailyWeatherText
    : weatherCodeTextMap(normalizedDailyWeatherCode)

  return {
    dailyWeatherCode: normalizedDailyWeatherCode,
    dailyWeatherText,
    dailyPrecipitationMm: parsePrecipitation(precipitationLine, summaryLine),
    weatherSamples: samples.map((sample) => ({
      ...sample,
      weatherCode: normalizedDailyWeatherCode ?? sample.weatherCode,
      weatherText: normalizedDailyWeatherCode === null ? sample.weatherText : weatherCodeTextMap(normalizedDailyWeatherCode),
    })),
  }
}

export function normalizeWeatherMetadata(
  code: unknown,
  text: unknown,
  precipitation: unknown,
  samples: unknown,
): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm' | 'weatherSamples'> {
  return {
    dailyWeatherCode: normalizeParsedWeatherCode(code, samples),
    dailyWeatherText: normalizeParsedWeatherText(text, samples),
    dailyPrecipitationMm: normalizeParsedPrecipitation(precipitation, samples),
    weatherSamples: normalizeParsedWeatherSamples(samples),
  }
}

function formatDailyWeatherCode(entry: DiaryEntry): string {
  const code = entry.dailyWeatherCode ?? entry.weatherSamples[0]?.weatherCode

  return typeof code === 'number' ? String(code) : 'Not fetched'
}

function formatPrecipitationForMarkdown(value: number): string {
  return `${Math.round(value * 10) / 10}mm`
}

function formatWeatherSamples(entry: DiaryEntry): string {
  if (!entry.weatherSamples.length)
    return 'Not fetched'

  return periodConfig
    .map((config) => {
      const sample = entry.weatherSamples.find((item) => item.period === config.period)

      if (!sample)
        return null

      const city = entry.cities.find((item) => item.id === sample.cityId)
      const cityId = city?.id ?? sample.cityId
      const aqi = sample.usAqi === null ? 'unknown' : String(sample.usAqi)
      const relativeHumidity = sample.relativeHumidity === null ? 'unknown' : String(sample.relativeHumidity)

      return `${sample.temperatureC}|${aqi}|${relativeHumidity}|${cityId}`
    })
    .filter(Boolean)
    .join('; ') || 'Not fetched'
}

function parsePrecipitation(precipitationLine: string | undefined, summaryLine: string | undefined): number {
  const precipitationText = precipitationLine?.replace(/^Precipitation:\s*/, '').trim()
  const summaryPrecipitationText = summaryLine?.match(/,\s*([\d.]+)mm,\s*AQI=/)?.[1]
  const value = Number((precipitationText ?? summaryPrecipitationText ?? '0').replace(/mm$/i, ''))

  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0
}

function parseWeatherSummary(line: string | undefined): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText'> {
  const weatherText = line?.replace(/^Weather:\s*/, '').split(',')[0]?.trim()

  if (!weatherText || weatherText === 'Not fetched')
    return { dailyWeatherCode: null, dailyWeatherText: 'Not fetched' }

  const weatherCode = findWeatherCodeByText(weatherText)

  return {
    dailyWeatherCode: weatherCode,
    dailyWeatherText: weatherText,
  }
}

function parseWeatherSamples(line: string | undefined, cities: City[]): WeatherSample[] {
  const samplesText = line?.replace(/^Weather Samples:\s*/, '').trim()

  if (!samplesText || samplesText === 'Not fetched')
    return []

  return samplesText
    .split(';')
    .map((sampleText, index) => parseWeatherSample(sampleText.trim(), index, cities))
    .filter((sample): sample is WeatherSample => Boolean(sample))
}

function parseWeatherSample(sampleText: string, index: number, cities: City[]): WeatherSample | null {
  const compactMatch = sampleText.match(/^(-?\d+)\|(unknown|\d+)\|(?:(unknown|\d+)\|)?(.+)$/)
  const config = periodConfig[index]

  if (compactMatch && config)
    return {
      period: config.period,
      sampleTime: config.sampleTime,
      cityId: findCityByIdOrDisplayName(compactMatch[4], cities)?.id ?? cities[0]?.id ?? DEFAULT_CITY.id,
      weatherText: 'Unknown',
      weatherCode: 0,
      temperatureC: Number(compactMatch[1]),
      usAqi: compactMatch[2] === 'unknown' ? null : Number(compactMatch[2]),
      relativeHumidity: compactMatch[3] && compactMatch[3] !== 'unknown' ? Number(compactMatch[3]) : null,
      fetchedAt: new Date().toISOString(),
      source: 'Markdown',
    }

  const legacyMatch = sampleText.match(
    /^(Morning|Afternoon|Evening):\s*(.+?) \(code=(\d+)\),\s*(-?\d+)°C,\s*AQI=(unknown|\d+),\s*(.+)$/,
  )

  if (!legacyMatch)
    return null

  const legacyConfig = periodConfig.find((item) => item.label === legacyMatch[1])
  const city = findCityByIdOrDisplayName(legacyMatch[6], cities)

  if (!legacyConfig)
    return null

  return {
    period: legacyConfig.period,
    sampleTime: legacyConfig.sampleTime,
    cityId: city?.id ?? cities[0]?.id ?? DEFAULT_CITY.id,
    weatherText: legacyMatch[2],
    weatherCode: Number(legacyMatch[3]),
    temperatureC: Number(legacyMatch[4]),
    usAqi: legacyMatch[5] === 'unknown' ? null : Number(legacyMatch[5]),
    relativeHumidity: null,
    fetchedAt: new Date().toISOString(),
    source: 'Markdown',
  }
}

function normalizeParsedWeatherSamples(samples: unknown): WeatherSample[] {
  if (!Array.isArray(samples))
    return []

  return samples
    .map((sample) => {
      if (!sample || typeof sample !== 'object')
        return null

      const weatherSample = sample as Partial<WeatherSample>

      if (!periodConfig.some((config) => config.period === weatherSample.period))
        return null

      return {
        ...weatherSample,
        relativeHumidity: typeof weatherSample.relativeHumidity === 'number' ? weatherSample.relativeHumidity : null,
      } as WeatherSample
    })
    .filter((sample): sample is WeatherSample => Boolean(sample))
}

function normalizeParsedWeatherCode(code: unknown, samples: unknown): number | null {
  if (typeof code === 'number')
    return code

  const parsedSamples = normalizeParsedWeatherSamples(samples)
  return parsedSamples.find((sample) => typeof sample.weatherCode === 'number')?.weatherCode ?? null
}

function normalizeParsedWeatherText(text: unknown, samples: unknown): string {
  if (typeof text === 'string' && text)
    return text

  const parsedSamples = normalizeParsedWeatherSamples(samples)
  return parsedSamples.find((sample) => sample.weatherText)?.weatherText ?? 'Not fetched'
}

function normalizeParsedPrecipitation(value: unknown, samples: unknown): number {
  if (typeof value === 'number')
    return Math.round(value * 10) / 10

  const parsedSamples = normalizeParsedWeatherSamples(samples)
  return parsedSamples.find((sample) => typeof sample.dailyPrecipitationMm === 'number')?.dailyPrecipitationMm ?? 0
}

function findWeatherCodeByText(text: string): number | null {
  const normalizedText = text.trim().toLowerCase()
  const match = Object.entries(weatherCodeText).find(([, value]) => value.toLowerCase() === normalizedText)

  return match ? Number(match[0]) : null
}

function weatherCodeTextMap(code: number): string {
  return weatherCodeText[code] ?? 'Unknown'
}
