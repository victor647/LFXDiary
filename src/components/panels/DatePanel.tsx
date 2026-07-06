import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import type { AppSettings, DiaryEntry } from '../../domain/types'
import { formatDiaryDate, toDateInputValue } from '../../utils/date'

type DatePanelProps = {
  draft: DiaryEntry
  settings: AppSettings
  onUpdateDraft: (patch: Partial<DiaryEntry>) => void
  onStatusChange: (message: string) => void
}

export function DatePanel({
  draft,
  settings,
  onUpdateDraft,
  onStatusChange,
}: DatePanelProps) {
  const datePickerRef = useRef<HTMLInputElement>(null)
  const maxDate = toDateInputValue(new Date())
  const isNextDayDisabled = draft.diaryDate >= maxDate
  const daysFromBirth = getInclusiveDayCount(settings.birthDate, draft.diaryDate)

  function updateDiaryDate(value: string) {
    if (!value)
      return

    const nextDate = value > maxDate ? maxDate : value
    onUpdateDraft({
      diaryDate: nextDate,
      dailyWeatherCode: null,
      dailyWeatherText: 'Not fetched',
      dailyPrecipitationMm: 0,
      weatherSamples: [],
    })
    onStatusChange('Date changed. Weather needs an update.')
  }

  function shiftDiaryDate(dayDelta: number) {
    const date = new Date(`${draft.diaryDate}T12:00:00`)
    date.setDate(date.getDate() + dayDelta)
    const nextDate = toDateInputValue(date)

    if (nextDate > maxDate)
      return

    updateDiaryDate(nextDate)
  }

  function openDatePicker() {
    const input = datePickerRef.current

    if (!input)
      return

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void }

    if (pickerInput.showPicker)
      pickerInput.showPicker()
    else
      input.click()
  }

  return (
    <div className="compact-panel date-panel">
      <div className="compact-title">
        <CalendarDays size={16} />
        Date
      </div>
      <div className="date-row">
        <div className="date-stepper">
          <input
            readOnly
            className="date-display-input"
            value={formatDiaryDate(draft.diaryDate)}
            onClick={openDatePicker}
            aria-label="Selected date"
          />
          <div className="date-birth-counter" title={daysFromBirth ? `Days from birth: ${daysFromBirth}` : 'Days from birth'}>
            Days from birth: {daysFromBirth ?? '--'}
          </div>
          <div className="date-step-buttons">
            <button type="button" onClick={() => shiftDiaryDate(-1)} title="Previous day">
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              disabled={isNextDayDisabled}
              onClick={() => shiftDiaryDate(1)}
              title="Next day"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <button type="button" className="date-picker-button" onClick={openDatePicker} title="Pick date">
            <CalendarDays size={15} />
          </button>
          <input
            ref={datePickerRef}
            className="native-date-input"
            type="date"
            value={draft.diaryDate}
            max={maxDate}
            onChange={(event) => updateDiaryDate(event.target.value)}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </div>
      <div className="date-meta">
        <span>Created {formatTimestamp(draft.createdAt)}</span>
        <span>Saved {draft.savedAt ? formatTimestamp(draft.savedAt) : 'Not saved yet'}</span>
      </div>
    </div>
  )
}

function getInclusiveDayCount(startDate: string | undefined, endDate: string | undefined): number | null {
  const start = parseDateValue(startDate)
  const end = parseDateValue(endDate)

  if (start === null || end === null)
    return null

  const dayCount = Math.floor((end - start) / 86400000) + 1
  return Math.max(0, dayCount)
}

function parseDateValue(value: string | undefined): number | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match)
    return null

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)

  if (!Number.isFinite(timestamp) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null

  return timestamp
}

function formatTimestamp(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime()))
    return 'Unknown'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}/${month}/${day} ${hour}:${minute}`
}
