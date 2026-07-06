#!/usr/bin/env python3
from __future__ import annotations

import argparse
import calendar
import html
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


TITLE_DATE_RE = re.compile(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})")


@dataclass(frozen=True)
class Note:
    title: str
    date: str
    text: str

    @property
    def month_key(self) -> str:
        return self.date[:7]

    @property
    def day(self) -> int:
        return int(self.date[8:10])


def main() -> None:
    parser = argparse.ArgumentParser(description="Build monthly unencrypted .notes exports for LFXDiary imports.")
    parser.add_argument("notes_json", type=Path, help="JSON array of notes with title, date, text.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for generated .notes files.")
    parser.add_argument("--start", help="Optional inclusive start date YYYY-MM-DD.")
    parser.add_argument("--end", help="Optional inclusive end date YYYY-MM-DD.")
    args = parser.parse_args()

    notes = load_notes(args.notes_json)
    notes = filter_range(notes, args.start, args.end)
    grouped = group_by_month(notes)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    report: list[dict[str, Any]] = []
    for month_key in sorted(grouped):
        month_notes = sorted(grouped[month_key].values(), key=lambda note: note.date, reverse=True)
        output_path = args.output_dir / f"{month_key.replace('-', '')}.notes"
        output_path.write_text(build_export_xml(month_notes), encoding="utf-8")
        report.append(build_month_report(output_path, month_key, month_notes, args.start, args.end))

    print(json.dumps(report, ensure_ascii=False, indent=2))


def load_notes(path: Path) -> list[Note]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("notes_json must contain a JSON array.")

    notes: list[Note] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Each note must be an object.")

        title = str(item.get("title", "")).strip()
        date = normalize_date(str(item.get("date", "")).strip() or title)
        text = str(item.get("text", "")).replace("\r\n", "\n").replace("\r", "\n").strip()
        if not title or not date or not text:
            raise ValueError(f"Invalid note entry: {item!r}")

        notes.append(Note(title=title, date=date, text=text))

    return notes


def normalize_date(value: str) -> str:
    match = TITLE_DATE_RE.search(value)
    if not match:
        raise ValueError(f"Cannot parse note date from {value!r}.")

    year, month, day = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def filter_range(notes: list[Note], start: str | None, end: str | None) -> list[Note]:
    if start:
        normalize_date(start)
    if end:
        normalize_date(end)

    return [
        note
        for note in notes
        if (not start or note.date >= start) and (not end or note.date <= end)
    ]


def group_by_month(notes: list[Note]) -> dict[str, dict[str, Note]]:
    grouped: dict[str, dict[str, Note]] = defaultdict(dict)
    for note in notes:
        grouped[note.month_key][note.date] = note
    return grouped


def build_export_xml(notes: list[Note]) -> str:
    export_date = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    note_xml = "".join(build_note_xml(note) for note in notes)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export2.dtd">\n'
        f'<en-export export-date="{export_date}" application="Codex/YinxiangWeb" version="1.0">\n'
        f"{note_xml}\n"
        "</en-export>\n"
    )


def build_note_xml(note: Note) -> str:
    created = note.date.replace("-", "") + "T120000Z"
    content_html = build_note_html(note)
    return (
        f"<note><title>{html.escape(note.title)}</title>"
        f"<content><![CDATA[{escape_cdata(content_html)}]]></content>"
        f"<created>{created}</created><updated>{created}</updated></note>"
    )


def build_note_html(note: Note) -> str:
    lines = [
        line.strip()
        for line in note.text.replace("\u00a0", " ").split("\n")
        if line.strip()
    ]
    body = "".join(f"<div>{html.escape(line)}</div>" for line in lines)
    return (
        "<!DOCTYPE html><html><head>"
        f"<title>{html.escape(note.title)}</title>"
        f"</head><body>{body}</body></html>"
    )


def escape_cdata(value: str) -> str:
    return value.replace("]]>", "]]]]><![CDATA[>")


def build_month_report(
    path: Path,
    month_key: str,
    notes: list[Note],
    start: str | None,
    end: str | None,
) -> dict[str, Any]:
    year, month = [int(part) for part in month_key.split("-")]
    last_day = calendar.monthrange(year, month)[1]
    expected_days = set(range(1, last_day + 1))
    if start and start[:7] == month_key:
        expected_days = {day for day in expected_days if day >= int(start[8:10])}
    if end and end[:7] == month_key:
        expected_days = {day for day in expected_days if day <= int(end[8:10])}

    exported_days = {note.day for note in notes}
    return {
        "path": str(path),
        "month": month_key,
        "note_count": len(notes),
        "missing_days": sorted(expected_days - exported_days),
    }


if __name__ == "__main__":
    main()
