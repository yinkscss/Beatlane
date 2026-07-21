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
