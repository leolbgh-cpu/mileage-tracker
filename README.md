# Mileage Tracker

A personal, single-user mileage/trip log inspired by apps like Driversnote. It is a
standalone static web app (installable as a PWA) with **no backend** — every
trip is stored locally on your device via IndexedDB and never leaves it unless
you explicitly export a backup. The only account involved is your own Google
account, used purely to gate access to the app (see below) — nothing about
your trips is ever sent to Google or anywhere else.

This is its own standalone repository, unrelated to any other project.

## Features

- **Sign-in with Google**: the app is unusable until you sign in with your
  own, specifically allow-listed Google account — nobody else can open it.
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

## Setting up Google Sign-In (one-time)

This needs a Google OAuth Client ID, which only you can create (it's tied to
your own Google Cloud project — I have no tool that can do this for you):

1. Go to https://console.cloud.google.com/apis/credentials (create/select any
   project first if prompted — it's free, no billing needed for this).
2. Click **Create Credentials → OAuth client ID**. If prompted to configure
   an OAuth consent screen first, choose **External**, fill in just the
   required app name/support email fields, and add yourself as a test user
   (or publish it — either works for a single-user app like this).
3. Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `https://leolbgh-cpu.github.io` (the live app)
   - `http://localhost:3000` (or whatever port you use for local testing —
     optional, only needed if you want to sign in while running it locally)
5. Click **Create**. Copy the **Client ID** (ends in
   `.apps.googleusercontent.com` — this is not secret, it's meant to be
   public in client-side code).
6. Paste it into `GOOGLE_CLIENT_ID` in [`js/auth-config.js`](js/auth-config.js),
   commit, and push (or deploy). That's the only thing that file needs.

The account allowed to sign in is fixed to a single SHA-256 hash already set
in that same file (see the Security section) — to change which account is
allowed, replace it with `printf '%s' 'you@gmail.com' | sha256sum`'s output.

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

- **Sign-in with Google gates the app.** On load, the app shows only a Google
  Sign-In button until you authenticate. The returned ID token is verified
  for real, client-side, with no backend involved: its RS256 signature is
  checked against Google's live public keys (`js/jwt.js`, using Web Crypto),
  along with issuer, audience, and expiry — then the signed-in email is
  hashed (SHA-256) and compared against a single allow-listed hash
  (`js/auth-config.js`), so only your own account can pass. The plaintext
  email address is never stored in the repo, only its hash.
- **What this does and doesn't protect.** This blocks anyone except your
  Google account from opening the app, including someone who finds the URL.
  It does **not** encrypt the trip data itself — this is a client-only app
  with no server to hold a secret, so someone with direct access to your
  *unlocked* device's browser storage (e.g. via devtools) could still read
  IndexedDB directly, the same way they could with any local-only app. If you
  want data encrypted at rest too, that requires a separate device
  passcode/PIN whose key derives the encryption — and that trades away
  recoverability (forget the passcode, lose the data, permanently, by
  design). That trade-off was intentionally left out here in favor of this
  Google sign-in gate; ask if you want it added on top.
- Signing in is remembered only for the current browser session
  (`sessionStorage`, up to 12 hours) — closing the browser/tab requires
  signing in again next time. Use **Settings → Sign out** to end it early.
  The initial sign-in needs network access (to reach Google); the app then
  keeps working fully offline until the tab is closed.
- **Content-Security-Policy** is set via a `<meta>` tag restricting scripts,
  styles, and network connections to same-origin plus the exact Google
  origins Sign-In needs (`accounts.google.com` for the script/frame,
  `accounts.google.com` and `www.googleapis.com` for its requests and the
  JWKS fetch) — nothing broader. `object-src`, `base-uri`, and `form-action`
  are all disabled. (Static hosts like GitHub Pages don't support custom HTTP
  response headers, so this is enforced via meta tag rather than a real CSP
  header; `frame-ancestors` isn't honored that way, so clickjacking framing
  isn't blocked at the HTTP level — a minor accepted gap given the low-value
  target.)
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
