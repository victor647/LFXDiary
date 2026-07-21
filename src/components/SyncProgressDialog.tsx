import { useRef, useEffect } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import type { SyncLogLine } from '../domain/types'

type SyncProgressDialogProps = {
  target: string
  message: string
  title?: string
  current?: number
  total?: number
  logLines?: SyncLogLine[]
  errorLog?: string
  onClose?: () => void
}

function LogLineIcon({ level, isLatest }: { level: SyncLogLine['level']; isLatest: boolean }) {
  if (level === 'error')
    return <X size={14} strokeWidth={2.8} />

  if (level === 'success' || (level === 'info' && !isLatest))
    return <Check size={14} strokeWidth={2.8} />

  return <LoaderCircle size={14} strokeWidth={2.4} className="sync-progress-icon-spin" />
}

export function SyncProgressDialog({ message, target, title, current, total, logLines, errorLog, onClose }: SyncProgressDialogProps) {
  const logEndRef = useRef<HTMLDivElement>(null)
  const hasProgress = typeof current === 'number' && typeof total === 'number' && total > 0
  const progressPercent = hasProgress ? Math.min(100, Math.max(0, (current / total) * 100)) : 0
  const hasLogLines = logLines && logLines.length > 0

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines])

  return (
    <div className="dialog-backdrop sync-progress-backdrop" role="presentation">
      <div className="sync-progress-dialog" role="dialog" aria-modal="true" aria-label="Sync in progress">
        <div className="sync-progress-spinner" aria-hidden="true">
          <LoaderCircle size={24} strokeWidth={2.4} />
        </div>
        <div className="sync-progress-copy" aria-live="polite">
          <div className="compact-title">{title ?? `Syncing ${target}`}</div>

          {hasLogLines && (
            <div className="sync-progress-log">
              {logLines.map((line, i) => {
                const isLatest = i === logLines.length - 1
                const statusClass = line.level === 'error' ? 'error' : isLatest ? 'active' : 'done'
                return (
                  <p key={i} className={`sync-progress-log-line ${statusClass}`}>
                    <span className="sync-progress-log-icon">
                      <LogLineIcon level={line.level} isLatest={isLatest} />
                    </span>
                    {line.text}
                  </p>
                )
              })}
              <div ref={logEndRef} />
            </div>
          )}

          {hasProgress && (
            <div className="sync-progress-meter" aria-label={`Progress ${current} of ${total}`}>
              <div className="sync-progress-count">{current}/{total}</div>
              <div className="sync-progress-track" aria-hidden="true">
                <div className="sync-progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}

          {!hasLogLines && !hasProgress && <p>{message}</p>}

          {errorLog && (
            <div className="sync-progress-error">
              <pre>{errorLog}</pre>
            </div>
          )}

          {errorLog && onClose && (
            <div className="sync-progress-actions">
              <button type="button" onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
