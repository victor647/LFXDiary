export type Period = 'morning' | 'afternoon' | 'evening'

export type City = {
  id: string
  name: string
  country: string
  latitude: number
  longitude: number
  timezone: string
}

export type WeatherSample = {
  period: Period
  sampleTime: '06:00' | '14:00' | '22:00'
  cityId: string
  weatherText: string
  weatherCode: number
  dailyWeatherCode?: number
  dailyPrecipitationMm?: number
  temperatureC: number
  relativeHumidity: number | null
  usAqi: number | null
  fetchedAt: string
  source: string
}

export type MoodScore = {
  morning: number
  afternoon: number
  evening: number
}

export type DiaryEntry = {
  id: string
  diaryDate: string
  cities: City[]
  locationColors: Record<string, string>
  dailyWeatherCode: number | null
  dailyWeatherText: string
  dailyPrecipitationMm: number
  weatherSamples: WeatherSample[]
  mood: MoodScore
  tags: string[]
  tagColors: Record<string, string>
  content: string
  createdAt: string
  updatedAt: string
  savedAt: string | null
  syncedAt: string | null
}

export type GeocodingResult = {
  id?: number
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
  timezone?: string
}

export type NotebookGroup = {
  year: string
  months: Array<{ key: string; label: string; entries: DiaryEntry[] }>
}

export type RecentTag = {
  name: string
  color: string
}

export type RecentCity = {
  city: City
  color: string
}

export type NasConnectionMode = 'lan' | 'public'
export type SyncProvider = 'nas' | 'git'

export type AppSettings = {
  syncProvider: SyncProvider
  nasMode: NasConnectionMode
  lanNasUrl: string
  publicNasUrl: string
  nasUsername: string
  nasPassword: string
  markdownFolder: string
  gitRemoteUrl: string
  gitBranch: string
  gitUsername: string
  gitPassword: string
  gitAuthorName: string
  gitAuthorEmail: string
  gitDiaryPath: string
  gitCorsProxy: string
  activityColorGroupNames: Record<string, string>
}

export type DiaryCatalog = {
  version: 1
  updatedAt: string
  locations: Record<string, {
    city: City
    color: string
  }>
  activities: Record<string, {
    color: string
  }>
}
