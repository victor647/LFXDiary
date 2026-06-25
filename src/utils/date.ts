export function getNotebookKey(date: string): string {
  return date.slice(0, 7)
}

export function getNotebookYear(date: string): string {
  return date.slice(0, 4)
}

export function formatNotebookLabel(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(`${year}-${month}-01T12:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date)
}

export function formatDiaryDate(value: string): string {
  if (!value)
    return 'No date'

  const date = new Date(`${value}T12:00:00`)
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)
  const [year, month, day] = value.split('-')

  return `${year}/${month}/${day} ${weekday}`
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
