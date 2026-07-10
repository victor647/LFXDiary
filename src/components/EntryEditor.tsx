import { ChevronRight } from 'lucide-react'
import { type ChangeEvent, type KeyboardEvent, type UIEvent, useMemo, useRef, useState } from 'react'
import { DEFAULT_TAG_COLOR, TAG_COLOR_PALETTE } from '../domain/constants'
import { getTagBackgroundColor, getTagTextColor } from '../utils/colors'

export type PersonMentionOption = {
  name: string
  color: string
}

type EntryEditorProps = {
  content: string
  people: string[]
  peopleOptions: PersonMentionOption[]
  personColorGroupNames: Record<string, string>
  personColors: Record<string, string>
  pointsOfInterest: string[]
  pointOfInterestColors: Record<string, string>
  saveLabel: string
  onContentChange: (content: string) => void
  onPersonMention: (person: PersonMentionOption, content: string) => void
  onSave: () => void
}

type MentionState = {
  start: number
  end: number
  query: string
  position: { top: number; left: number }
}

export function EntryEditor({
  content,
  people,
  peopleOptions,
  personColorGroupNames,
  personColors,
  pointsOfInterest,
  pointOfInterestColors,
  saveLabel,
  onContentChange,
  onPersonMention,
  onSave,
}: EntryEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const richTextRef = useRef<HTMLDivElement>(null)
  const [mentionState, setMentionState] = useState<MentionState | null>(null)
  const [expandedMentionColor, setExpandedMentionColor] = useState(DEFAULT_TAG_COLOR)
  const mentionOptions = useMemo(() => {
    if (!mentionState)
      return []

    const query = mentionState.query.trim().toLowerCase()

    return peopleOptions
      .filter((person) => !query || person.name.toLowerCase().includes(query))
      .slice(0, 8)
  }, [mentionState, peopleOptions])
  const mentionColorGroups = useMemo(() => {
    const groups = new Map<string, PersonMentionOption[]>()

    for (const person of mentionOptions) {
      const color = person.color || DEFAULT_TAG_COLOR
      groups.set(color, [...(groups.get(color) ?? []), person])
    }

    const customColors = Array.from(groups.keys()).filter((color) => !TAG_COLOR_PALETTE.includes(color))
    return [...TAG_COLOR_PALETTE, ...customColors]
      .map((color) => ({ color, people: groups.get(color) ?? [] }))
      .filter((group) => group.people.length)
  }, [mentionOptions])
  const visibleExpandedMentionColor = mentionColorGroups.some((group) => group.color === expandedMentionColor)
    ? expandedMentionColor
    : mentionColorGroups[0]?.color ?? DEFAULT_TAG_COLOR

  function syncRichTextScroll(event: UIEvent<HTMLTextAreaElement>) {
    const richText = richTextRef.current

    if (!richText)
      return

    richText.scrollTop = event.currentTarget.scrollTop
    richText.scrollLeft = event.currentTarget.scrollLeft
  }

  function updateMentionState(value: string, caretIndex: number | null) {
    if (caretIndex === null) {
      setMentionState(null)
      return
    }

    const beforeCaret = value.slice(0, caretIndex)
    const atIndex = beforeCaret.lastIndexOf('@')

    if (atIndex === -1) {
      setMentionState(null)
      return
    }

    const query = beforeCaret.slice(atIndex + 1)

    if (/[\s\n]/.test(query) || query.length > 24) {
      setMentionState(null)
      return
    }

    setMentionState({
      start: atIndex,
      end: caretIndex,
      query,
      position: getTextareaCaretPosition(textareaRef.current, caretIndex),
    })
  }

  function handleContentChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onContentChange(event.target.value)
    updateMentionState(event.target.value, event.target.selectionStart)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape')
      setMentionState(null)
  }

  function handleSelectionChange() {
    const textarea = textareaRef.current

    if (!textarea || !mentionState)
      return

    updateMentionState(textarea.value, textarea.selectionStart)
  }

  function chooseMention(person: PersonMentionOption) {
    if (!mentionState)
      return

    const nextCharacter = content[mentionState.end] ?? ''
    const suffix = nextCharacter && !/\s/.test(nextCharacter) ? ' ' : ''
    const nextContent = `${content.slice(0, mentionState.start)}${person.name}${suffix}${content.slice(mentionState.end)}`
    const nextCaret = mentionState.start + person.name.length + suffix.length

    onPersonMention(person, nextContent)
    setMentionState(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  return (
    <section className="entry-body">
      <label>Entry</label>
      <div className="entry-rich-text-shell">
        <div className="entry-rich-text-layer" ref={richTextRef} aria-hidden="true">
          <RichTextContent
            content={content}
            people={people}
            personColors={personColors}
            pointsOfInterest={pointsOfInterest}
            pointOfInterestColors={pointOfInterestColors}
          />
        </div>
        <textarea
          className="entry-rich-text-input"
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          onClick={handleSelectionChange}
          onKeyUp={handleSelectionChange}
          onScroll={syncRichTextScroll}
          placeholder="Write today's journal in English..."
          spellCheck
        />
        {mentionState && (
          <div className="activity-recent-popover entry-mention-popover" style={mentionState.position}>
            {mentionColorGroups.length ? (
              mentionColorGroups.map((group) => {
                const isExpanded = group.color === visibleExpandedMentionColor
                const groupName = personColorGroupNames[group.color] || group.color

                return (
                  <div
                    className="activity-color-group"
                    key={group.color}
                    onMouseEnter={() => setExpandedMentionColor(group.color)}
                  >
                    <button
                      className="activity-color-toggle"
                      type="button"
                      title={groupName}
                      onClick={() => setExpandedMentionColor(group.color)}
                    >
                      <span className="activity-color-toggle-main">
                        <span className="activity-color-dot" style={{ backgroundColor: group.color }} />
                        <span>{groupName}</span>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                    {isExpanded && (
                      <div className="activity-color-options">
                        {group.people.map((person) => (
                          <button
                            key={person.name}
                            type="button"
                            style={{
                              backgroundColor: getTagBackgroundColor(person.color),
                              borderColor: person.color,
                              color: getTagTextColor(person.color),
                            }}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseMention(person)}
                          >
                            {person.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <span>No people</span>
            )}
          </div>
        )}
      </div>
      <button className="entry-save-button" type="button" onClick={onSave}>
        {saveLabel}
      </button>
    </section>
  )
}

function getTextareaCaretPosition(textarea: HTMLTextAreaElement | null, caretIndex: number): { top: number; left: number } {
  if (!textarea)
    return { top: 40, left: 14 }

  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const marker = document.createElement('span')
  const shellRect = textarea.parentElement?.getBoundingClientRect()
  const textareaRect = textarea.getBoundingClientRect()
  const properties = [
    'boxSizing',
    'width',
    'height',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textTransform',
    'textAlign',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
  ] as const

  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordBreak = 'break-word'
  mirror.style.overflow = 'hidden'

  for (const property of properties)
    mirror.style[property] = style[property]

  mirror.textContent = textarea.value.slice(0, caretIndex)
  marker.textContent = '\u200b'
  mirror.append(marker)
  document.body.append(mirror)

  const markerRect = marker.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  const shellLeft = shellRect?.left ?? textareaRect.left
  const shellTop = shellRect?.top ?? textareaRect.top
  const left = textareaRect.left - shellLeft + markerRect.left - mirrorRect.left - textarea.scrollLeft
  const top = textareaRect.top - shellTop + markerRect.top - mirrorRect.top - textarea.scrollTop + Number.parseFloat(style.lineHeight || '18') + 6

  mirror.remove()

  return {
    left: Math.max(8, Math.min(left, textarea.clientWidth - 220)),
    top: Math.max(8, Math.min(top, textarea.clientHeight - 80)),
  }
}

function RichTextContent({
  content,
  people,
  personColors,
  pointsOfInterest,
  pointOfInterestColors,
}: {
  content: string
  people: string[]
  personColors: Record<string, string>
  pointsOfInterest: string[]
  pointOfInterestColors: Record<string, string>
}) {
  const tokens = tokenizeRichTextTags(content, people, pointsOfInterest)

  return (
    <div className="entry-rich-text-content">
      {tokens.map((token, index) => {
        if (token.kind === 'text')
          return <span key={index}>{token.value}</span>

        const color = token.kind === 'person'
          ? personColors[token.value] ?? DEFAULT_TAG_COLOR
          : pointOfInterestColors[token.value] ?? DEFAULT_TAG_COLOR

        return (
          <span
            className="entry-person-token"
            key={`${token.value}-${index}`}
            style={{
              backgroundColor: getTagBackgroundColor(color),
              boxShadow: `0 0 0 1px ${color} inset`,
              color: getTagTextColor(color),
            }}
          >
            {token.value}
          </span>
        )
      })}
    </div>
  )
}

type RichTextToken = {
  kind: 'text' | 'person' | 'pointOfInterest'
  value: string
}

type RichTextTagMatch = {
  kind: 'person' | 'pointOfInterest'
  value: string
}

function tokenizeRichTextTags(content: string, people: string[], pointsOfInterest: string[]): RichTextToken[] {
  const tags = [
    ...Array.from(new Set(people.filter(Boolean))).map((value) => ({ kind: 'person' as const, value })),
    ...Array.from(new Set(pointsOfInterest.filter(Boolean))).map((value) => ({ kind: 'pointOfInterest' as const, value })),
  ].sort((a, b) => b.value.length - a.value.length || getRichTextTagPriority(a.kind) - getRichTextTagPriority(b.kind))
  const tokens: RichTextToken[] = []
  let index = 0

  while (index < content.length) {
    const match = findNextRichTextTagMatch(content, tags, index)

    if (!match) {
      tokens.push({ kind: 'text', value: content.slice(index) })
      break
    }

    if (match.start > index)
      tokens.push({ kind: 'text', value: content.slice(index, match.start) })

    tokens.push({ kind: match.tag.kind, value: match.tag.value })
    index = match.start + match.tag.value.length
  }

  return tokens.length ? tokens : [{ kind: 'text', value: content }]
}

function findNextRichTextTagMatch(
  content: string,
  tags: RichTextTagMatch[],
  startIndex: number,
): { tag: RichTextTagMatch; start: number } | null {
  let bestMatch: { tag: RichTextTagMatch; start: number } | null = null

  for (const tag of tags) {
    const matchIndex = content.indexOf(tag.value, startIndex)

    if (matchIndex === -1)
      continue

    if (!bestMatch || matchIndex < bestMatch.start || (matchIndex === bestMatch.start && tag.value.length > bestMatch.tag.value.length))
      bestMatch = { tag, start: matchIndex }
  }

  return bestMatch
}

function getRichTextTagPriority(kind: RichTextTagMatch['kind']): number {
  return kind === 'person' ? 0 : 1
}
