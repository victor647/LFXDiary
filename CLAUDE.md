# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install
npm run dev              # Vite dev server (browser)
npm run browser:dev      # Browser mode on 127.0.0.1:5173
npm run desktop:dev      # Electron + Vite concurrently
npm run build            # TypeScript check + Vite production build
npm run lint             # oxlint
npm run nas:build        # Build + prepare NAS Web Station dist
npm run desktop:dist:win # Build + package Windows installer
```

## Architecture

LFX Diary is a **local-first diary app** (Electron + Vite + React 19 + TypeScript 6) with optional NAS or Git sync. Entries are stored in browser `localStorage` and synced as Markdown files.

### Layer structure

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| Domain | `src/domain/` | Pure data types, constants, serialization, catalog logic, tag models — **no React, no I/O** |
| Application | `src/application/` | Sync adapter abstraction, tag event dispatching |
| Utils | `src/utils/` | Git sync (isomorphic-git), NAS sync (Synology API), settings persistence, weather/AQI fetching, file I/O |
| Components | `src/components/` | React UI: sidebar, entry editor, metadata panels, settings, dialogs |
| Electron | `electron/main.cjs` | Desktop shell — custom `app://` protocol for static files + NAS API proxy |

### Core data model (`src/domain/types.ts`)

- **`DiaryEntry`**: The central entity — `diaryDate`, `cities[]`, `weatherSamples[]`, `mood` (morning/afternoon/evening scores), `tags[]` (activities), `people[]`, `pointsOfInterest[]`, `content` (markdown body), plus color maps for each tag category
- **`AppSettings`**: Sync config (provider, NAS/Git credentials, paths), tag catalogs, color group names, temperature thresholds, AQI tokens
- **`DiaryCatalog`**: Global index mapping locations/activities/people/POIs → entry references, persisted as `lfx-diary-catalog.json`
- **`YearCatalog`**: Per-year shard of the catalog for efficient sync of large diaries

### Key architectural patterns

**Sync adapter** (`src/application/diarySync.ts`): `DiarySyncAdapter` interface with `pushEntries`/`pullEntries`/`deleteEntry`/`pushCatalog`/`pullCatalog`. Two implementations loaded via dynamic `import()`: Git (isomorphic-git + LightningFS in `src/utils/gitSync.ts`) and NAS (Synology File Station API in `src/utils/synology.ts`).

**Tag event system** (`src/application/tagEvents.ts`): Observer chain — `dispatchTagEvent(state, event)` pipes events through `catalogTagObserver` → `catalogEntryReferenceObserver` → `currentEntryTagObserver` → `locationTagObserver`. Each observer returns updated `TagEventState` (settings + draft + entries + catalog). Used for cascading updates: renaming a tag in the catalog also updates all entries referencing it.

**Tag manager hierarchy** (`src/domain/tagModels.ts`):
- Abstract `DiaryTag` → `DiaryTagManager<TTag>` → `CatalogDiaryTagManager<TTag>` → concrete `ActivityTagManager`, `PersonTagManager`, `PointOfInterestTagManager`
- `LocationTagManager` extends `DiaryTagManager` directly (locations are keyed by city, not by name)
- Each manager handles: name normalization, color grouping, entry tag CRUD, catalog pin/toggle, collecting tags from entries (with count), recent tag filtering (1-year cutoff)

**Markdown serialization** (`src/domain/diaryEntrySerialization.ts`): Entries serialize to markdown with `<!-- lfx-diary ... -->` HTML comment metadata blocks (date, location, weather, mood, activities, people, POI). Deserialization parses these blocks back into structured fields.

**Catalog ↔ Settings bridge**: `applySettingsToDiaryCatalog()` and `applyDiaryCatalogToSettings()` sync tag colors/pins between the runtime catalog (shared across sync) and user settings (persisted locally).

**Electron proxy**: `electron/main.cjs` registers a custom `app://` protocol. Requests to `/nas-public-api/*`, `/nas-lan-api/*`, `/aliyun-air-api/*`, `/cnemc-air-api/*` are proxied to the respective backend. In browser dev mode, Vite's dev server handles these proxies instead.

### Component tree (rendered by `DiaryApp.tsx`)

- `Sidebar` — notebook tree (year/month groups), search, tag filters (location/activity/person/POI), entry list with mood-colored backgrounds, context menus, pull/sync controls
- `EntryEditor` — rich textarea with `@person` mention autocomplete, point-of-interest tag display
- `MetadataEditor` — date, weather, mood, activities, people, locations, points of interest (each delegated to a panel component in `src/components/panels/`)
- `SettingsPage` — sync provider toggle (NAS/Git), credentials, tag color group naming, temperature thresholds, catalog import/export, Evernote import
- Dialog components: `SyncProgressDialog`, `PullConflictDialog`, `PushSuccessDialog`, `ForcePushDialog`, `SyncErrorDialog`, `DeleteEntryDialog`, `UnsavedCloseDialog`, `AutoSaveRecoveryDialog`

### Storage keys

- Entries: `lfx-diary.entries.v1` (localStorage)
- Settings: `lfx-diary.settings.v1` (localStorage)
- Git: LightningFS filesystem named `lfx-diary-git-v1` at `/repo`
- Catalog file: `lfx-diary-catalog.json`
- Year catalog: `lfx-diary-year-catalog.json`

### Weather & AQI

Weather data comes from Open-Meteo API; AQI from aqicn.org, Aliyun Air, or CNEMC. Three daily samples (06:00/14:00/22:00). AQI renders as an average when the daily range ≤ 50, otherwise as three individual values.

### Proxy configuration

Browser dev mode proxies are defined in `vite.config.ts`. Override NAS targets via env vars `LFX_DIARY_NAS_LAN_URL` and `LFX_DIARY_NAS_PUBLIC_URL`. For NAS Web Station deployment, `dist/.htaccess` routes `/nas-lan-api/` and `/nas-public-api/` to `nas-proxy.php`; edit `dist/nas-proxy.config.php` to change the DSM target.
