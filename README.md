# MacroAI

A mobile-first **photo calorie tracker** with MacroFactor-style **adaptive targets**.
Snap a photo of your meal → Google Gemini estimates calories & macros → review and log.
Your calorie target adapts to your real energy expenditure, calculated from the
relationship between what you eat and how your weight trend moves.

Built as a **local-only PWA** (Next.js). All your data lives in your browser
(`localStorage`) — no account, no server database.

## Features

- **AI photo logging** — point your camera at food, get an editable list of items with grams/macros.
- **Adaptive TDEE** — once you have ~1 week of intake + weigh-ins, your expenditure is estimated from your own data (not a generic formula) and your targets update automatically.
- **Smoothed weight trend** — daily weigh-ins are run through an EWMA so water-weight noise doesn't whipsaw your targets.
- **Trends dashboard** — intake vs target, estimated expenditure, daily balance, projected weekly change.
- **Installable PWA** — add to home screen, works offline for everything except the AI call.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Google Gemini (`gemini-3.5-flash`, with automatic fallback to older Flash models on quota limits) via `@google/generative-ai`
- `localStorage` for persistence

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Get a free Gemini API key at https://aistudio.google.com/apikey

3. Create `.env.local` (copy from `.env.example`):

   ```bash
   GEMINI_API_KEY=your_key_here
   # optional: GEMINI_MODEL=gemini-3.5-flash
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. On your phone, open the same URL on your network
   and use **Add to Home Screen** to install it as an app.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Start the dev server                          |
| `npm run build`    | Production build                              |
| `npm start`        | Run the production build                      |
| `npm run lint`     | Lint                                          |
| `node scripts/gen-icons.mjs` | Regenerate PWA icons from `public/icon*.svg` |

## How the adaptive engine works

Energy balance is `intake − expenditure`, and that balance shows up physically as
weight change (`slope_kg/day × 7700 kcal/kg`). Rearranged:

```
expenditure ≈ mean_intake − (weight_trend_slope × 7700)
```

Over a trailing 21-day window the app fits a line to your smoothed weight trend,
compares it to your average logged intake, and solves for expenditure. Early on
(little data) it blends toward the Mifflin-St Jeor formula estimate; as you log
more, it leans fully on your real data. Because it's a multi-day average, even
noisy individual photo estimates wash out — the targets track *your* metabolism.

## Privacy

Everything is stored locally in your browser. Food photos are sent to Google
Gemini **only** for analysis (server-side, not stored by this app). Clearing your
browser storage erases all data.

## Deploy

Hosted on **Vercel**, connected to this GitHub repo for **continuous deployment**:
every push to `main` automatically builds and ships to production.

```bash
git add -A
git commit -m "what changed"
git push        # Vercel auto-deploys within ~1 minute
```

No server-side API key is required — each user supplies their **own Gemini API key**
in-app (Settings → AI key), stored on their device only. The PWA service worker is
only active in production builds.
