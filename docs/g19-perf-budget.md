# G19 — Mid-tier mobile perf budget

Target device class: mid-tier Android / iPhone SE-class (≈4G, 4–6 GB RAM).

## Budgets (production build)

| Metric | Budget | How to check |
|--------|--------|--------------|
| Initial JS (gzip, all app JS) | ≤ 550 KB | `verify-g19.mjs` (Pixi dominates; code-split) |
| Lighthouse Performance (mobile) | ≥ 70 | Chrome Lighthouse on prod URL, Slow 4G |
| LCP | ≤ 4.0 s | Lighthouse |
| INP / interaction | No multi-second stalls on Home → Play → first tap | Manual mid-tier device |
| Critical path jank | No obvious hitch on tile scroll / hit shatter | Manual play 60s Classic |

## Build choices (repo)

- Vite production build; hashed assets with long-cache headers (`vercel.json`)
- Manual chunks: `react-vendor`, `pixi` (see `apps/web/vite.config.ts`)
- SPA rewrite only for non-asset routes
- Respect `prefers-reduced-motion` where VFX can skip

## Verify offline

```bash
node apps/web/scripts/verify-g19.mjs
```

Records build sizes against the JS budget above. Full Lighthouse requires the live production URL.
