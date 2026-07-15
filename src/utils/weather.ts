import { periodConfig, weatherCodeText } from '../domain/constants'
import type { AppSettings, City, Period, TemperatureColorBand, WeatherSample } from '../domain/types'
import { formatCityDisplayName } from './city'
import { getTagBackgroundColor } from './colors'
import { getRuntimeNasProxyMode } from './runtimeConfig'

type WeatherDataSourceSettings = Pick<AppSettings, 'aliyunAirAppCode'>

type AqiDataResult = {
  value: number | null
  source: string
}

type AirPollutants = {
  pm25UgM3?: number
  pm10UgM3?: number
  coPpm?: number
  no2Ppb?: number
  so2Ppb?: number
  o3Ppb?: number
  o3EightHourPpb?: number
}

type AirPollutantsResult = {
  pollutants: AirPollutants
  source: string
}

type AqiBreakpoint = {
  lowConcentration: number
  highConcentration: number
  lowAqi: number
  highAqi: number
}

type CnemcCity = {
  Area?: string
  CityCode?: number
  Latitude?: string
  Longitude?: string
}

type CnemcCityAqi = {
  TimePoint?: string
  AQI?: number | string
  CO?: number | string
  CO_24h?: number | string
  NO2?: number | string
  NO2_24h?: number | string
  O3?: number | string
  O3_8h?: number | string
  O3_8h_24h?: number | string
  PM10?: number | string
  PM10_24h?: number | string
  PM2_5?: number | string
  PM2_5_24h?: number | string
  SO2?: number | string
  SO2_24h?: number | string
}

const MOLECULAR_WEIGHTS = {
  co: 28.01,
  no2: 46.0055,
  o3: 48,
  so2: 64.066,
}

const EPA_AQI_BREAKPOINTS: Record<string, AqiBreakpoint[]> = {
  co: [
    { lowConcentration: 0, highConcentration: 4.4, lowAqi: 0, highAqi: 50 },
    { lowConcentration: 4.5, highConcentration: 9.4, lowAqi: 51, highAqi: 100 },
    { lowConcentration: 9.5, highConcentration: 12.4, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 12.5, highConcentration: 15.4, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 15.5, highConcentration: 30.4, lowAqi: 201, highAqi: 300 },
    { lowConcentration: 30.5, highConcentration: 50.4, lowAqi: 301, highAqi: 500 },
  ],
  no2: [
    { lowConcentration: 0, highConcentration: 53, lowAqi: 0, highAqi: 50 },
    { lowConcentration: 54, highConcentration: 100, lowAqi: 51, highAqi: 100 },
    { lowConcentration: 101, highConcentration: 360, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 361, highConcentration: 649, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 650, highConcentration: 1249, lowAqi: 201, highAqi: 300 },
    { lowConcentration: 1250, highConcentration: 2049, lowAqi: 301, highAqi: 500 },
  ],
  o3EightHour: [
    { lowConcentration: 0, highConcentration: 54, lowAqi: 0, highAqi: 50 },
    { lowConcentration: 55, highConcentration: 70, lowAqi: 51, highAqi: 100 },
    { lowConcentration: 71, highConcentration: 85, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 86, highConcentration: 105, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 106, highConcentration: 200, lowAqi: 201, highAqi: 300 },
  ],
  o3OneHour: [
    { lowConcentration: 125, highConcentration: 164, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 165, highConcentration: 204, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 205, highConcentration: 404, lowAqi: 201, highAqi: 300 },
    { lowConcentration: 405, highConcentration: 604, lowAqi: 301, highAqi: 500 },
  ],
  pm10: [
    { lowConcentration: 0, highConcentration: 54, lowAqi: 0, highAqi: 50 },
    { lowConcentration: 55, highConcentration: 154, lowAqi: 51, highAqi: 100 },
    { lowConcentration: 155, highConcentration: 254, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 255, highConcentration: 354, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 355, highConcentration: 424, lowAqi: 201, highAqi: 300 },
    { lowConcentration: 425, highConcentration: 604, lowAqi: 301, highAqi: 500 },
  ],
  pm25: [
    { lowConcentration: 0, highConcentration: 9, lowAqi: 0, highAqi: 50 },
    { lowConcentration: 9.1, highConcentration: 35.4, lowAqi: 51, highAqi: 100 },
    { lowConcentration: 35.5, highConcentration: 55.4, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 55.5, highConcentration: 125.4, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 125.5, highConcentration: 225.4, lowAqi: 201, highAqi: 300 },
    { lowConcentration: 225.5, highConcentration: 325.4, lowAqi: 301, highAqi: 500 },
  ],
  so2: [
    { lowConcentration: 0, highConcentration: 35, lowAqi: 0, highAqi: 50 },
    { lowConcentration: 36, highConcentration: 75, lowAqi: 51, highAqi: 100 },
    { lowConcentration: 76, highConcentration: 185, lowAqi: 101, highAqi: 150 },
    { lowConcentration: 186, highConcentration: 304, lowAqi: 151, highAqi: 200 },
    { lowConcentration: 305, highConcentration: 604, lowAqi: 201, highAqi: 300 },
    { lowConcentration: 605, highConcentration: 1004, lowAqi: 301, highAqi: 500 },
  ],
}

export async function fetchWeatherSample(
  date: string,
  city: City,
  period: Period,
  sampleTime: '06:00' | '14:00' | '22:00',
  settings: WeatherDataSourceSettings = { aliyunAirAppCode: '' },
): Promise<WeatherSample> {
  const sampleDateTime = new Date(`${date}T${sampleTime}:00`)
  const forecastHost = 'https://api.open-meteo.com/v1/forecast'
  const archiveHost = 'https://archive-api.open-meteo.com/v1/archive'
  const weatherHosts =
    sampleDateTime > new Date() ? [forecastHost, archiveHost] : [archiveHost, forecastHost]

  const [weatherData, aqiData] = await Promise.all([
    fetchWeatherData(weatherHosts, date, city, sampleTime),
    fetchAqiData(date, city, sampleTime, settings),
  ])
  const weatherIndex = findTimeIndex(weatherData.hourly?.time ?? [], sampleTime)
  const weatherCode = Number(weatherData.hourly?.weather_code?.[weatherIndex] ?? weatherData.daily?.weather_code?.[0] ?? 0)
  const dailyWeatherCode = Number(weatherData.daily?.weather_code?.[0] ?? weatherCode)
  const dailyPrecipitationMm = Number(weatherData.daily?.precipitation_sum?.[0] ?? 0)
  const temperatureC = Number(weatherData.hourly?.temperature_2m?.[weatherIndex] ?? 0)
  const relativeHumidityRaw = weatherData.hourly?.relative_humidity_2m?.[weatherIndex]

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
    usAqi: typeof aqiData.value === 'number' ? Math.round(aqiData.value) : null,
    fetchedAt: new Date().toISOString(),
    source: aqiData.source === 'Open-Meteo' ? 'Open-Meteo' : `Open-Meteo + ${aqiData.source}`,
  }
}

async function fetchAqiData(
  date: string,
  city: City,
  sampleTime: WeatherSample['sampleTime'],
  settings: WeatherDataSourceSettings,
): Promise<AqiDataResult> {
  const isCurrentDay = date === getTodayInTimezone(city.timezone || 'UTC')

  if (isMainlandChinaCity(city) && isRecentPastDate(date, city.timezone || 'UTC', 14)) {
    const cnemcAqi = await fetchCnemcPollutants(date, city, sampleTime)
      .then(calculateUsAqiFromPollutants)
      .catch(() => null)

    if (cnemcAqi !== null)
      return { value: cnemcAqi, source: 'CNEMC' }
  }

  if (!isCurrentDay && isMainlandChinaCity(city) && settings.aliyunAirAppCode) {
    const aliyunAqi = await fetchAliyunAirPollutants(date, city, sampleTime, settings.aliyunAirAppCode)
      .then(calculateUsAqiFromPollutants)
      .catch(() => null)

    if (aliyunAqi !== null)
      return { value: aliyunAqi, source: 'Aliyun' }
  }

  const openMeteoAqi = await fetchOpenMeteoPollutants(date, city, sampleTime)
    .then(calculateUsAqiFromPollutants)

  return { value: openMeteoAqi, source: 'Open-Meteo' }
}

async function fetchCnemcPollutants(
  date: string,
  city: City,
  sampleTime: WeatherSample['sampleTime'],
): Promise<AirPollutantsResult> {
  const cityCode = await getCnemcCityCode(city)

  if (cityCode === null)
    throw new Error(`CNEMC city code unavailable for ${formatCityDisplayName(city)}`)

  const hourlyPollutants = await fetchCnemcHourlyPollutants(date, cityCode, sampleTime).catch(() => null)

  if (hourlyPollutants)
    return { pollutants: hourlyPollutants, source: 'CNEMC' }

  const dailyPollutants = await fetchCnemcDailyPollutants(date, cityCode)

  return { pollutants: dailyPollutants, source: 'CNEMC' }
}

async function fetchCnemcHourlyPollutants(
  date: string,
  cityCode: number,
  sampleTime: WeatherSample['sampleTime'],
): Promise<AirPollutants | null> {
  const url = getCnemcAirUrl('/HourChangesPublish/GetCityRealTimeAqiHistoryByCondition')
  url.searchParams.set('citycode', String(cityCode))

  const data = await fetchCnemcJson<CnemcCityAqi[]>(url, { method: 'POST' })
  const match = data.find((item) => formatCnemcDateTime(item.TimePoint) === `${date}T${sampleTime}`)

  return match ? parseCnemcPollutants(match, false) : null
}

async function fetchCnemcDailyPollutants(date: string, cityCode: number): Promise<AirPollutants> {
  const url = getCnemcAirUrl('/HourChangesPublish/GetCityDayAqiHistoryByCondition')
  url.searchParams.set('citycode', String(cityCode))

  const data = await fetchCnemcJson<CnemcCityAqi[]>(url, { method: 'POST' })
  const match = data.find((item) => formatCnemcDate(item.TimePoint) === date)

  if (!match)
    throw new Error(`CNEMC pollutant data unavailable for ${date}`)

  return parseCnemcPollutants(match, true)
}

let cnemcCityListPromise: Promise<CnemcCity[]> | null = null

async function getCnemcCityCode(city: City): Promise<number | null> {
  const cityList = await getCnemcCityList()
  const cityName = getChinaAirCityName(city)
  const cityNameWithoutSuffix = cityName ? removeChinaCitySuffix(cityName) : null

  if (cityName) {
    const namedMatch = cityList.find((item) => {
      const area = item.Area ?? ''

      return area === cityName || removeChinaCitySuffix(area) === cityNameWithoutSuffix
    })

    if (typeof namedMatch?.CityCode === 'number')
      return namedMatch.CityCode
  }

  const nearestCity = cityList
    .map((item) => ({
      city: item,
      distance: getCoordinateDistance(city, item),
    }))
    .filter((item) => item.distance !== null && item.distance <= 0.8)
    .sort((left, right) => (left.distance ?? Infinity) - (right.distance ?? Infinity))[0]?.city

  return typeof nearestCity?.CityCode === 'number' ? nearestCity.CityCode : null
}

async function getCnemcCityList(): Promise<CnemcCity[]> {
  if (!cnemcCityListPromise) {
    const url = getCnemcAirUrl('/CityData/GetAllCityRealTimeAQIModels')
    cnemcCityListPromise = fetchCnemcJson<CnemcCity[]>(url).catch((error) => {
      cnemcCityListPromise = null
      throw error
    })
  }

  return cnemcCityListPromise
}

async function fetchCnemcJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
  })

  if (!response.ok)
    throw new Error(`CNEMC air quality request failed: HTTP ${response.status}`)

  return response.json()
}

async function fetchAliyunAirPollutants(
  date: string,
  city: City,
  sampleTime: WeatherSample['sampleTime'],
  appCode: string,
): Promise<AirPollutantsResult> {
  const cityName = getAliyunAirCityName(city)

  if (!cityName)
    throw new Error(`Aliyun city name unavailable for ${formatCityDisplayName(city)}`)

  const url = getAliyunAirUrl('/api/air/city_realtime_data')
  url.searchParams.set('city', cityName)
  url.searchParams.set('ts_pubtime', `${date} ${sampleTime}:00`)

  const response = await fetch(url, {
    headers: {
      Authorization: `APPCODE ${appCode}`,
    },
  })
  const data = await response.json().catch(() => null) as {
    data?: Array<Record<string, number | string | undefined>>
    errMsg?: string
  } | null

  if (!response.ok && response.status !== 404)
    throw new Error(`Aliyun air quality request failed: HTTP ${response.status}`)

  const pollutants = parseAliyunPollutants(data?.data?.[0])

  if (!hasPollutantValue(pollutants))
    throw new Error('Aliyun pollutant data unavailable')

  return { pollutants, source: 'Aliyun' }
}

async function fetchOpenMeteoPollutants(date: string, city: City, sampleTime: string): Promise<AirPollutantsResult> {
  const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  airUrl.searchParams.set('latitude', String(city.latitude))
  airUrl.searchParams.set('longitude', String(city.longitude))
  airUrl.searchParams.set('start_date', addDays(date, -1))
  airUrl.searchParams.set('end_date', date)
  airUrl.searchParams.set('hourly', 'pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone')
  airUrl.searchParams.set('timezone', city.timezone || 'auto')

  const airData = await fetchAirQualityData(airUrl)
  const airIndex = findDateTimeIndex(airData.hourly?.time ?? [], date, sampleTime)

  if (airIndex === -1)
    throw new Error(`Open-Meteo pollutant data unavailable for ${date} ${sampleTime}`)

  return {
    pollutants: parseOpenMeteoPollutants(airData.hourly, airIndex),
    source: 'Open-Meteo',
  }
}

async function fetchAirQualityData(url: URL): Promise<{
  hourly?: {
    time?: string[]
    pm2_5?: number[]
    pm10?: number[]
    carbon_monoxide?: number[]
    nitrogen_dioxide?: number[]
    sulphur_dioxide?: number[]
    ozone?: number[]
  }
}> {
  const response = await fetch(url)

  if (!response.ok)
    throw new Error(`Air quality request failed: HTTP ${response.status} ${url.toString()}`)

  return response.json()
}

function parseCnemcPollutants(data: CnemcCityAqi, preferDailyValues: boolean): AirPollutants {
  const pm25 = preferDailyValues ? parseNumeric(data.PM2_5_24h) ?? parseNumeric(data.PM2_5) : parseNumeric(data.PM2_5_24h) ?? parseNumeric(data.PM2_5)
  const pm10 = preferDailyValues ? parseNumeric(data.PM10_24h) ?? parseNumeric(data.PM10) : parseNumeric(data.PM10_24h) ?? parseNumeric(data.PM10)
  const coMgM3 = preferDailyValues ? parseNumeric(data.CO_24h) ?? parseNumeric(data.CO) : parseNumeric(data.CO) ?? parseNumeric(data.CO_24h)
  const no2UgM3 = preferDailyValues ? parseNumeric(data.NO2_24h) ?? parseNumeric(data.NO2) : parseNumeric(data.NO2) ?? parseNumeric(data.NO2_24h)
  const so2UgM3 = preferDailyValues ? parseNumeric(data.SO2_24h) ?? parseNumeric(data.SO2) : parseNumeric(data.SO2) ?? parseNumeric(data.SO2_24h)
  const o3UgM3 = parseNumeric(data.O3)
  const o3EightHourUgM3 = preferDailyValues
    ? parseNumeric(data.O3_8h_24h) ?? parseNumeric(data.O3_8h)
    : parseNumeric(data.O3_8h) ?? parseNumeric(data.O3_8h_24h)

  return {
    pm25UgM3: pm25,
    pm10UgM3: pm10,
    coPpm: coMgM3 === undefined ? undefined : mgM3ToPpm(coMgM3, MOLECULAR_WEIGHTS.co),
    no2Ppb: no2UgM3 === undefined ? undefined : ugM3ToPpb(no2UgM3, MOLECULAR_WEIGHTS.no2),
    so2Ppb: so2UgM3 === undefined ? undefined : ugM3ToPpb(so2UgM3, MOLECULAR_WEIGHTS.so2),
    o3Ppb: o3UgM3 === undefined ? undefined : ugM3ToPpb(o3UgM3, MOLECULAR_WEIGHTS.o3),
    o3EightHourPpb: o3EightHourUgM3 === undefined ? undefined : ugM3ToPpb(o3EightHourUgM3, MOLECULAR_WEIGHTS.o3),
  }
}

function parseAliyunPollutants(data: Record<string, number | string | undefined> | undefined): AirPollutants {
  if (!data)
    return {}

  const pm25 = parseNumeric(findRecordValue(data, ['pm25', 'pm2_5', 'PM2_5', 'PM2.5']))
  const pm10 = parseNumeric(findRecordValue(data, ['pm10', 'PM10']))
  const coMgM3 = parseNumeric(findRecordValue(data, ['co', 'CO']))
  const no2UgM3 = parseNumeric(findRecordValue(data, ['no2', 'NO2']))
  const so2UgM3 = parseNumeric(findRecordValue(data, ['so2', 'SO2']))
  const o3UgM3 = parseNumeric(findRecordValue(data, ['o3', 'O3']))
  const o3EightHourUgM3 = parseNumeric(findRecordValue(data, ['o3_8h', 'O3_8h', 'o3_8h_24h', 'O3_8h_24h']))

  return {
    pm25UgM3: pm25,
    pm10UgM3: pm10,
    coPpm: coMgM3 === undefined ? undefined : mgM3ToPpm(coMgM3, MOLECULAR_WEIGHTS.co),
    no2Ppb: no2UgM3 === undefined ? undefined : ugM3ToPpb(no2UgM3, MOLECULAR_WEIGHTS.no2),
    so2Ppb: so2UgM3 === undefined ? undefined : ugM3ToPpb(so2UgM3, MOLECULAR_WEIGHTS.so2),
    o3Ppb: o3UgM3 === undefined ? undefined : ugM3ToPpb(o3UgM3, MOLECULAR_WEIGHTS.o3),
    o3EightHourPpb: o3EightHourUgM3 === undefined ? undefined : ugM3ToPpb(o3EightHourUgM3, MOLECULAR_WEIGHTS.o3),
  }
}

function parseOpenMeteoPollutants(
  hourly: Awaited<ReturnType<typeof fetchAirQualityData>>['hourly'],
  airIndex: number,
): AirPollutants {
  const pm25Average = averageWindow(hourly?.pm2_5, airIndex, 24)
  const pm10Average = averageWindow(hourly?.pm10, airIndex, 24)
  const coAverageUgM3 = averageWindow(hourly?.carbon_monoxide, airIndex, 8)
  const o3AverageUgM3 = averageWindow(hourly?.ozone, airIndex, 8)
  const no2UgM3 = hourly?.nitrogen_dioxide?.[airIndex]
  const so2UgM3 = hourly?.sulphur_dioxide?.[airIndex]
  const o3UgM3 = hourly?.ozone?.[airIndex]

  return {
    pm25UgM3: pm25Average,
    pm10UgM3: pm10Average,
    coPpm: coAverageUgM3 === undefined ? undefined : ugM3ToPpm(coAverageUgM3, MOLECULAR_WEIGHTS.co),
    no2Ppb: no2UgM3 === undefined ? undefined : ugM3ToPpb(no2UgM3, MOLECULAR_WEIGHTS.no2),
    so2Ppb: so2UgM3 === undefined ? undefined : ugM3ToPpb(so2UgM3, MOLECULAR_WEIGHTS.so2),
    o3Ppb: o3UgM3 === undefined ? undefined : ugM3ToPpb(o3UgM3, MOLECULAR_WEIGHTS.o3),
    o3EightHourPpb: o3AverageUgM3 === undefined ? undefined : ugM3ToPpb(o3AverageUgM3, MOLECULAR_WEIGHTS.o3),
  }
}

function calculateUsAqiFromPollutants(result: AirPollutantsResult): number | null {
  const pollutants = result.pollutants
  const values = [
    calculatePollutantAqi(truncateToDecimalPlaces(pollutants.pm25UgM3, 1), EPA_AQI_BREAKPOINTS.pm25),
    calculatePollutantAqi(truncateToInteger(pollutants.pm10UgM3), EPA_AQI_BREAKPOINTS.pm10),
    calculatePollutantAqi(truncateToDecimalPlaces(pollutants.coPpm, 1), EPA_AQI_BREAKPOINTS.co),
    calculatePollutantAqi(truncateToInteger(pollutants.no2Ppb), EPA_AQI_BREAKPOINTS.no2),
    calculatePollutantAqi(truncateToInteger(pollutants.so2Ppb), EPA_AQI_BREAKPOINTS.so2),
    calculateOzoneAqi(pollutants),
  ].filter((value): value is number => typeof value === 'number')

  if (!values.length)
    return null

  return Math.max(...values)
}

function calculateOzoneAqi(pollutants: AirPollutants): number | null {
  const eightHourAqi = calculatePollutantAqi(truncateToInteger(pollutants.o3EightHourPpb), EPA_AQI_BREAKPOINTS.o3EightHour)
  const oneHourAqi = calculatePollutantAqi(truncateToInteger(pollutants.o3Ppb), EPA_AQI_BREAKPOINTS.o3OneHour)
  const values = [eightHourAqi, oneHourAqi].filter((value): value is number => typeof value === 'number')

  return values.length ? Math.max(...values) : null
}

function calculatePollutantAqi(concentration: number | undefined, breakpoints: AqiBreakpoint[]): number | null {
  if (concentration === undefined)
    return null

  const breakpoint = breakpoints.find((item) => concentration >= item.lowConcentration && concentration <= item.highConcentration)
    ?? breakpoints.at(-1)

  if (!breakpoint)
    return null

  const value = ((breakpoint.highAqi - breakpoint.lowAqi) / (breakpoint.highConcentration - breakpoint.lowConcentration))
    * (concentration - breakpoint.lowConcentration)
    + breakpoint.lowAqi

  return Math.max(0, Math.round(value))
}

function hasPollutantValue(pollutants: AirPollutants): boolean {
  return Object.values(pollutants).some((value) => typeof value === 'number')
}

function parseNumeric(value: number | string | undefined): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined

  if (!value)
    return undefined

  const match = value.match(/-?\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : Number.NaN

  return Number.isFinite(parsed) ? parsed : undefined
}

function findRecordValue(
  record: Record<string, number | string | undefined>,
  keys: string[],
): number | string | undefined {
  return keys.map((key) => record[key]).find((value) => value !== undefined)
}

function averageWindow(values: number[] | undefined, endIndex: number, size: number): number | undefined {
  if (!values || endIndex < 0)
    return undefined

  const startIndex = Math.max(0, endIndex - size + 1)
  const windowValues = values
    .slice(startIndex, endIndex + 1)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (!windowValues.length)
    return undefined

  return windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
}

function ugM3ToPpb(value: number, molecularWeight: number): number {
  return (value * 24.45) / molecularWeight
}

function ugM3ToPpm(value: number, molecularWeight: number): number {
  return ugM3ToPpb(value, molecularWeight) / 1000
}

function mgM3ToPpm(value: number, molecularWeight: number): number {
  return (value * 24.45) / molecularWeight
}

function truncateToInteger(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.floor(value)
}

function truncateToDecimalPlaces(value: number | undefined, decimals: number): number | undefined {
  if (value === undefined)
    return undefined

  const multiplier = 10 ** decimals

  return Math.floor(value * multiplier) / multiplier
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

function findDateTimeIndex(times: string[], date: string, sampleTime: string): number {
  return times.findIndex((time) => time === `${date}T${sampleTime}`)
}

function getTodayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day}`
}

const ALIYUN_AIR_CITY_NAMES: Record<string, string> = {
  beijing: '北京市',
  chengdu: '成都市',
  chongqing: '重庆市',
  guangzhou: '广州市',
  hangzhou: '杭州市',
  nanjing: '南京市',
  ningbo: '宁波市',
  shanghai: '上海市',
  shenzhen: '深圳市',
  suzhou: '苏州市',
  tianjin: '天津市',
  wuhan: '武汉市',
  xian: '西安市',
}

function getCnemcAirUrl(path: string): URL {
  const shouldUseProxy =
    getRuntimeNasProxyMode() !== 'direct' &&
    typeof window !== 'undefined' &&
    (window.location.protocol === 'app:' || ['127.0.0.1', 'localhost'].includes(window.location.hostname))
  const baseUrl = shouldUseProxy
    ? `${window.location.origin}/cnemc-air-api`
    : 'https://air.cnemc.cn:18007'
  const normalizedPath = path.replace(/^\/+/, '')

  return new URL(normalizedPath, `${baseUrl}/`)
}

function getAliyunAirUrl(path: string): URL {
  const shouldUseProxy =
    getRuntimeNasProxyMode() !== 'direct' &&
    typeof window !== 'undefined' &&
    (window.location.protocol === 'app:' || ['127.0.0.1', 'localhost'].includes(window.location.hostname))
  const baseUrl = shouldUseProxy
    ? `${window.location.origin}/aliyun-air-api`
    : 'https://ncairhis.market.alicloudapi.com'
  const normalizedPath = path.replace(/^\/+/, '')

  return new URL(normalizedPath, `${baseUrl}/`)
}

function getAliyunAirCityName(city: City): string | null {
  return getChinaAirCityName(city)
}

function getChinaAirCityName(city: City): string | null {
  const displayName = formatCityDisplayName(city)
  const chineseName = displayName.match(/[\u3400-\u9fff]+/)?.[0]

  if (chineseName)
    return /市$|地区$|盟$|自治州$/.test(chineseName) ? chineseName : `${chineseName}市`

  const key = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

  return ALIYUN_AIR_CITY_NAMES[key] ?? null
}

function removeChinaCitySuffix(name: string): string {
  return name.replace(/(市|地区|盟|自治州)$/, '')
}

function isMainlandChinaCity(city: City): boolean {
  const country = city.country.trim().toLowerCase()
  const label = `${city.name} ${city.country}`.toLowerCase()
  const isChina = country === 'china' || country === '中国' || country === 'people\'s republic of china'
  const isExcludedRegion = /hong kong|macau|macao|taiwan|香港|澳门|澳門|台湾|臺灣/.test(label)
  const isWithinMainlandBounds =
    city.latitude >= 18 &&
    city.latitude <= 54 &&
    city.longitude >= 73 &&
    city.longitude <= 135

  return isChina && !isExcludedRegion && isWithinMainlandBounds
}

function isRecentPastDate(date: string, timezone: string, dayCount: number): boolean {
  const today = getTodayInTimezone(timezone)
  const targetDate = parseDateOnly(date)
  const todayDate = parseDateOnly(today)

  if (!targetDate || !todayDate || targetDate > todayDate)
    return false

  const diffDays = Math.floor((todayDate.getTime() - targetDate.getTime()) / 86_400_000)

  return diffDays >= 0 && diffDays < dayCount
}

function addDays(date: string, days: number): string {
  const parsed = parseDateOnly(date)

  if (!parsed)
    return date

  parsed.setUTCDate(parsed.getUTCDate() + days)

  return parsed.toISOString().slice(0, 10)
}

function parseDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match)
    return null

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function formatCnemcDate(value: string | undefined): string | null {
  const date = parseCnemcTimePoint(value)

  if (!date)
    return null

  return formatDateInTimezone(date, 'Asia/Shanghai')
}

function formatCnemcDateTime(value: string | undefined): string | null {
  const date = parseCnemcTimePoint(value)

  if (!date)
    return null

  return `${formatDateInTimezone(date, 'Asia/Shanghai')}T${formatHourInTimezone(date, 'Asia/Shanghai')}:00`
}

function parseCnemcTimePoint(value: string | undefined): Date | null {
  const match = value?.match(/\/Date\((\d+)\)\//)

  if (!match)
    return null

  const timestamp = Number(match[1])

  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day}`
}

function formatHourInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: timezone,
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return values.hour
}

function getCoordinateDistance(city: City, cnemcCity: CnemcCity): number | null {
  const latitude = Number(cnemcCity.Latitude)
  const longitude = Number(cnemcCity.Longitude)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return null

  const latitudeDistance = city.latitude - latitude
  const longitudeDistance = city.longitude - longitude

  return Math.sqrt(latitudeDistance * latitudeDistance + longitudeDistance * longitudeDistance)
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
