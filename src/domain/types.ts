export type TagId = string

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
  /** GUIDs referencing activity tags */
  tags: TagId[]
  /** GUID → color for activity tags */
  tagColors: Record<TagId, string>
  /** GUIDs referencing person tags */
  people: TagId[]
  /** GUID → color for person tags */
  personColors: Record<TagId, string>
  /** GUIDs referencing point-of-interest tags */
  pointsOfInterest: TagId[]
  /** GUID → color for POI tags */
  pointOfInterestColors: Record<TagId, string>
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
  id: TagId
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
  theme: 'light' | 'dark' | 'system'
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
  /** Tag name → metadata */
  activityTags: Record<TagId, {
    color: string
    pinned?: boolean
  }>
  personColorGroupNames: Record<string, string>
  /** Tag name → metadata */
  peopleTags: Record<TagId, {
    color: string
    pinned?: boolean
  }>
  pointOfInterestColorGroupNames: Record<string, string>
  /** Tag name → metadata */
  pointOfInterestTags: Record<TagId, {
    color: string
    pinned?: boolean
  }>
  locationColorGroupNames: Record<string, string>
  temperatureThresholds: TemperatureThresholds
  dataFolder?: string
}

export type DiaryCatalog = {
  version: 2
  updatedAt: string
  locations: Record<string, {
    city: City
    color: string
    pinned?: boolean
    entries: string[]
  }>
  /** Tag name → catalog entry */
  activities: Record<TagId, {
    color: string
    pinned?: boolean
    entries: string[]
  }>
  /** Tag name → catalog entry */
  people: Record<TagId, {
    color: string
    pinned?: boolean
    entries: string[]
  }>
  /** Tag name → catalog entry */
  pointsOfInterest: Record<TagId, {
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
  version: 2
  year: string
  locations: Record<string, string[]>
  /** GUID → entry references for activities */
  activities: Record<TagId, string[]>
  /** GUID → entry references for people */
  people: Record<TagId, string[]>
  /** GUID → entry references for points of interest */
  pointsOfInterest: Record<TagId, string[]>
}

export type TagFilterKind = 'location' | 'activity' | 'person' | 'pointOfInterest'

export type TagFilterSelection = {
  kind: TagFilterKind
  tag: TagId
}

export type TagFilter = {
  kind: TagFilterKind | ''
  color: string
  tag: string
  tags: TagFilterSelection[]
}

export type TagFilterOption = {
  kind: TagFilterKind
  value: TagId
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

export type SyncLogLine = {
  text: string
  level: 'info' | 'success' | 'error'
}

export type SyncProgress = {
  target: string
  message: string
  title?: string
  current?: number
  total?: number
  logLines?: SyncLogLine[]
  errorLog?: string
}

export type SyncTarget =
  | { kind: 'entry'; key: string; notebookKey: string }
  | { kind: 'month'; key: string }
  | { kind: 'year'; year: string }
