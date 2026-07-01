import type { DiaryEntry } from '../domain/types'
import { formatDiaryDate } from '../utils/date'

type PullConflictDialogProps = {
  localEntry: DiaryEntry
  cloudEntry: DiaryEntry
  conflictIndex: number
  conflictCount: number
  onUseLocal: () => void
  onUseCloud: () => void
  onCancel: () => void
}

type DiffRow = {
  localText: string | null
  localLineNumber: number | null
  cloudText: string | null
  cloudLineNumber: number | null
  kind: 'same' | 'local' | 'cloud'
}

export function PullConflictDialog({
  localEntry,
  cloudEntry,
  conflictIndex,
  conflictCount,
  onUseLocal,
  onUseCloud,
  onCancel,
}: PullConflictDialogProps) {
  const rows = buildLineDiff(localEntry.content, cloudEntry.content)

  return (
    <div className="dialog-backdrop">
      <div className="pull-conflict-dialog">
        <div>
          <h2>Resolve pull conflict</h2>
          <p>
            {formatDiaryDate(cloudEntry.diaryDate)} has different local and cloud body text. Choose which version to keep.
          </p>
        </div>
        <div className="pull-conflict-meta">
          Conflict {conflictIndex + 1} of {conflictCount}
        </div>
        <div className="pull-diff-grid">
          <DiffPane title="Local" rows={rows} side="local" />
          <DiffPane title="Cloud" rows={rows} side="cloud" />
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel Pull
          </button>
          <button type="button" onClick={onUseLocal}>
            Use Local
          </button>
          <button type="button" onClick={onUseCloud}>
            Use Cloud
          </button>
        </div>
      </div>
    </div>
  )
}

function DiffPane({ title, rows, side }: { title: string; rows: DiffRow[]; side: 'local' | 'cloud' }) {
  return (
    <section className="pull-diff-pane">
      <h3>{title}</h3>
      <div className="pull-diff-lines">
        {rows.map((row, index) => {
          const isEmpty = side === 'local' ? row.kind === 'cloud' : row.kind === 'local'
          const isChanged = side === 'local' ? row.kind === 'local' : row.kind === 'cloud'
          const lineNumber = side === 'local' ? row.localLineNumber : row.cloudLineNumber
          const text = side === 'local' ? row.localText : row.cloudText

          return (
            <div
              className={[
                'pull-diff-line',
                isEmpty ? 'empty' : '',
                isChanged ? (side === 'local' ? 'removed' : 'added') : '',
              ].filter(Boolean).join(' ')}
              key={`${side}-${index}`}
            >
              <span className="pull-diff-line-number">{lineNumber ?? ''}</span>
              <span>{isEmpty ? '' : text || ' '}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function buildLineDiff(localContent: string, cloudContent: string): DiffRow[] {
  const localLines = splitLines(localContent)
  const cloudLines = splitLines(cloudContent)
  const table = buildLongestCommonSubsequenceTable(localLines, cloudLines)
  const rows: DiffRow[] = []
  let localIndex = 0
  let cloudIndex = 0

  while (localIndex < localLines.length || cloudIndex < cloudLines.length) {
    if (localIndex < localLines.length && cloudIndex < cloudLines.length && localLines[localIndex] === cloudLines[cloudIndex]) {
      rows.push({
        localText: localLines[localIndex],
        localLineNumber: localIndex + 1,
        cloudText: cloudLines[cloudIndex],
        cloudLineNumber: cloudIndex + 1,
        kind: 'same',
      })
      localIndex += 1
      cloudIndex += 1
    } else if (
      cloudIndex < cloudLines.length &&
      (localIndex === localLines.length || table[localIndex][cloudIndex + 1] >= table[localIndex + 1][cloudIndex])
    ) {
      rows.push({
        localText: null,
        localLineNumber: null,
        cloudText: cloudLines[cloudIndex],
        cloudLineNumber: cloudIndex + 1,
        kind: 'cloud',
      })
      cloudIndex += 1
    } else if (localIndex < localLines.length) {
      rows.push({
        localText: localLines[localIndex],
        localLineNumber: localIndex + 1,
        cloudText: null,
        cloudLineNumber: null,
        kind: 'local',
      })
      localIndex += 1
    }
  }

  return rows.length ? rows : [{
    localText: '',
    localLineNumber: 1,
    cloudText: '',
    cloudLineNumber: 1,
    kind: 'same',
  }]
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n')
}

function buildLongestCommonSubsequenceTable(localLines: string[], cloudLines: string[]): number[][] {
  const table = Array.from({ length: localLines.length + 1 }, () => Array.from({ length: cloudLines.length + 1 }, () => 0))

  for (let localIndex = localLines.length - 1; localIndex >= 0; localIndex -= 1) {
    for (let cloudIndex = cloudLines.length - 1; cloudIndex >= 0; cloudIndex -= 1) {
      table[localIndex][cloudIndex] =
        localLines[localIndex] === cloudLines[cloudIndex]
          ? table[localIndex + 1][cloudIndex + 1] + 1
          : Math.max(table[localIndex + 1][cloudIndex], table[localIndex][cloudIndex + 1])
    }
  }

  return table
}
