# Beatlane — Mainnet cutover checklist (G19)

Payments already target **Celo Mainnet** for continues / helpers / packs / Blitz entry / Season Pass (clarifications Q07). Boast + optional TournamentVault stay on **Celo Sepolia** until a separate cutover.

Use this before public launch / co-marketing. May stay partially open until human sign-off in clarifications.

## A. Env & hosting

- [ ] Vercel Hobby project linked; Root Directory = repo root (uses `vercel.json`)
- [ ] Production env vars set from local `apps/web/.env` (**never commit**):
  - `VITE_MAGIC_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_URL` → blockblast (`zxtwshhlicditrvqafzo`)
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_TREASURY_ADDRESS` (Mainnet receiver)
  - `VITE_CELO_RPC_URL` / `VITE_CELO_CHAIN_ID` / `VITE_CUSD_TOKEN_ADDRESS`
  - `VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`
  - Optional: Boast + Tournament Sepolia addresses
- [ ] Production URL playable; Magic sign-in works; Supabase Edge calls succeed
- [ ] Supabase Edge secrets: `SENTRY_DSN`, Upstash, `SEASON_PASS_CRON_SECRET` as needed

## B. Payments (Mainnet cUSD)

- [ ] Treasury wallet funded only as receiver; deployer keys never in client
- [ ] Smoke: Second Chance revive → on-chain tx → `purchases.tx_hash`
- [ ] Smoke: Slow-mo / Shield helper purchase
- [ ] Smoke: Song pack unlock
- [ ] Smoke: Blitz entry fee + rake 15% path
- [ ] Smoke: Season Pass $2.99
- [ ] Spend caps soft-block after daily limits (client UX)

## C. Contracts / attestation

- [ ] Boast remains Sepolia until audit + Mainnet deploy decision
- [ ] Optional TournamentVault: stay Sepolia or migrate after audit
- [ ] Contract audit before any Mainnet vault holding entry fees / payouts (PRD §8)

## D. Product / compliance

- [ ] Auth required before play (`auth_all`)
- [ ] No ads / no skins shop / no game token
- [ ] MiniPay CTA live (stub until Q21 tester device/docs)
- [ ] Mute preference persists; empty/error states smoke-checked
- [ ] Mid-tier mobile perf: see `docs/g19-perf-budget.md`

## E. Sign-off

| Role | Date | Notes |
|------|------|-------|
| Human | | |
| Orchestrator | | |

Clarifications unlock: when MiniPay deep-link docs/device arrive, replace stub CTA (Q21).
