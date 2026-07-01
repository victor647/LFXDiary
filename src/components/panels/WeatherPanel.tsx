import { CloudRain, Droplets, Leaf, MapPin, RefreshCcw, Thermometer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_CITY, periodConfig } from '../../domain/constants'
import type { AppSettings, DiaryEntry, Period, WeatherSample } from '../../domain/types'
import { formatCityDisplayName } from '../../utils/city'
import { getDailyWeatherFields } from '../../utils/diaryEntryHelpers'
import { getTemperatureColorBands } from '../../utils/settings'
import {
  formatAqiForPeriod,
  formatAverageAqiForSamples,
  formatAverageHumidityForSamples,
  formatAverageTemperatureForSamples,
  formatDailyPrecipitation,
  formatDailyWeatherText,
  formatHumidityForPeriod,
  formatTemperatureForPeriod,
  formatWeatherLocationLabel,
  getAqiStyle,
  getDailyAqiStyle,
  getDailyHumidityStyle,
  getHumidityStyle,
  getTemperatureCardStyle,
} from '../../utils/weather'
import { fetchWeatherSample } from '../../utils/weather'
import { formatWeatherErrorLog } from '../../utils/weatherErrorLog'
import { DailyWeatherIcon, WeatherPeriodIcon, WeatherTitleIcon } from '../DiaryIcons'

type WeatherPanelProps = {
  draft: DiaryEntry
  settings: AppSettings
  onUpdateDraftIfCurrent: (entryId: string, diaryDate: string, patch: Partial<DiaryEntry>) => void
  onStatusChange: (message: string) => void
  onErrorLog: (log: string) => void
}

export function WeatherPanel({
  draft,
  settings,
  onUpdateDraftIfCurrent,
  onStatusChange,
  onErrorLog,
}: WeatherPanelProps) {
  const [weatherCityByPeriod, setWeatherCityByPeriod] = useState<Record<Period, string>>(() => getWeatherCityByPeriod(draft))
  const [weatherLocationPickerPeriod, setWeatherLocationPickerPeriod] = useState<Period | null>(null)
  const autoWeatherKeys = useRef<Set<string>>(new Set())
  const temperatureColorBands = useMemo(
    () => getTemperatureColorBands(settings.temperatureThresholds),
    [settings.temperatureThresholds],
  )

  useEffect(() => {
    const validCityIds = new Set(draft.cities.map((city) => city.id))
    const firstCityId = draft.cities[0]?.id ?? ''

    setWeatherCityByPeriod((current) => ({
      morning: validCityIds.has(current.morning) ? current.morning : firstCityId,
      afternoon: validCityIds.has(current.afternoon) ? current.afternoon : firstCityId,
      evening: validCityIds.has(current.evening) ? current.evening : firstCityId,
    }))
  }, [draft.cities])

  useEffect(() => {
    const autoKey = draft.id
    const isDefaultLocation = draft.cities.length === 1 && draft.cities[0]?.id === DEFAULT_CITY.id

    if (!isDefaultLocation || draft.weatherSamples.length === 3 || autoWeatherKeys.current.has(autoKey))
      return

    autoWeatherKeys.current.add(autoKey)
    onStatusChange('Fetching default Hangzhou weather...')
    const entryId = draft.id
    const diaryDate = draft.diaryDate

    Promise.all(
      periodConfig.map((config) =>
        fetchWeatherSample(draft.diaryDate, DEFAULT_CITY, config.period, config.sampleTime),
      ),
    )
      .then((samples) => {
        onUpdateDraftIfCurrent(entryId, diaryDate, { ...getDailyWeatherFields(samples), weatherSamples: samples })
        onStatusChange('Default Hangzhou weather updated')
      })
      .catch((error) => {
        onStatusChange('Default weather fetch failed. You can fetch it manually.')
        onErrorLog(
          formatWeatherErrorLog(error, {
            entry: draft,
            scope: 'default',
            city: DEFAULT_CITY,
          }),
        )
      })
  }, [draft, onErrorLog, onStatusChange, onUpdateDraftIfCurrent])

  async function updateWeatherPeriodCity(period: Period, cityId: string) {
    const previousWeatherCityByPeriod = weatherCityByPeriod
    const config = periodConfig.find((item) => item.period === period)
    const city = draft.cities.find((item) => item.id === cityId)

    setWeatherLocationPickerPeriod(null)

    if (!config || !city)
      return

    if (weatherCityByPeriod[period] === cityId) {
      onStatusChange('Weather location unchanged.')
      return
    }

    setWeatherCityByPeriod({
      ...weatherCityByPeriod,
      [period]: cityId,
    })
    onStatusChange(`Fetching ${config.label.toLowerCase()} weather for ${city.name}...`)

    try {
      const entryId = draft.id
      const diaryDate = draft.diaryDate
      const sample = await fetchWeatherSample(draft.diaryDate, city, config.period, config.sampleTime)
      const weatherSamples = upsertWeatherSample(draft.weatherSamples, sample)

      onUpdateDraftIfCurrent(entryId, diaryDate, { ...getDailyWeatherFields(weatherSamples), weatherSamples })
      onStatusChange(`${config.label} weather updated`)
    } catch (error) {
      setWeatherCityByPeriod(previousWeatherCityByPeriod)
      onStatusChange(`${config.label} weather fetch failed. Existing weather data was kept.`)
      onErrorLog(
        formatWeatherErrorLog(createWeatherAttemptError(error, config.period, config.label, config.sampleTime, city), {
          entry: draft,
          scope: 'manual',
          period: config.period,
          sampleTime: config.sampleTime,
          city,
          cityByPeriod: previousWeatherCityByPeriod,
        }),
      )
    }
  }

  async function fetchWeather() {
    if (!draft.cities.length) {
      onStatusChange('Add at least one city before fetching weather.')
      return
    }

    const missingPeriod = periodConfig.find((item) => !weatherCityByPeriod[item.period])

    if (missingPeriod) {
      onStatusChange(`Choose a city for ${missingPeriod.label}.`)
      return
    }

    onStatusChange('Fetching weather...')
    try {
      const entryId = draft.id
      const diaryDate = draft.diaryDate
      const samples = await Promise.all(
        periodConfig.map(async (config) => {
          const city = draft.cities.find((item) => item.id === weatherCityByPeriod[config.period])

          if (!city)
            throw new Error(`Missing city for ${config.label}`)

          try {
            return await fetchWeatherSample(draft.diaryDate, city, config.period, config.sampleTime)
          } catch (error) {
            throw createWeatherAttemptError(error, config.period, config.label, config.sampleTime, city)
          }
        }),
      )

      onUpdateDraftIfCurrent(entryId, diaryDate, { ...getDailyWeatherFields(samples), weatherSamples: samples })
      onStatusChange('Weather updated')
    } catch (error) {
      const attempt = getWeatherAttempt(error)
      onStatusChange('Weather fetch failed. You can try again later.')
      onErrorLog(
        formatWeatherErrorLog(error, {
          entry: draft,
          scope: 'manual',
          period: attempt?.period,
          sampleTime: attempt?.sampleTime,
          city: attempt?.city,
          cityByPeriod: weatherCityByPeriod,
        }),
      )
    }
  }

  return (
    <div className="compact-panel weather-panel">
      <div className="compact-title">
        <WeatherTitleIcon entry={draft} />
        Weather
      </div>
      <div className="weather-summary-row">
        <div className="daily-weather-card">
          <DailyWeatherIcon entry={draft} />
          <div className="daily-weather-content">
            <strong>{formatDailyWeatherText(draft.dailyWeatherText)}</strong>
            <div className="daily-weather-metrics">
              <span title="Average temperature">
                <Thermometer size={13} />
                {formatAverageTemperatureForSamples(draft.weatherSamples)}
              </span>
              <span title="Precipitation">
                <CloudRain size={13} />
                {formatDailyPrecipitation(draft.dailyPrecipitationMm)}
              </span>
              <span style={getDailyHumidityStyle(draft.weatherSamples)} title="Average relative humidity">
                <Droplets size={13} />
                {formatAverageHumidityForSamples(draft.weatherSamples)}
              </span>
              <span style={getDailyAqiStyle(draft.weatherSamples)} title="Average US AQI">
                <Leaf size={13} />
                {formatAverageAqiForSamples(draft.weatherSamples)}
              </span>
            </div>
          </div>
        </div>
        <button className="weather-fetch-button" type="button" onClick={fetchWeather} title="Fetch weather">
          <RefreshCcw size={16} />
        </button>
      </div>
      <div className="weather-fetch-row">
        <div className="temperature-grid">
          {periodConfig.map((config) => (
            <div
              className="temperature-card"
              key={config.period}
              style={getTemperatureCardStyle(draft.weatherSamples, config.period, temperatureColorBands)}
            >
              <div className="temperature-card-heading">
                <span>{config.label}</span>
                <span
                  className="weather-humidity-pill"
                  style={getHumidityStyle(draft.weatherSamples, config.period)}
                  title="Relative humidity"
                >
                  <Droplets size={13} />
                  {formatHumidityForPeriod(draft.weatherSamples, config.period, false)}
                </span>
              </div>
              <div className="temperature-main-row">
                <WeatherPeriodIcon samples={draft.weatherSamples} period={config.period} />
                <strong>{formatTemperatureForPeriod(draft.weatherSamples, config.period)}</strong>
                <span
                  className="weather-aqi-pill"
                  style={getAqiStyle(draft.weatherSamples, config.period)}
                  title="US AQI"
                >
                  <Leaf size={13} />
                  {formatAqiForPeriod(draft.weatherSamples, config.period)}
                </span>
              </div>
              {draft.cities.length > 1 && (
                <div className="weather-location-row">
                  <small>{formatWeatherLocationLabel(draft.cities, weatherCityByPeriod[config.period])}</small>
                  <div className="weather-pin-wrap">
                    <button
                      className="weather-pin-button"
                      type="button"
                      title={`Choose ${config.label} location`}
                      onClick={() =>
                        setWeatherLocationPickerPeriod(
                          weatherLocationPickerPeriod === config.period ? null : config.period,
                        )
                      }
                    >
                      <MapPin size={13} />
                    </button>
                    {weatherLocationPickerPeriod === config.period && (
                      <div className="weather-location-popover">
                        {draft.cities.map((city) => (
                          <button
                            className={
                              weatherCityByPeriod[config.period] === city.id
                                ? 'weather-location-option selected'
                                : 'weather-location-option'
                            }
                            key={city.id}
                            type="button"
                            title={city.name}
                            onClick={() => {
                              void updateWeatherPeriodCity(config.period, city.id)
                            }}
                          >
                            {formatCityDisplayName(city)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type WeatherAttempt = {
  period: Period
  sampleTime: string
  city: DiaryEntry['cities'][number]
}

type WeatherAttemptError = Error & {
  weatherAttempt?: WeatherAttempt
}

function createWeatherAttemptError(
  error: unknown,
  period: Period,
  label: string,
  sampleTime: string,
  city: DiaryEntry['cities'][number],
): WeatherAttemptError {
  const message = error instanceof Error ? error.message : String(error)
  const wrapped = new Error(`Failed to fetch ${label} weather for ${city.name} at ${sampleTime}. ${message}`) as WeatherAttemptError

  wrapped.weatherAttempt = { period, sampleTime, city }

  return wrapped
}

function getWeatherAttempt(error: unknown): WeatherAttempt | undefined {
  if (!(error instanceof Error))
    return undefined

  return (error as WeatherAttemptError).weatherAttempt
}

function getWeatherCityByPeriod(entry: DiaryEntry): Record<Period, string> {
  const firstCityId = entry.cities[0]?.id ?? ''

  return {
    morning: entry.weatherSamples.find((sample) => sample.period === 'morning')?.cityId ?? firstCityId,
    afternoon: entry.weatherSamples.find((sample) => sample.period === 'afternoon')?.cityId ?? firstCityId,
    evening: entry.weatherSamples.find((sample) => sample.period === 'evening')?.cityId ?? firstCityId,
  }
}

function upsertWeatherSample(samples: WeatherSample[], sample: WeatherSample): WeatherSample[] {
  const nextSamples = samples.filter((item) => item.period !== sample.period)
  nextSamples.push(sample)

  return periodConfig
    .map((config) => nextSamples.find((item) => item.period === config.period))
    .filter((item): item is WeatherSample => Boolean(item))
}
