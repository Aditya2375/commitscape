# COMMITSCAPE

A GitHub observatory. Point it at any public GitHub username and it renders the account's activity as charts, stats, and generative art — no account needed, nothing stored server-side (there is no server).

## Run it

Open `index.html` in a browser, or serve the folder with any static server.

## Features

- **Live mode**: fetches the public GitHub REST API (unauthenticated, 60 requests/hour) — profile, repos, events, languages, streaks.
- **Bundled demo**: falls back to a baked synthetic dataset for the fictional account @commitscape-demo (not a real GitHub user) so the app works offline or when rate-limited.
- **Activity heatmap** for the last ~16 weeks, current + longest streak, actions in 90 days.
- **Repo table** with language dots, stars, and push dates.
- **Commit art**: three generative styles (river, bloom, static) × three palettes (nocturne, phosphor, ember), downloadable as PNG. Each mark is a real commit.

## Optional token

Paste a GitHub personal-access token (read-only) in the header to raise the rate limit. The token stays in `localStorage` on your machine and is only sent to `api.github.com`.

## Files

- `index.html`, `styles.css`, `app.js` — the app
- `demo-data.js` — bundled snapshot (fallback data)
- `art.js` — the generative-art engine
