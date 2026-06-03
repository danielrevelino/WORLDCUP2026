# World Cup 2026 Probability Dashboard

This is a Vercel-ready dashboard built from `world_cup_2026_group_probability_analysis.xlsx`.

## What it includes

- Forecast dashboard for all 12 groups and 48 teams
- Contender title-probability view
- Third-place qualification watch
- Live-score polling every 30 seconds
- Vercel serverless API bridge so provider tokens stay private

## Local preview

From this folder:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The local preview uses `data/live-results.sample.json` because the Vercel API route is only available when served by Vercel or Vercel CLI.

## Vercel deployment

Deploy the folder directly to Vercel. There is no build step.

For football-data.org:

- `FOOTBALL_DATA_TOKEN`: your API token
- `FOOTBALL_DATA_COMPETITION`: optional, defaults to `WC`
- `FOOTBALL_DATA_SEASON`: optional, defaults to `2026`

For another provider:

- `SCORE_API_URL`: provider endpoint returning matches
- `SCORE_API_TOKEN`: optional token
- `SCORE_API_TOKEN_HEADER`: optional header name, defaults to `Authorization`

The browser fetches `/api/live`; the serverless function normalizes the provider response into:

```json
{
  "source": "custom",
  "fetchedAt": "2026-06-03T10:00:00.000Z",
  "matches": [
    {
      "group": "A",
      "homeTeam": "Mexico",
      "awayTeam": "South Korea",
      "homeScore": 1,
      "awayScore": 0,
      "status": "LIVE",
      "utcDate": "2026-06-12T19:00:00Z",
      "minute": 62
    }
  ]
}
```

## Data note

The probability model is a pre-tournament estimate, not official FIFA probabilities or betting odds. Live scores update the group tables but do not recalculate the underlying forecast probabilities.
