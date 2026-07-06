export function formatDiaryDate(value: string): string {
  if (!value)
    return 'No date'

  const date = new Date(`${value}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)
  const [year, month, day] = value.split('-')

  return `${year}/${month}/${day} ${weekday}`
}
