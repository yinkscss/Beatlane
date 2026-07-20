## Learned User Preferences

- Block Drop is web-only (browser); no app stores or native wrappers in scope
- Monetization is session saves (Second Chance, Reshuffle, Undo/swap), not cosmetics or skins
- No ads (no interstitials, rewarded video, or ad SDKs)
- Player-facing prices use cUSD (stablecoin), not native CELO
- Prefers cheaper impulse microspends for continues/reshuffles over mid-casual IAP price points
- Wallet auth: Magic.link for now
- No jurisdiction / geo legal scope in the PRD for now
- Prefers reviewing product and UI as HTML under `docs/` (PRD + full-screen design pack)

## Learned Workspace Facts

- Workspace root is `~/Projects/block-drop`
- Product source of truth lives under `docs/`: `PRD.html`, `ROADMAP.html`, `design-pack.html`, `blast-pitch.html`, `stack-deck.html`, `STACK.html`
- Game is a Celo-rail web puzzle with on-chain checkout for session saves; no cosmetic shop in v1
- Locked free-first stack: Vite+React+TS, PixiJS, CSS Modules, Zustand, Supabase (Postgres + Edge Functions + Storage), Upstash Redis, Magic.link, Celo+cUSD, Foundry, app writes+chain receipt, HTTP polling leaderboards, Vercel Hobby web, GitHub Actions, Sentry, PostHog
