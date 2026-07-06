import { formatDiaryDate } from '../domain/date'

export { formatDiaryDate }

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

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
