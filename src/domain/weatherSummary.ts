import { weatherCodeText } from './constants'
import type { DiaryEntry, WeatherSample } from './types'

export function getDailyWeatherFields(
  samples: WeatherSample[],
): Pick<DiaryEntry, 'dailyWeatherCode' | 'dailyWeatherText' | 'dailyPrecipitationMm'> {
  const sample = samples.find((item) => typeof item.weatherCode === 'number')
  const dailyWeatherCode = sample?.dailyWeatherCode ?? sample?.weatherCode ?? null

  return {
    dailyWeatherCode,
    dailyWeatherText: dailyWeatherCode === null ? sample?.weatherText ?? 'Not fetched' : getWeatherCodeText(dailyWeatherCode),
    dailyPrecipitationMm: getWeightedDailyPrecipitationMm(samples),
  }
}

export function getWeightedDailyPrecipitationMm(samples: WeatherSample[]): number {
  const precipitationSamples = samples.filter((sample) => typeof sample.dailyPrecipitationMm === 'number')

  if (!precipitationSamples.length)
    return 0

  const precipitation = precipitationSamples.reduce((sum, sample) => sum + (sample.dailyPrecipitationMm ?? 0), 0)

  return Math.round((precipitation / precipitationSamples.length) * 10) / 10
}

function getWeatherCodeText(code: number): string {
  return weatherCodeText[code] ?? 'Unknown'
}
