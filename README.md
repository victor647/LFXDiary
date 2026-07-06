# LFX Diary

English-first, local-first diary MVP.

## Current Features

- Structured diary header:
  - `YYYY/MM/DD Wed`
  - `Location: Shanghai - Suzhou`
  - `Weather: Light rain, 22-26-23°C, AQI=49`
  - `Mood: 5-6-5`
  - `Tags: Park, Movie`
- Date picker.
- Multi-city location selection through Open-Meteo geocoding.
- Daily summary weather condition plus Morning/Afternoon/Evening temperature and AQI sampling.
- Open-Meteo weather and US AQI fetching.
- AQI rendering rule:
  - average value when daily AQI range is 50 or less.
  - three sampled values when daily AQI range is greater than 50.
- 0-10 mood scores for morning, afternoon, and evening.
- English Title Case tags with spaces, such as `Vibe Coding`.
- Finder-style tag colors selected when adding tags.
- Entry list tag display as color dots.
- Entry list background by average mood:
  - 0 to under 4: gray.
  - 4 to under 6: white.
  - 6 to under 7: light green.
  - 7 and above: light purple.
- Rule-based tag suggestions from English diary text.
- Search across date, city, tags, and body text.
- Local browser storage.
- Manual backup sync as JSON:
  - Uses the browser directory picker when available.
  - Falls back to a downloaded backup file.
- Backup import.

## Run

```bash
npm install
npm run dev
```

## Runtime Modes

- Local browser: `npm run browser:dev`, then use `http://127.0.0.1:5173`.
- Windows/macOS desktop: `npm run desktop:dist:win` or `npm run desktop:dist:mac`.
- Synology NAS Web Station: `npm run nas:build`, then copy the contents of `dist` to the Web Station site folder.

One-click launch and packaging scripts live in `packaging/`.

For NAS Web Station, use Apache HTTP Server with PHP and make sure URL rewrite is enabled so `dist/.htaccess` can route `/nas-lan-api/` and `/nas-public-api/` to `nas-proxy.php`. The default NAS proxy target for LAN mode is `https://127.0.0.1:5001/`; edit `dist/nas-proxy.config.php` after deployment if your DSM address is different.

## Validate

```bash
npm run lint
npm run build
```

## Next Native Packaging Step

The app is currently a Vite/React local-first MVP. To ship the requested platforms:

- Windows/macOS: wrap this frontend with Tauri or Electron.
- Android: wrap this frontend with Capacitor.
- Storage upgrade: move from browser local storage to SQLite through the native wrapper layer.
- NAS sync upgrade: save encrypted backup files to a user-selected directory in the native layer.
