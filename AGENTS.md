## Learned User Preferences

- Prefers reviewing product and UI as HTML under `docs/` (PRD → design pack → beat pitch → roadmap → prompt pack → stack)
- During Play, use fullscreen (hide bottom nav); do not show Shield or Slow-mo helper controls on the gameplay HUD
- Celo + MiniPay is a hard product constraint for consumer games
- Player-facing prices use cUSD (stablecoin), not native CELO
- Hard bans for v1: no ads, no skins shop, no game token; monetize via impulse microspends (continues/helpers) and real content packs
- Wallet auth: Magic.link for now; MiniPay path when on Celo; auth required before any play (no guest play)
- Web-only distribution (no app stores / native wrappers in v1)
- Working title for current product: Beatlane (piano-tiles / four-lane rhythm tap); Block Drop abandoned as taken
- Beatlane playfield should match classic Piano Tiles look (soft sky→lavender gradient, light lanes), not dark stage chrome
- Beatlane should include hard/tricky obstacles (long holds, multi-lane bridges/hooks, fakes), not only basic black-tile taps
- Classic miss/hit: taps and hold-starts remain valid while any part of the tile is on-screen; auto-miss only after the tile fully leaves the bottom; Second Chance must not reduce play speed on revive; Hold tiles require holding until the tile finishes (not a short tap)
- Hold press target (`HOLD_TAP_LOCK: anywhere_on_tile`): press anywhere while any part of the hold is still on-screen; no visible hit line on the playfield — see `docs/hold-tap-pitch.html` / `docs/clarifications-answers.md`
- Audio must use Web Audio API only (no Howler, Tone.js, or other extra audio libraries)

## Learned Workspace Facts

- Workspace root is `~/Projects/beatlane` (GitHub: `yinkscss/Beatlane`, private); renamed from `block-drop` / `Blockdrop`
- Current product docs: `docs/PRD.html`, `docs/design-pack.html`, `docs/beat-pitch.html`, `docs/ROADMAP.html`, `docs/prompt-pack.html`, `docs/clarifications.html`, `docs/clarifications-answers.md` (locked), `docs/STACK.html`, `docs/stack-deck.html` (Beatlane); prior Block Drop docs under `docs/archive/block-drop/`
- Locked clarifications: monorepo `apps/web`+`contracts/`, npm, Node 22, Supabase `blockblast` greenfield (`project_ref=zxtwshhlicditrvqafzo`), Magic key via env only, **Celo Mainnet** for payments, auth required before play, Second Chance shield default ON ~2s, rake 15%, Season Pass 4 weeks, pixel-match pitch, max 3 implement retries, auto-git on PASS (no human pause), multiple commits per gate OK
- Agent build loop: Orchestrator (Grok 4.5) → Implement (Grok 4.5) → Verify-only (Grok 4.5) → Git commit/push (Composer 2.5) per roadmap gate
- Hit feedback direction (beat-pitch): glass-shatter crack/fade on successful taps (gold-tinted for PERFECT)
- Locked stack: Vite+React+TS, PixiJS (+ Web Audio), CSS Modules, Zustand, Supabase (Postgres + Edge Functions + Storage), Upstash Redis, Magic.link, Celo+cUSD, Foundry, app writes+chain receipt, HTTP polling, Vercel Hobby, GitHub Actions, Sentry, PostHog
- Charts are hand-authored JSON in-repo (chart clock drives tiles; no waveform analysis / MIDI pipeline in v1)
- On-chain/payments: Boast attestation via Foundry on Celo Sepolia (Alfajores sunset); player payments Mainnet cUSD; G16 Blitz cups (15% rake); G17 Season Pass $2.99 cUSD / 4 weeks (continues + track unlocks only)
- G18 Observability: Sentry (`VITE_SENTRY_DSN` + Edge `SENTRY_DSN`) + PostHog funnels (`start_run`, `miss`, `purchase_continue`, `unlock_pack`); `VITE_POSTHOG_KEY` must be `phc_` (not personal `phx_`); CI job `ci`; live prove via `apps/web/scripts/prove-g18-cloud.mjs`
- G19 Launch polish shipped: production `https://beatlane.vercel.app`; `vercel.json` (apps/web); MiniPay CTA stub (Q21); soft spend caps + mute persistence; perf budget `docs/g19-perf-budget.md`; Mainnet cutover `docs/mainnet-cutover-checklist.md`; deploy via `apps/web/scripts/deploy-g19-vercel.mjs` (never print secrets); prefer Vercel auto-deploy enabled
- Second Chance / continue payments require `VITE_TREASURY_ADDRESS` (plus related payment env) in `apps/web` and Vercel — missing treasury surfaces a client error on purchase
- Never commit secrets: keep real keys only in gitignored `.env` / `contracts/.env`; restore `.env.example` to empty placeholders
