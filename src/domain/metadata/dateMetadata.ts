import { formatDiaryDate } from '../../utils/date'
import type { DiaryEntry } from '../types'

export function serializeDateMetadata(entry: DiaryEntry): string {
  return formatDiaryDate(entry.diaryDate)
}

export function deserializeDateMetadata(line: string | undefined, fileName: string): string | null {
  return parseDateFromHeader(line) ?? parseDateFromFileName(fileName)
}

function parseDateFromHeader(line: string | undefined): string | null {
  const match = line?.match(/^(\d{4})\/(\d{2})\/(\d{2})/)

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function parseDateFromFileName(fileName: string): string | null {
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/)

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}
