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
  people: string[]
  personColors: Record<string, string>
  pointsOfInterest: string[]
  pointOfInterestColors: Record<string, string>
  content: string
  createdAt: string
  updatedAt: string
  savedAt: string | null
  syncedAt: string | null
  isEdited: boolean
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
  months: Array<{ key: string; label: string; entries: DiaryEntry[]; entryCount: number; isLoaded: boolean }>
}

export type RecentTag = {
  name: string
  color: string
  pinned?: boolean
}

export type RecentCity = {
  city: City
  color: string
  pinned?: boolean
}

export type NasConnectionMode = 'lan' | 'public'
export type SyncProvider = 'nas' | 'git'

export type TemperatureColorBand = {
  id: string
  label: string
  minC: number | null
  maxC: number | null
  color: string
}

export type TemperatureThresholds = Record<string, number>

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
  birthDate: string
  aqicnToken: string
  aliyunAirAppCode: string
  aliyunAirAppKey: string
  aliyunAirAppSecret: string
  activityColorGroupNames: Record<string, string>
  activityTags: Record<string, {
    color: string
    pinned?: boolean
  }>
  personColorGroupNames: Record<string, string>
  peopleTags: Record<string, {
    color: string
    pinned?: boolean
  }>
  pointOfInterestColorGroupNames: Record<string, string>
  pointOfInterestTags: Record<string, {
    color: string
    pinned?: boolean
  }>
  locationColorGroupNames: Record<string, string>
  temperatureThresholds: TemperatureThresholds
}

export type DiaryCatalog = {
  version: 1
  updatedAt: string
  locations: Record<string, {
    city: City
    color: string
    pinned?: boolean
    entries: string[]
  }>
  activities: Record<string, {
    color: string
    pinned?: boolean
    entries: string[]
  }>
  people: Record<string, {
    color: string
    pinned?: boolean
    entries: string[]
  }>
  pointsOfInterest: Record<string, {
    color: string
    pinned?: boolean
    entries: string[]
  }>

  colorNames: {
    activities: Record<string, string>
    people: Record<string, string>
    pointsOfInterest: Record<string, string>
    locations: Record<string, string>
  }
}

export type YearCatalog = {
  version: 1
  year: string
  locations: Record<string, string[]>
  activities: Record<string, string[]>
  people: Record<string, string[]>
  pointsOfInterest: Record<string, string[]>
}

export type TagFilterKind = 'location' | 'activity' | 'person' | 'pointOfInterest'

export type TagFilterSelection = {
  kind: TagFilterKind
  tag: string
}

export type TagFilter = {
  kind: TagFilterKind | ''
  color: string
  tag: string
  tags: TagFilterSelection[]
}

export type TagFilterOption = {
  kind: TagFilterKind
  value: string
  name: string
  color: string
  colorLabel: string
}

export type PullConflict = {
  localEntry: DiaryEntry
  cloudEntry: DiaryEntry
}

export type PendingPullReview = {
  syncTarget: string
  target: SyncTarget
  targetLabel: string
  baseEntries: DiaryEntry[]
  resolvedEntries: DiaryEntry[]
  conflicts: PullConflict[]
  index: number
}

export type SyncProgress = {
  target: string
  message: string
  title?: string
  current?: number
  total?: number
}

export type SyncTarget =
  | { kind: 'entry'; key: string; notebookKey: string }
  | { kind: 'month'; key: string }
  | { kind: 'year'; year: string }
