# Beatlane web app

Vite + React + TypeScript shell (`apps/web`). Run from repo root:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
npm run typecheck
npm test
```

Copy `.env.example` → `.env` and fill placeholders (Magic / Supabase / treasury / Sentry / PostHog). Never commit `.env`.

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

### Boast (G15)

- Results → **Boast streak · $0.29 cUSD** → mint sheet → share card (`/b/:slug`).
- Contract: `contracts/src/BoastAttestation.sol` on **Celo Sepolia** (not Mainnet continues).
- Set `VITE_BOAST_CONTRACT_ADDRESS` after `forge script` deploy (see `contracts/README.md`).
- Receipt: `purchases.tx_hash` + `boasts` row (`receipt_hash`, `share_slug`).

```bash
node apps/web/scripts/verify-g15.mjs
```

### Blitz tournaments (G16)

- Home → **Blitz** → `/tournament` lobby (Friday Finger Cup seed).
- Entry: Mainnet cUSD → `record-purchase` sku `tournament_entry_<slug>` → play `/play?mode=blitz`.
- Helpers off (`helpersDisabled('blitz')`); Reverse / Fog / Fake Gap stripped via `sanitizeBlitzChart`.
- Ranking + **payout stub** via Edge `tournament-cup`. Optional `TournamentVault` on Celo Sepolia.
- Audit checklist: `docs/tournament-audit-checklist.md`.

```bash
node apps/web/scripts/verify-g16.mjs
```

### Season Pass (G17)

- Home → **Pass** → `/pass` (Rhythm Pass, Season 1).
- Buy: Mainnet cUSD → `record-purchase` sku `season_pass_season-1` → `unlocks.season_pass` + due continues/tracks.
- Progress UI + grant on status fetch; optional cron `season-pass` `action=grant_due`.
- Rewards: continues + chart unlocks only (no skins). Price **$2.99** · **4 weeks** (Q20).

```bash
node apps/web/scripts/verify-g17.mjs
```

### Observability (G18)

- Sentry: `src/lib/sentry.ts` + Edge `_shared/sentry.ts` (secret `SENTRY_DSN`).
- PostHog funnels: `start_run`, `miss`, `purchase_continue`, `unlock_pack` via `src/lib/analytics.ts`.
- Without keys, init/capture are no-ops (unit-tested). Human creates cloud projects — see root README.

```bash
npm test
node apps/web/scripts/verify-g18.mjs
```

### Launch polish (G19)

- Vercel: repo-root `vercel.json` → build `apps/web`
- MiniPay stub CTA on Home + Wallet (`src/components/MiniPayCta.tsx`, Q21)
- Soft spend caps (`src/lib/spendCaps.ts`) + mute persistence (`src/lib/mutePref.ts`)
- Empty/error states on Music / Pass / Results / boards
- Deploy helper (no secret printing): `node apps/web/scripts/deploy-g19-vercel.mjs`
- Verify: `node apps/web/scripts/verify-g19.mjs`
