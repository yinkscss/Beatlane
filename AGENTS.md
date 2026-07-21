## Learned User Preferences

- Prefers reviewing product and UI as HTML under `docs/` (PRD → design pack → beat pitch → roadmap → prompt pack → stack)
- Keep process and free-first stack across greenfield pivots when possible
- Celo + MiniPay is a hard product constraint for consumer games
- Player-facing prices use cUSD (stablecoin), not native CELO
- Hard bans for v1: no ads, no skins shop, no game token; monetize via impulse microspends (continues/helpers) and real content packs
- Wallet auth: Magic.link for now; MiniPay path when on Celo; auth required before any play (no guest play)
- Web-only distribution (no app stores / native wrappers in v1)
- Working title for current product: Beatlane (piano-tiles / four-lane rhythm tap); Block Drop abandoned as taken
- Beatlane playfield should match classic Piano Tiles look (soft sky→lavender gradient, light lanes), not dark stage chrome
- Beatlane should include hard/tricky obstacles (long holds, multi-lane bridges/hooks, fakes), not only basic black-tile taps
- Second Chance must not reduce play speed on revive; Hold tiles require holding until the tile finishes (not a short tap)
- Audio must use Web Audio API only (no Howler, Tone.js, or other extra audio libraries)

## Learned Workspace Facts

- Workspace root is `~/Projects/beatlane` (GitHub: `yinkscss/Beatlane`, private); renamed from `block-drop` / `Blockdrop`
- Current product docs: `docs/PRD.html`, `docs/design-pack.html`, `docs/beat-pitch.html`, `docs/ROADMAP.html`, `docs/prompt-pack.html`, `docs/clarifications.html`, `docs/clarifications-answers.md` (locked), `docs/STACK.html`, `docs/stack-deck.html` (Beatlane)
- Locked clarifications: monorepo `apps/web`+`contracts/`, npm, Node 22, Supabase `blockblast` greenfield (`project_ref=zxtwshhlicditrvqafzo`), Magic key via env only, **Celo Mainnet** for payments, auth required before play, Second Chance shield default ON ~2s, rake 15%, Season Pass 4 weeks, pixel-match pitch, max 3 implement retries, auto-git on PASS (no human pause), multiple commits per gate OK
- Supabase project name for Beatlane backend: `blockblast` (MCP)
- Agent build loop: Orchestrator (Grok 4.5) → Implement (Grok 4.5) → Verify-only (Grok 4.5) → Git commit/push (Composer 2.5) per roadmap gate
- Prior Block Drop docs archived under `docs/archive/block-drop/`
- Hit feedback direction (beat-pitch): glass-shatter crack/fade on successful taps (gold-tinted for PERFECT)
- Locked stack: Vite+React+TS, PixiJS (+ Web Audio), CSS Modules, Zustand, Supabase (Postgres + Edge Functions + Storage), Upstash Redis, Magic.link, Celo+cUSD, Foundry, app writes+chain receipt, HTTP polling, Vercel Hobby, GitHub Actions, Sentry, PostHog
- Charts are hand-authored JSON in-repo (chart clock drives tiles; no waveform analysis / MIDI pipeline in v1)
- Boast attestation deploys via Foundry to Celo Sepolia (testnet; Alfajores sunset); player payments remain Celo Mainnet cUSD
