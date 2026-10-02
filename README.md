# Guardian Nebula

A personal constellation for the habits that hold you together — sleep, cold showers, sunlight, walking, workouts, earthing, clean food, meditation, and social time. Tap a star to log it. The dashboard below breaks it down by day, week, month, year, and life.

Everything is a single static page. No backend, no sign-in — your log lives in your browser's local storage on whichever device you use it on.

## Files

- `index.html` — the whole app (structure, styling, and logic in one file)
- `logo.svg` — the Guardian Nebula mark (shield + constellation)
- `manifest.json` — makes the app installable on a phone home screen (PWA)
- `sw.js` — service worker: offline shell caching + lets notifications render properly when installed
- `supabase-schema.sql` — optional backend schema (login, cross-device sync, custom practices, notes)

## Deploy to GitHub Pages

1. Create a new repository, e.g. `guardian-nebula` (or a personal `<username>.github.io` repo if you want it at the root of your GitHub domain).
2. Upload `index.html` and `logo.svg` to the repository root (or drag-and-drop them in the GitHub web UI — no build step needed).
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
5. GitHub gives you a URL after a minute or two, typically:
   `https://<username>.github.io/guardian-nebula/`
6. Open it — your constellation is live.

### Optional: custom domain
Add a `CNAME` file to the repo root with your domain, and point a DNS `CNAME` record at `<username>.github.io`. GitHub's Pages settings page will confirm once it's verified.

## Optional: login and cross-device sync

Without any setup, the app works fully on one device via `localStorage` — no login needed, click "Continue without an account" if a login screen ever appears. To add real login and sync your constellation across devices:

1. Create a new Supabase project (a project separate from Guardian EHS is recommended, since this holds personal wellbeing data).
2. In the SQL editor, run `supabase-schema.sql` from this folder.
3. In **Authentication → Providers**, confirm Email is enabled. Enable Google there too if you want the Google sign-in button to work, and follow Supabase's Google OAuth setup (needs a Google Cloud OAuth client).
4. In **Authentication → URL Configuration**, add your GitHub Pages URL (e.g. `https://<username>.github.io/guardian-nebula/`) to Redirect URLs.
5. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
6. Open `index.html`, find this block near the top of the `<script>` tag, and fill in your values:
   ```js
   var SUPABASE_URL = 'YOUR_SUPABASE_URL';
   var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```
7. Re-upload `index.html`. Login (email/password + Google) is now live, and habit logs + your birth-year/life-expectancy setting sync to your account.

Supabase's built-in email sender is rate-limited and dev-only — for real signup volume beyond testing, wire up real SMTP the same way it's documented for Guardian EHS.

## Connecting a wearable

The Devices panel lists Fitbit, Google Fit, Apple Health, Oura, and Garmin, but none are wired up yet — each needs its own OAuth flow built server-side (a Supabase Edge Function holding that provider's token), since none of these APIs can be called safely from a static page. The `nebula_device_connections` table in the schema is a placeholder for this. Manual entry and the constellation both work fully today regardless.

## Practices are no longer fixed to 9

Use "Add to my sky" in the Dashboard to track anything — the 9 defaults are just a starting point. Custom practices get their own icon, category, and unit, and orbit the two anchor stars (Sleep, Meditation) alongside the built-in ones. Remove a custom practice any time from "Your practices" — its past logged history stays in your stats even after it's removed from the sky.

## Reminders and notifications

The Reminders section requests browser notification permission and can nudge you at a set time if the sky's still dim. Two honest limits worth knowing:

- It only fires while the tab is open on that device — a static site can't wake up to send notifications once fully closed. True background push needs a server (VAPID keys + a push service) — ask for that specifically if it matters enough to build.
- Installing the app (below) helps, since an installed PWA behaves more like a real app and can stay running longer, but it's still not the same guarantee as native push.

## Installing on your phone

The app is a proper installable PWA:

- **iPhone (Safari):** open the site, tap Share → **Add to Home Screen**.
- **Android (Chrome):** open the site, tap the menu → **Install app** (or you'll see an install prompt automatically).

Once installed it opens full-screen with its own icon, and the service worker (`sw.js`) caches the app shell so it still opens when you're offline — your data was already local-first anyway.

## Notes

- Local-only mode stores data via `localStorage` per browser/device. Signed-in mode stores it in Supabase, synced everywhere you log in.
- The "Memory" field on the Daily tab is a plain per-day note — no AI, nothing sent anywhere, just your own words, saved and synced like everything else.
- The "Perspective" panel is off until a birth year is entered, and only ever shows a broad statistical average, never a personalized prediction. The week-by-week grid follows the general "memento mori life calendar" format used by tools like Tim Urban's *Your Life in Weeks* and the open-source Memento-Mori project — this is an original implementation, not a copy of any of their code.
- Built to sit alongside the Guardian EHS platform under the same "Guardian" name, extended from workplace safety into personal wellbeing.
