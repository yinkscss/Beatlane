# Beatlane

Four-lane rhythm tap (Piano Tiles–style) on **Celo** — web-only, MiniPay-ready, impulse continues and song packs in **cUSD**.

Black tiles stream down four lanes. Tap in time, hold long tiles until they finish, survive obstacles like Speed Up and Don’t Tap. Miss and the run ends — unless you buy a **Second Chance**.

**Repo:** [yinkscss/Beatlane](https://github.com/yinkscss/Beatlane) (private)

## Product locks

| Constraint | Choice |
|---|---|
| Distribution | Web only (no app stores in v1) |
| Payments | cUSD on Celo (not native CELO) |
| Wallets | Magic.link · MiniPay path |
| Ads | None |
| Cosmetics | No paid skin shop in v1 |
| Monetization | Continues, helpers, song packs, Boast, Blitz cups, Season Pass |

## Docs

Review as HTML under `docs/` — preferred order: PRD → design pack → beat pitch → stack.

```bash
open docs/PRD.html          # Product requirements
open docs/design-pack.html  # Screens + visual system
open docs/beat-pitch.html   # Animated pitch reel
open docs/ROADMAP.html      # Build gates G0–G19
open docs/prompt-pack.html  # Orchestrator / implement / verify / git prompts
open docs/clarifications.html # Interactive answers builder
# Locked answers: docs/clarifications-answers.md
open docs/STACK.html        # Locked free-first stack
open docs/stack-deck.html   # Interactive stack picker
```

Prior Block Drop materials (abandoned pivot): `docs/archive/block-drop/`.

## Stack (locked)

Vite + React + TypeScript · PixiJS + Web Audio · CSS Modules · Zustand · Supabase (Postgres, Edge Functions, Storage) · Upstash Redis · Magic.link · Celo + cUSD · Foundry · Vercel Hobby · GitHub Actions · Sentry · PostHog

Audio: Web Audio only in v1 — songs are Storage audio + JSON charts; the chart clock drives gameplay.

## Status

Scaffold started (G0) — Vite + React + TS at `apps/web`; PixiJS + Zustand deps; CI lint/typecheck.

```bash
npm install
npm run dev        # apps/web → http://localhost:5173
npm run build
npm run lint
npm run typecheck
```

Copy `apps/web/.env.example` → `apps/web/.env` (never commit secrets).

## Funding Second Chance & helpers (Celo Mainnet)

Payments are **real cUSD on Celo Mainnet** (Q07/Q08). There is no faucet path.
G14 helpers reuse this same path (roadmap “testnet” AC = staging against configured Mainnet).

1. Set `VITE_TREASURY_ADDRESS` to the wallet that should receive continues / helpers.
2. Sign in with Magic — note the embedded wallet address on `/wallet`.
3. Manually send a small amount of **cUSD** (≥ $0.99 for a few revives, or $0.19 / $0.29 for helpers) **and** a little **CELO** for gas to that Magic address.
4. Miss in Classic → **Revive run** → confirm the Magic tx → receipt lands in `purchases` with `tx_hash`.
5. During Classic/Daily → **Slow-mo** / **Shield** HUD → Activate → same receipt + `unlocks` inventory on `/wallet`.

Do not invent a successful purchase without an on-chain transfer.

```bash
node apps/web/scripts/verify-g14.mjs
```

## G13 Upstash Redis (rate limits)

Q16: create a free Upstash Redis DB when G13 starts. Dashboard login is required (no CLI creds in this environment).

1. Open [Upstash Console](https://console.upstash.com/) → **Redis** → **Create Database** (free tier).
2. Open the DB → **REST API** → copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Set Edge secrets on Supabase project `blockblast` (`zxtwshhlicditrvqafzo`):

```bash
supabase secrets set \
  UPSTASH_REDIS_REST_URL="https://….upstash.io" \
  UPSTASH_REDIS_REST_TOKEN="…" \
  --project-ref zxtwshhlicditrvqafzo
```

4. Optionally paste the same keys into a **local gitignored** `.env` for reference — never commit them. Vite does not read these; only Edge Functions do.

Until secrets are set, `submit-run` **degrades open** (`rateLimit.degraded: true`) so Daily submit still works for verify. Live anti-spam requires the human DB step above.

Smoke: `node apps/web/scripts/verify-g13.mjs`
