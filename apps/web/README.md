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

### Helpers Slow-mo & Shield (G14)

- Classic / Daily only — `helpersDisabled('blitz')` is true (Blitz stub / G16).
- Mid-run sheets: **Slow-mo 3s** `$0.19` · **Shield one-miss** `$0.29` (design-pack Saves).
- Same payment path as Second Chance: Magic wallet → cUSD transfer → `record-purchase`.
- **Network:** Celo Mainnet (`chainId` 42220). Roadmap AC “testnet” = staging/dev against this configured network (Q07 locked Mainnet — no separate Alfajores deploy).
- Inventory counts on `/wallet` from `unlocks` (`helper` + `continue`).

```bash
node apps/web/scripts/verify-g14.mjs
```
