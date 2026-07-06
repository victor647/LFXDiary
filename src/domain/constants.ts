import type { City, MoodScore, Period, TemperatureThresholds } from './types'

export const STORAGE_KEY = 'lfx-diary.entries.v1'
export const SETTINGS_KEY = 'lfx-diary.settings.v1'
export const DEFAULT_TAG_COLOR = '#8e8e93'
export const DEFAULT_LAN_NAS_URL = 'https://192.168.0.2:5001/'
export const DEFAULT_PUBLIC_NAS_URL = 'https://www.lafaxi647.cn:5001/'
export const DEFAULT_MARKDOWN_FOLDER = '/Diary'
export const DEFAULT_GIT_BRANCH = 'main'
export const DEFAULT_GIT_DIARY_PATH = 'Diary'
export const MAX_ACTIVITIES_PER_ENTRY = 6
export const MAX_PEOPLE_PER_ENTRY = 12

export const TAG_COLOR_PALETTE = [
  '#f97066',
  '#fdb022',
  '#facc15',
  '#4ade80',
  '#7dd3fc',
  '#60a5fa',
  '#c084fc',
  '#f9a8d4',
  '#8e8e93',
]

export const DEFAULT_ACTIVITY_COLOR_GROUP_NAMES: Record<string, string> = {
  '#f97066': 'Red',
  '#fdb022': 'Orange',
  '#facc15': 'Yellow',
  '#4ade80': 'Green',
  '#7dd3fc': 'Cyan',
  '#60a5fa': 'Blue',
  '#c084fc': 'Purple',
  '#f9a8d4': 'Pink',
  '#8e8e93': 'Gray',
}

export const DEFAULT_LOCATION_COLOR = TAG_COLOR_PALETTE[3]
export const LOCATION_COLOR_PALETTE = TAG_COLOR_PALETTE

export const TEMPERATURE_COLOR_BAND_DEFINITIONS = [
  { id: 'very-cold', color: TAG_COLOR_PALETTE[6] },
  { id: 'freezing', color: TAG_COLOR_PALETTE[5] },
  { id: 'cold', color: TAG_COLOR_PALETTE[4] },
  { id: 'comfortable', color: TAG_COLOR_PALETTE[3] },
  { id: 'warm', color: TAG_COLOR_PALETTE[2] },
  { id: 'hot', color: TAG_COLOR_PALETTE[1] },
  { id: 'very-hot', color: TAG_COLOR_PALETTE[0] },
]

export const DEFAULT_TEMPERATURE_THRESHOLDS: TemperatureThresholds = {
  'very-cold': -10,
  freezing: 0,
  cold: 15,
  comfortable: 25,
  warm: 30,
  hot: 35,
}

export const DEFAULT_CITY: City = {
  id: 'hangzhou-zhejiang-cn',
  name: 'Hangzhou, Zhejiang',
  country: 'China',
  latitude: 30.29365,
  longitude: 120.16142,
  timezone: 'Asia/Shanghai',
}

export const emptyMood: MoodScore = {
  morning: 5,
  afternoon: 5,
  evening: 5,
}

export const periodConfig: Array<{
  period: Period
  label: string
  sampleTime: '06:00' | '14:00' | '22:00'
}> = [
  { period: 'morning', label: 'Morning', sampleTime: '06:00' },
  { period: 'afternoon', label: 'Afternoon', sampleTime: '14:00' },
  { period: 'evening', label: 'Evening', sampleTime: '22:00' },
]

export const weatherCodeText: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
}
