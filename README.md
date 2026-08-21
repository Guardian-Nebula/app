# Guardian Nebula

A personal constellation for the habits that hold you together — sleep, cold showers, sunlight, walking, workouts, earthing, clean food, meditation, and social time. Tap a star to log it. The dashboard below breaks it down by day, week, month, year, and life.

Everything is a single static page. No backend, no sign-in — your log lives in your browser's local storage on whichever device you use it on.

## Files

- `index.html` — the whole app (structure, styling, and logic in one file)
- `logo.svg` — the Guardian Nebula mark (shield + constellation)

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

## Notes

- Data is stored per-browser via `localStorage` — it won't sync across devices or browsers. If you clear site data, your log resets. This is intentional for v1: no account, no server, nothing to leak.
- The habit list is fixed for v1 (not user-editable) — matches the current Guardian Nebula scope.
- Built to sit alongside the Guardian EHS platform under the same "Guardian" name, extended from workplace safety into personal wellbeing.
