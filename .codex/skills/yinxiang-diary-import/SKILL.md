---
name: yinxiang-diary-import
description: Export and import diary notes from Yinxiang/Evernote Web into the LFXDiary project. Use when the user asks Codex to open Yinxiang, log in, find diary notes for a date range or month range, copy diary contents, export one .notes file per month to Desktop, or import those notes into this diary app with Summary-to-Activities tag mapping, weather refetching, and privacy-preserving tag extraction.
---

# Yinxiang Diary Import

## Core Rules

- Use this skill only for the LFXDiary project.
- Export one `.notes` file per month, placed on the user's Desktop unless the user says otherwise.
- Never store exported notes in the repo or project directory.
- Do not summarize, infer, or classify tags from diary body text. Only use the `Summary:` metadata line for tag mapping.
- Preserve the full body content in the `.notes` export.
- Ignore original `Weather:` values during import; the app should fetch weather for the diary date and locations.

## Browser Workflow

1. Use the in-app browser if the user has it open. If no authenticated tab is available, open `https://app.yinxiang.com/Home.action` and ask the user to log in.
2. Open the left sidebar `笔记本` drawer, not the editor's notebook selector. The editor selector changes the current note's notebook and must not be used for month navigation.
3. Select the requested monthly notebooks, for example `2026/01`, `2026/02`.
4. For each month, collect all diary note titles from the virtualized note list.
   - Scroll the note list from top to bottom.
   - Collect only titles matching `YYYY/MM/DD`.
   - Compare collected days with the expected calendar days for the month and patch missing boundary notes.
5. Open each note by clicking the note list row, then read the note title and visible editor body text.
   - The body is usually inside `iframe.RichTextArea-entinymce`; read `body.innerText`.
   - Wait until the selected title exactly matches the expected title before recording the body.
6. Write all notes for the month to a monthly `.notes` file using `scripts/build_notes_export.py`.
7. Validate each output file:
   - note count equals the expected days in the requested range for that month;
   - missing day list is empty unless the user requested a partial range;
   - files are on Desktop.

## Export Format

Create standard, unencrypted ENEX/XML:

- root: `<en-export ...>`
- each note: `<note><title>YYYY/MM/DD Ddd</title><content><![CDATA[...html...]]></content></note>`
- note content HTML must include a `<title>` and `<body>`.
- write each non-empty text line as a separate `<div>...</div>`.

Use the helper script:

```bash
python .codex/skills/yinxiang-diary-import/scripts/build_notes_export.py notes.json --output-dir "$USERPROFILE/Desktop"
```

`notes.json` shape:

```json
[
  {
    "title": "2026/05/26 Tue",
    "date": "2026-05-26",
    "text": "Location: Shanghai\nWeather: ...\nMood: ...\nSummary: Wwise develop\n\nBody..."
  }
]
```

## Import Rules

When importing into LFXDiary, rely on the project's Evernote import path. Before importing, verify these rules are implemented in `src/utils/evernoteImport.ts`; patch them if missing:

- Ignore imported `Weather:` metadata.
- Parse `Location:` into one or more locations.
- Parse `Mood:` into morning, afternoon, evening values.
- Parse `Summary:` only; split multiple raw summary tags with `&`.
- Map each summary item to the closest existing Activities tag first.
- If no similar tag exists, create a new tag from that summary item.
- Do not inspect body content for tag inference.

## Weather Location Rules

When an imported day has multiple locations, weather sampling should use:

- Friday with two locations: morning and afternoon use the first location; evening uses the second.
- Monday with two locations: morning uses the first location; afternoon and evening use the second.
- Other days with two locations: morning uses the first location; afternoon and evening use the second unless the project code says otherwise.
- One location: all periods use that location.

## Privacy Boundary

It is acceptable to read full diary bodies only to export/import them. Do not print body content in chat except for tiny debugging snippets when strictly necessary. Do not use body content to derive tags, summaries, categories, or judgments.
