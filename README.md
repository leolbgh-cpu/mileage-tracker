# Mileage Tracker

A personal, single-user mileage/trip log inspired by apps like Driversnote. It is a
standalone static web app (installable as a PWA) with **no backend and no
account** — every trip is stored locally on your device via IndexedDB and never
leaves it unless you explicitly export a backup.

This is its own standalone repository, unrelated to any other project.

## Features

- **Inbox**: trips split into "Ready" and "Needs review", like Driversnote.
- **One-tap tracking**: "Start tracking now" records your route with the
  device's GPS while the app is open, then drops the finished trip into
  "Needs review" for you to tag a purpose and confirm the distance.
- **Manual entry**: log a trip by hand (date, times, locations, distance,
  purpose, notes) without using GPS at all.
- **All trips**: full chronological list of everything logged.
- **Report**: filter by date range and purpose, see totals and an estimated
  reimbursement amount, and export a CSV mileage log.
- **Settings**: vehicle name, distance unit (km/mi), mileage rate, currency,
  default trip purpose.
- **Backup/restore**: export all data as a JSON file, or import it back
  (e.g. when moving to a new phone).
- Installable as a PWA (add to home screen) and works offline once loaded.

## Important limitation: no silent background tracking

Driversnote's "just start driving, it auto-detects trips" behavior relies on a
native mobile app with background location/motion permissions. A web app
cannot do this reliably — browsers (especially iOS Safari) suspend GPS access
as soon as the tab is backgrounded or the screen locks. So tracking here only
works in the foreground: tap **Start tracking now**, keep the app open while
you drive, then tap **Stop**. If you need true silent background
auto-tracking, that would require a native iOS/Android app instead of a web
app — this project intentionally stays lightweight and installs like an app,
but is honest about that constraint.

## Running it locally

No build step or dependencies. Serve the folder with any static file server
(it must be served over HTTP(S), not opened via `file://`, for the service
worker and Geolocation API to work):

```bash
npx serve .
# or: python3 -m http.server 8080
```

Then open the printed URL on your phone (same Wi-Fi network) or in your
desktop browser, and optionally "Add to Home Screen" for the app-like
experience.

## Deploying it

**Live app:** https://leolbgh-cpu.github.io/mileage-tracker/

This repo deploys automatically to GitHub Pages via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) on
every push to `main`. That requires two one-time settings on GitHub (already
done for this repo): the repository visibility set to public, and
**Settings → Pages → Build and deployment → Source** set to "GitHub Actions".

Since it's fully static with no backend, database, or secrets, you can just
as easily deploy it to Cloudflare Pages, Netlify, Vercel, or any other static
host instead.

## Security

- **No login/passcode by design.** There's no server to authenticate against,
  and adding a device passcode would only be meaningful if it also encrypted
  the data at rest — which trades away recoverability (forget the passcode,
  lose the data, permanently, with no backdoor). That trade-off was
  deliberately left out in favor of an always-open personal tool; anyone with
  access to your unlocked device already has access to the app.
- **Content-Security-Policy** is set via a `<meta>` tag restricting scripts,
  styles, and network connections to same-origin only, with `object-src`,
  `base-uri`, and `form-action` all disabled. (Static hosts like GitHub Pages
  don't support custom HTTP response headers, so this is enforced via meta
  tag rather than a real CSP header; `frame-ancestors` isn't honored that way,
  so clickjacking framing isn't blocked at the HTTP level — a minor accepted
  gap given the low-value target.)
- **Backup import is treated as untrusted input.** Every trip/setting field
  from an imported JSON file is re-validated, type-checked, and length-capped
  before being written to storage, and a fresh internal ID is always assigned
  rather than trusting the file's own ID. This closes a stored-XSS path where
  a crafted or tampered backup file could otherwise inject working HTML
  (`<img onerror=...>`, attribute-breakout payloads, etc.) into the trip list
  or settings form.
- **All rendered text is HTML-escaped** at render time (not just at the
  import boundary), so this holds even if a future code change reintroduces
  unsanitized data some other way.
- **CSV export defuses formula injection**: any cell whose text starts with
  `=`, `+`, `-`, or `@` (interpreted as a live formula by Excel/Sheets) is
  prefixed with `'` so it opens as inert text instead.

## Data & privacy

- All trips and settings are stored in your browser's IndexedDB, scoped to
  the device/browser you're using.
- Clearing site data/browser storage will delete everything — export a backup
  first (Settings → Export backup).
- Nothing is sent to any server; there is no analytics or tracking beyond the
  GPS points you record for your own trips.
- This tool is provided for personal record-keeping convenience only; it
  makes no guarantee of accuracy or compliance with any tax authority's
  mileage-log requirements — double-check totals before relying on them.
