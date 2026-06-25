import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Frown,
  Meh,
  RefreshCcw,
  Smile,
  Sun,
} from 'lucide-react'
import { DEFAULT_TAG_COLOR, MAX_ACTIVITIES_PER_ENTRY } from '../domain/constants'
import type { DiaryEntry, MoodScore, Period, WeatherSample } from '../domain/types'
import { getTagBackgroundColor, getTagTextColor } from '../utils/colors'
import { formatCityDisplayName } from '../utils/city'

export function DiaryWeatherIcon({ entry }: { entry: DiaryEntry }) {
  const sample = entry.weatherSamples[0]
  const weatherCode = entry.dailyWeatherCode ?? sample?.weatherCode
  const weatherText = entry.dailyWeatherText !== 'Not fetched' ? entry.dailyWeatherText : sample?.weatherText
  const Icon = getWeatherIcon(weatherCode)

  return (
    <span className="entry-weather-block">
      <span
        className={Icon ? 'entry-weather-icon' : 'entry-weather-icon empty'}
        title={weatherText ?? 'No weather fetched'}
      >
        {Icon && <Icon size={20} strokeWidth={2.1} />}
      </span>
      <span className="entry-location-list" title={entry.cities.map((city) => city.name).join('\n')}>
        {entry.cities.map((city) => (
          <span key={city.id}>{formatCityDisplayName(city)}</span>
        ))}
      </span>
    </span>
  )
}

export function WeatherTitleIcon({ entry }: { entry: DiaryEntry }) {
  const sample = entry.weatherSamples[0]
  const Icon = getWeatherIcon(entry.dailyWeatherCode ?? sample?.weatherCode) ?? RefreshCcw

  return <Icon size={16} />
}

export function DailyWeatherIcon({ entry }: { entry: DiaryEntry }) {
  const sample = entry.weatherSamples[0]
  const weatherCode = entry.dailyWeatherCode ?? sample?.weatherCode
  const weatherText = entry.dailyWeatherText !== 'Not fetched' ? entry.dailyWeatherText : sample?.weatherText
  const Icon = getWeatherIcon(weatherCode) ?? RefreshCcw

  return (
    <span className="daily-weather-icon" title={weatherText ?? 'No weather fetched'}>
      <Icon size={22} strokeWidth={2.1} />
    </span>
  )
}

export function WeatherPeriodIcon({ samples, period }: { samples: WeatherSample[]; period: Period }) {
  const sample = samples.find((item) => item.period === period)
  const Icon = getWeatherIcon(sample?.weatherCode)

  return (
    <span
      className={sample ? 'weather-period-icon' : 'weather-period-icon empty'}
      title={sample?.weatherText ?? 'No weather fetched'}
    >
      {Icon && <Icon size={16} strokeWidth={2.1} />}
    </span>
  )
}

export function MoodIcon({ mood }: { mood: MoodScore }) {
  const averageMood = (mood.morning + mood.afternoon + mood.evening) / 3

  if (averageMood < 4)
    return <Frown size={16} />

  if (averageMood < 7)
    return <Meh size={16} />

  return <Smile size={16} />
}

export function EntryTagDots({ entry }: { entry: DiaryEntry }) {
  if (!entry.tags.length)
    return <span className="entry-tags empty">No tags</span>

  return (
    <span className="entry-tags" title={entry.tags.join(', ')}>
      {entry.tags.slice(0, MAX_ACTIVITIES_PER_ENTRY).map((tag) => {
        const color = entry.tagColors[tag] ?? DEFAULT_TAG_COLOR

        return (
          <span
            className="entry-tag-pill"
            key={tag}
            style={{
              backgroundColor: getTagBackgroundColor(color),
              borderColor: color,
              color: getTagTextColor(color),
            }}
          >
            {tag}
          </span>
        )
      })}
    </span>
  )
}

function getWeatherIcon(weatherCode: number | undefined) {
  if (weatherCode === undefined)
    return undefined

  if (weatherCode === 0)
    return Sun

  if (weatherCode === 1 || weatherCode === 2)
    return CloudSun

  if (weatherCode === 3)
    return Cloud

  if (weatherCode === 45 || weatherCode === 48)
    return CloudFog

  if (weatherCode >= 51 && weatherCode <= 57)
    return CloudDrizzle

  if ((weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82))
    return CloudRain

  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86)
    return CloudSnow

  if (weatherCode >= 95)
    return CloudLightning

  return Cloud
}
