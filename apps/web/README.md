# Beatlane web app

Vite + React + TypeScript shell (`apps/web`). Run from repo root:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
npm run typecheck
```

Copy `.env.example` → `.env` and fill placeholders (Magic / Supabase / treasury). Never commit `.env`.

### Second Chance (G10)

Requires `VITE_TREASURY_ADDRESS` and a Magic wallet funded with **cUSD + CELO (gas)** on Celo Mainnet. See root README “Funding Second Chance”.

### Daily + leaderboards (G13)

- Home → **Daily Track** loads server seed (`daily-challenge`) then Storage chart.
- Clear / submit sends tap timestamps to `submit-run` (server revalidates vs chart).
- `/leaderboard` polls `leaderboard` over HTTP every 5s.
- Upstash rate limit: Edge secrets `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (see root README). Degrades open when unset.

```bash
node apps/web/scripts/verify-g13.mjs
```
