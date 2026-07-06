import { type UIEvent, useRef } from 'react'
import { DEFAULT_TAG_COLOR } from '../domain/constants'
import { getTagBackgroundColor, getTagTextColor } from '../utils/colors'

type EntryEditorProps = {
  content: string
  people: string[]
  personColors: Record<string, string>
  saveLabel: string
  onContentChange: (content: string) => void
  onSave: () => void
}

export function EntryEditor({ content, people, personColors, saveLabel, onContentChange, onSave }: EntryEditorProps) {
  const richTextRef = useRef<HTMLDivElement>(null)

  function syncRichTextScroll(event: UIEvent<HTMLTextAreaElement>) {
    const richText = richTextRef.current

    if (!richText)
      return

    richText.scrollTop = event.currentTarget.scrollTop
    richText.scrollLeft = event.currentTarget.scrollLeft
  }

  return (
    <section className="entry-body">
      <label>Entry</label>
      <div className="entry-rich-text-shell">
        <div className="entry-rich-text-layer" ref={richTextRef} aria-hidden="true">
          <RichTextContent content={content} people={people} personColors={personColors} />
        </div>
        <textarea
          className="entry-rich-text-input"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          onScroll={syncRichTextScroll}
          placeholder="Write today's journal in English..."
          spellCheck
        />
      </div>
      <button className="entry-save-button" type="button" onClick={onSave}>
        {saveLabel}
      </button>
    </section>
  )
}

function RichTextContent({
  content,
  people,
  personColors,
}: {
  content: string
  people: string[]
  personColors: Record<string, string>
}) {
  const tokens = tokenizePeople(content, people)

  return (
    <div className="entry-rich-text-content">
      {tokens.map((token, index) => {
        if (token.kind === 'text')
          return <span key={index}>{token.value}</span>

        const color = personColors[token.value] ?? DEFAULT_TAG_COLOR

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
  kind: 'text' | 'person'
  value: string
}

function tokenizePeople(content: string, people: string[]): RichTextToken[] {
  const sortedPeople = Array.from(new Set(people.filter(Boolean))).sort((a, b) => b.length - a.length)
  const tokens: RichTextToken[] = []
  let index = 0

  while (index < content.length) {
    const match = findNextPersonMatch(content, sortedPeople, index)

    if (!match) {
      tokens.push({ kind: 'text', value: content.slice(index) })
      break
    }

    if (match.start > index)
      tokens.push({ kind: 'text', value: content.slice(index, match.start) })

    tokens.push({ kind: 'person', value: match.person })
    index = match.start + match.person.length
  }

  return tokens.length ? tokens : [{ kind: 'text', value: content }]
}

function findNextPersonMatch(content: string, people: string[], startIndex: number): { person: string; start: number } | null {
  let bestMatch: { person: string; start: number } | null = null

  for (const person of people) {
    const matchIndex = content.indexOf(person, startIndex)

    if (matchIndex === -1)
      continue

    if (!bestMatch || matchIndex < bestMatch.start || (matchIndex === bestMatch.start && person.length > bestMatch.person.length))
      bestMatch = { person, start: matchIndex }
  }

  return bestMatch
}
