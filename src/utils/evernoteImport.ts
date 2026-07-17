import {
  DEFAULT_LOCATION_COLOR,
  DEFAULT_TAG_COLOR,
  LOCATION_COLOR_PALETTE,
  MAX_ACTIVITIES_PER_ENTRY,
  MAX_PEOPLE_PER_ENTRY,
  MAX_POINTS_OF_INTEREST_PER_ENTRY,
  periodConfig,
} from '../domain/constants'
import type { AppSettings, City, DiaryEntry, MoodScore, Period, RecentTag } from '../domain/types'
import { formatCityDisplayName, searchCitiesByName } from './city'
import { getDailyWeatherFields } from './diaryEntryHelpers'
import { getRecentCities, getRecentPeople, getRecentPointsOfInterest, getRecentTags, normalizeLocationColors } from './entries'
import { normalizeSettings } from './settings'
import { normalizePersonTag, normalizePersonTags, normalizePointOfInterestTag, normalizePointOfInterestTags, normalizeTag, normalizeTags } from './tags'
import { fetchWeatherSample } from './weather'

export type EvernoteImportDraft = {
  diaryDate: string
  locationNames: string[]
  mood: MoodScore
  summaryItems: string[]
  content: string
}

export type EvernoteImportFileParseResult = {
  drafts: EvernoteImportDraft[]
  encryptedCount: number
  unsupportedCount: number
}

export type EvernoteImportResult = {
  entry: DiaryEntry
  settings: AppSettings
  addedTags: string[]
  addedPeople: string[]
  matchedTags: string[]
  weatherFetched: boolean
}

export function parseEvernoteImportFile(text: string, fileName: string): EvernoteImportFileParseResult {
  if (isEvernoteNotesXml(text))
    return parseEvernoteNotesXml(text, fileName)

  return {
    drafts: [parseEvernoteHtml(text, fileName)],
    encryptedCount: 0,
    unsupportedCount: 0,
  }
}

export function parseEvernoteHtml(html: string, fileName: string, fallbackDate = new Date()): EvernoteImportDraft {
  const cleanHtml = html.split('\u0000').join('')
  const document = new DOMParser().parseFromString(cleanHtml, 'text/html')
  const lines = getEvernoteLines(document)
  const metadata = new Map<string, string>()
  const bodyLines: string[] = []

  for (const line of lines) {
    const match = line.match(/^(Location|Weather|Mood|Summary|Effort):\s*(.*)$/i)

    if (match) {
      metadata.set(match[1].toLowerCase(), match[2].trim())
      continue
    }

    bodyLines.push(line)
  }

  const title = document.querySelector('title')?.textContent ?? ''
  const diaryDate = parseDateFromText(title) ?? parseDateFromText(fileName) ?? toDateInputValue(fallbackDate)

  return {
    diaryDate,
    locationNames: parseLocationNames(metadata.get('location') ?? ''),
    mood: parseMood(metadata.get('mood') ?? ''),
    summaryItems: parseSummaryItems(getImportedActivitySource(metadata, diaryDate)),
    content: bodyLines.join('\n\n').trim(),
  }
}

function getImportedActivitySource(metadata: Map<string, string>, diaryDate: string): string {
  if (isLegacyEffortActivityDate(diaryDate))
    return metadata.get('effort') ?? metadata.get('summary') ?? ''

  return metadata.get('summary') ?? metadata.get('effort') ?? ''
}

function isLegacyEffortActivityDate(diaryDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(diaryDate) && diaryDate < '2025-03-01'
}

function parseEvernoteNotesXml(xmlText: string, fileName: string): EvernoteImportFileParseResult {
  const document = new DOMParser().parseFromString(xmlText.split('\u0000').join(''), 'text/xml')
  const notes = Array.from(document.querySelectorAll('note'))
  const drafts: EvernoteImportDraft[] = []
  let encryptedCount = 0
  let unsupportedCount = 0

  for (const note of notes) {
    const title = note.querySelector('title')?.textContent ?? fileName
    const contentElement = note.querySelector('content')
    const content = getEvernoteNoteContent(contentElement)

    if (content.status !== 'ok') {
      if (content.status === 'encrypted')
        encryptedCount += 1
      else
        unsupportedCount += 1

      continue
    }

    drafts.push(parseEvernoteHtml(content.html, title, parseFallbackDate(title, fileName)))
  }

  return {
    drafts,
    encryptedCount,
    unsupportedCount,
  }
}

function isEvernoteNotesXml(text: string): boolean {
  return /<en-export[\s>]/.test(text) && /<note[\s>]/.test(text)
}

function getEvernoteNoteContent(contentElement: Element | null): { status: 'ok'; html: string } | { status: 'encrypted' | 'unsupported' } {
  if (!contentElement)
    return { status: 'unsupported' }

  const encoding = contentElement.getAttribute('encoding')?.toLowerCase() ?? ''
  const rawContent = contentElement.textContent ?? ''

  if (encoding.includes('aes'))
    return { status: 'encrypted' }

  if (encoding === 'base64')
    return { status: 'ok', html: decodeBase64Text(rawContent) }

  if (!encoding)
    return { status: 'ok', html: rawContent }

  return { status: 'unsupported' }
}

function decodeBase64Text(value: string): string {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

export async function createDiaryEntryFromEvernoteImport(
  draft: EvernoteImportDraft,
  entries: DiaryEntry[],
  settings: AppSettings,
): Promise<EvernoteImportResult> {
  const cities = await resolveImportedCities(draft.locationNames, entries)
  const tagsResult = resolveImportedTags(draft.summaryItems, entries, settings)
  const peopleResult = resolveImportedPeople(draft.content, entries, settings)
  const now = new Date().toISOString()
  const weatherSamples = await fetchImportedWeather(draft.diaryDate, cities, settings).catch(() => [])
  const dailyWeatherFields = weatherSamples.length
    ? getDailyWeatherFields(weatherSamples)
    : {
        dailyWeatherCode: null,
        dailyWeatherText: 'Not fetched',
        dailyPrecipitationMm: 0,
      }
  const addedTagSet = new Set(tagsResult.addedTags)
  const tagColors = Object.fromEntries(
    tagsResult.tags.map((tag) => [tag, addedTagSet.has(tag) ? DEFAULT_TAG_COLOR : tagsResult.tagColors[tag] ?? DEFAULT_TAG_COLOR]),
  )
  const addedPeopleSet = new Set(peopleResult.addedPeople)
  const personColors = Object.fromEntries(
    peopleResult.people.map((person) => [person, addedPeopleSet.has(person) ? DEFAULT_TAG_COLOR : peopleResult.personColors[person] ?? DEFAULT_TAG_COLOR]),
  )
  const entry: DiaryEntry = {
    id: crypto.randomUUID(),
    diaryDate: draft.diaryDate,
    cities,
    locationColors: normalizeLocationColors(getImportedLocationColors(cities, entries), cities),
    ...dailyWeatherFields,
    weatherSamples,
    mood: draft.mood,
    tags: tagsResult.tags,
    tagColors,
    people: peopleResult.people,
    personColors,
    pointsOfInterest: [],
    pointOfInterestColors: {},
    content: draft.content,
    createdAt: now,
    updatedAt: now,
    savedAt: now,
    syncedAt: null,
    isEdited: true,
  }
  const nextSettings = normalizeSettings({
    ...settings,
    activityTags: {
      ...settings.activityTags,
      ...Object.fromEntries(tagsResult.addedTags.map((tag) => [tag, { name: tag, color: DEFAULT_TAG_COLOR }])),
    },
    peopleTags: {
      ...settings.peopleTags,
      ...Object.fromEntries(peopleResult.addedPeople.map((person) => [person, { name: person, color: DEFAULT_TAG_COLOR }])),
    },
  })

  return {
    entry,
    settings: nextSettings,
    addedTags: tagsResult.addedTags,
    addedPeople: peopleResult.addedPeople,
    matchedTags: tagsResult.matchedTags,
    weatherFetched: weatherSamples.length === periodConfig.length,
  }
}

function getEvernoteLines(document: Document): string[] {
  const blocks = Array.from(document.body.querySelectorAll('div, p, li, pre'))
  const leafBlocks = blocks.filter((block) => !Array.from(block.children).some((child) => isTextBlock(child)))
  const lines = leafBlocks.map((block) => normalizeImportedText(block.textContent ?? '')).filter(Boolean)

  if (lines.length)
    return lines

  return normalizeImportedText(document.body.textContent ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function isTextBlock(element: Element): boolean {
  return ['DIV', 'P', 'LI', 'PRE'].includes(element.tagName)
}

function normalizeImportedText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

function parseFallbackDate(title: string, fileName: string): Date {
  const parsedDate = parseDateFromText(title) ?? parseDateFromText(fileName)

  if (!parsedDate)
    return new Date()

  return new Date(`${parsedDate}T12:00:00`)
}

function parseDateFromText(value: string): string | null {
  const compact = value.match(/(^|[^\d])(\d{4})(\d{2})(\d{2})([^\d]|$)/)

  if (compact)
    return `${compact[2]}-${compact[3]}-${compact[4]}`

  const separated = value.match(/(\d{4})[-_/](\d{1,2})[-_/](\d{1,2})/)

  if (separated)
    return `${separated[1]}-${separated[2].padStart(2, '0')}-${separated[3].padStart(2, '0')}`

  return null
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseLocationNames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\s+[-–—]\s+|[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function parseMood(value: string): MoodScore {
  const [morning, afternoon, evening] = value
    .split(/[-–—/,\s]+/)
    .map((item) => Number.parseInt(item, 10))
    .map(clampMood)

  return {
    morning: morning ?? 5,
    afternoon: afternoon ?? morning ?? 5,
    evening: evening ?? afternoon ?? morning ?? 5,
  }
}

function clampMood(value: number): number {
  if (Number.isNaN(value))
    return 5

  return Math.max(0, Math.min(10, Math.round(value)))
}

function parseSummaryItems(value: string): string[] {
  return value
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function resolveImportedCities(locationNames: string[], entries: DiaryEntry[]): Promise<City[]> {
  const knownCities = getKnownCities(entries)
  const cities: City[] = []

  for (const name of locationNames) {
    const knownCity = knownCities.find((city) => isSameLocationName(city, name))

    if (knownCity) {
      cities.push(knownCity)
      continue
    }

    const [city] = await searchCitiesByName(name, 1).catch(() => [])

    if (city)
      cities.push(city)
  }

  return cities.length ? dedupeCities(cities) : [knownCities[0]]
}

function getKnownCities(entries: DiaryEntry[]): City[] {
  const cities = new Map<string, City>()

  for (const recentCity of getRecentCities(entries))
    cities.set(recentCity.city.id, recentCity.city)

  return Array.from(cities.values())
}

function isSameLocationName(city: City, name: string): boolean {
  const locationName = normalizeLocationName(name)

  return [
    city.name,
    formatCityDisplayName(city),
    city.name.split(',')[0] ?? '',
  ].some((value) => normalizeLocationName(value) === locationName)
}

function normalizeLocationName(value: string): string {
  return value.trim().toLowerCase()
}

function dedupeCities(cities: City[]): City[] {
  return Array.from(new Map(cities.map((city) => [city.id, city])).values())
}

async function fetchImportedWeather(diaryDate: string, cities: City[], settings: AppSettings) {
  const cityByPeriod = getImportedWeatherCityByPeriod(diaryDate, cities)

  return Promise.all(
    periodConfig.map((config) => {
      const city = cityByPeriod[config.period]

      if (!city)
        throw new Error(`Missing weather location for ${config.label}`)

      return fetchWeatherSample(diaryDate, city, config.period, config.sampleTime, settings)
    }),
  )
}

function getImportedWeatherCityByPeriod(diaryDate: string, cities: City[]): Record<Period, City | undefined> {
  const [firstCity, secondCity, thirdCity] = cities

  if (thirdCity) {
    return {
      morning: firstCity,
      afternoon: secondCity,
      evening: thirdCity,
    }
  }

  if (isFriday(diaryDate) && secondCity) {
    return {
      morning: firstCity,
      afternoon: firstCity,
      evening: secondCity,
    }
  }

  return {
    morning: firstCity,
    afternoon: secondCity ?? firstCity,
    evening: secondCity ?? firstCity,
  }
}

function isFriday(diaryDate: string): boolean {
  return new Date(`${diaryDate}T12:00:00`).getDay() === 5
}

function getImportedLocationColors(cities: City[], entries: DiaryEntry[]): Record<string, string> {
  const recentColors = new Map(getRecentCities(entries).map((recentCity) => [recentCity.city.id, recentCity.color]))
  const colors: Record<string, string> = {}

  cities.forEach((city, index) => {
    colors[city.id] = recentColors.get(city.id) ?? LOCATION_COLOR_PALETTE[index % LOCATION_COLOR_PALETTE.length] ?? DEFAULT_LOCATION_COLOR
  })

  return colors
}

function resolveImportedTags(summaryItems: string[], entries: DiaryEntry[], settings: AppSettings) {
  const existingTags = getExistingActivityTags(entries, settings)
  const tags: string[] = []
  const addedTags: string[] = []
  const matchedTags: string[] = []
  const tagColors: Record<string, string> = {}

  for (const item of summaryItems) {
    const match = findBestActivityTag(item, existingTags)
    const tag = match?.name ?? normalizeTag(item)

    if (!tag)
      continue

    tagColors[tag] = match?.color ?? DEFAULT_TAG_COLOR

    if (match)
      matchedTags.push(tag)
    else
      addedTags.push(tag)

    tags.push(tag)
  }

  const normalizedTags = normalizeTags(tags).slice(0, MAX_ACTIVITIES_PER_ENTRY)

  return {
    tags: normalizedTags,
    addedTags: normalizeTags(addedTags).filter((tag) => normalizedTags.includes(tag)),
    matchedTags: normalizeTags(matchedTags).filter((tag) => normalizedTags.includes(tag)),
    tagColors,
  }
}

export function analyzeActivitiesFromContent(content: string, entries: DiaryEntry[], settings: AppSettings) {
  const summaryItems = extractActivityItemsFromContent(content)
  const existingTags = getExistingActivityTags(entries, settings)
  const matchedContentTags = existingTags
    .filter((tag) => contentIncludesActivityTag(content, tag.name))
    .map((tag) => tag.name)

  return resolveImportedTags([...summaryItems, ...matchedContentTags], entries, settings)
}

export function analyzePeopleFromContent(content: string, entries: DiaryEntry[], settings: AppSettings) {
  return resolveImportedPeople(content, entries, settings)
}

export function analyzePointsOfInterestFromContent(
  content: string,
  people: string[],
  entries: DiaryEntry[],
  settings: AppSettings,
) {
  const existingPointsOfInterest = getExistingPointOfInterestTags(entries, settings)
  const excludedPeople = new Set(people.map(normalizePersonTag).filter(Boolean))
  const pointsOfInterest: string[] = []
  const addedPointsOfInterest: string[] = []
  const pointOfInterestColors: Record<string, string> = {}

  for (const rawPointOfInterest of extractChinesePointOfInterestCandidates(content)) {
    const pointOfInterest = normalizePointOfInterestTag(rawPointOfInterest)

    if (!pointOfInterest || excludedPeople.has(normalizePersonTag(pointOfInterest)))
      continue

    const match = existingPointsOfInterest.find((tag) => normalizePointOfInterestTag(tag.name) === pointOfInterest)
    pointOfInterestColors[pointOfInterest] = match?.color ?? DEFAULT_TAG_COLOR

    if (!match)
      addedPointsOfInterest.push(pointOfInterest)

    pointsOfInterest.push(pointOfInterest)
  }

  const normalizedPointsOfInterest = normalizePointOfInterestTags(pointsOfInterest).slice(0, MAX_POINTS_OF_INTEREST_PER_ENTRY)

  return {
    pointsOfInterest: normalizedPointsOfInterest,
    addedPointsOfInterest: normalizePointOfInterestTags(addedPointsOfInterest)
      .filter((pointOfInterest) => normalizedPointsOfInterest.includes(pointOfInterest)),
    pointOfInterestColors,
  }
}

function resolveImportedPeople(content: string, entries: DiaryEntry[], settings: AppSettings) {
  const existingPeople = getExistingPeopleTags(entries, settings)
  const people: string[] = []
  const addedPeople: string[] = []
  const personColors: Record<string, string> = {}

  for (const rawPerson of extractChinesePeopleFromEnglishText(content)) {
    const person = normalizePersonTag(rawPerson)

    if (!person)
      continue

    const match = existingPeople.find((tag) => normalizePersonTag(tag.name) === person)
    personColors[person] = match?.color ?? DEFAULT_TAG_COLOR

    if (!match)
      addedPeople.push(person)

    people.push(person)
  }

  const normalizedPeople = normalizePersonTags(people).slice(0, MAX_PEOPLE_PER_ENTRY)

  return {
    people: normalizedPeople,
    addedPeople: normalizePersonTags(addedPeople).filter((person) => normalizedPeople.includes(person)),
    personColors,
  }
}

function extractActivityItemsFromContent(content: string): string[] {
  const items: string[] = []

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^(Summary|Effort|Activities?):\s*(.*)$/i)

    if (match?.[2])
      items.push(...parseSummaryItems(match[2]))
  }

  return items
}

function contentIncludesActivityTag(content: string, tag: string): boolean {
  const normalizedContent = content.toLowerCase()
  const normalizedTag = tag.toLowerCase()

  if (!normalizedTag)
    return false

  return normalizedContent.includes(normalizedTag)
}

function getExistingActivityTags(entries: DiaryEntry[], settings: AppSettings): RecentTag[] {
  const tags = new Map<string, string>()

  for (const tag of getRecentTags(entries))
    tags.set(tag.name, tag.color)

  for (const [name, tag] of Object.entries(settings.activityTags))
    tags.set(name, tag.color)

  return Array.from(tags.entries()).map(([name, color]) => ({ id: name, name, color }))
}

function getExistingPeopleTags(entries: DiaryEntry[], settings: AppSettings): RecentTag[] {
  const tags = new Map<string, string>()

  for (const tag of getRecentPeople(entries))
    tags.set(tag.name, tag.color)

  for (const [name, tag] of Object.entries(settings.peopleTags))
    tags.set(name, tag.color)

  return Array.from(tags.entries()).map(([name, color]) => ({ id: name, name, color }))
}

function getExistingPointOfInterestTags(entries: DiaryEntry[], settings: AppSettings): RecentTag[] {
  const tags = new Map<string, string>()

  for (const tag of getRecentPointsOfInterest(entries))
    tags.set(tag.name, tag.color)

  for (const [name, tag] of Object.entries(settings.pointOfInterestTags))
    tags.set(name, tag.color)

  return Array.from(tags.entries()).map(([name, color]) => ({ id: name, name, color }))
}

function extractChinesePeopleFromEnglishText(content: string): string[] {
  const people = new Set<string>()
  const paragraphs = content.split(/\n{1,}/)

  for (const paragraph of paragraphs) {
    if (!/[a-zA-Z]/.test(paragraph))
      continue

    for (const match of paragraph.matchAll(/(?<![\u3400-\u9fff])[\u3400-\u9fff]{2,3}(?![\u3400-\u9fff])/g))
      people.add(match[0])
  }

  return Array.from(people)
}

function extractChinesePointOfInterestCandidates(content: string): string[] {
  const pointsOfInterest = new Set<string>()

  for (const match of content.matchAll(/(?<![\u3400-\u9fff])[\u3400-\u9fff]{2,12}(?![\u3400-\u9fff])/g))
    pointsOfInterest.add(match[0])

  return Array.from(pointsOfInterest)
}

function findBestActivityTag(rawItem: string, tags: RecentTag[]): RecentTag | null {
  const item = normalizeTag(rawItem)

  if (!item)
    return null

  const exactMatch = tags.find((tag) => normalizeTag(tag.name).toLowerCase() === item.toLowerCase())

  if (exactMatch)
    return exactMatch

  let bestMatch: RecentTag | null = null
  let bestScore = 0

  for (const tag of tags) {
    const score = getTagMatchScore(item, tag.name)

    if (score > bestScore) {
      bestScore = score
      bestMatch = tag
    }
  }

  return bestScore >= 0.5 ? bestMatch : null
}

function getTagMatchScore(a: string, b: string): number {
  const aTokens = getComparableTokens(a)
  const bTokens = getComparableTokens(b)

  if (!aTokens.length || !bTokens.length)
    return 0

  const overlap = aTokens.filter((token) => bTokens.includes(token)).length
  const smallerCount = Math.min(aTokens.length, bTokens.length)

  return overlap / smallerCount
}

function getComparableTokens(value: string): string[] {
  return normalizeTag(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/s$/, ''))
}
