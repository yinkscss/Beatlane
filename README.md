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
open docs/STACK.html        # Locked free-first stack
open docs/stack-deck.html   # Interactive stack picker
```

Prior Block Drop materials (abandoned pivot): `docs/archive/block-drop/`.

## Stack (locked)

Vite + React + TypeScript · PixiJS + Web Audio · CSS Modules · Zustand · Supabase (Postgres, Edge Functions, Storage) · Upstash Redis · Magic.link · Celo + cUSD · Foundry · Vercel Hobby · GitHub Actions · Sentry · PostHog

Audio: Web Audio only in v1 — songs are Storage audio + JSON charts; the chart clock drives gameplay.

## Status

Greenfield product docs and design. App scaffold not started yet.
