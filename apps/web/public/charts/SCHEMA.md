# Beatlane chart schema (v1)

Hand-authored JSON charts drive tiles. The **chart + music start time** is the gameplay clock — not waveform analysis.

Loaded from Supabase Storage signed URLs (G12) via `resolve-chart-assets`, with in-repo `public/charts/*.json` samples kept for local smoke (G5–G11).

## Top level

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `schemaVersion` | `1` | yes | Bump only on breaking changes |
| `id` | string | yes | Stable id (`sample-easy`) |
| `title` | string | yes | Display name |
| `difficulty` | `"easy"` \| `"normal"` \| `"hard"` | yes | |
| `bpm` | number | yes | Authoring reference; timing uses `t` seconds |
| `offset` | number | yes | Seconds added to music clock before hit/event compare |
| `audio` | string | yes | URL path (e.g. `/audio/bed.wav`) |
| `scrollHeightsPerSec` | number | no | Override base scroll (default playfield theme) |
| `notes` | Note[] | yes | Sorted ascending by `t` |
| `events` | Event[] | yes | Sorted ascending by `t` (may be `[]`) |

## Note

| Field | Type | Notes |
|-------|------|--------|
| `t` | number | Hit time in seconds from music start (after `offset`). For holds, press/start time. |
| `lane` | `0`–`3` | Left → right. For `bridge`/`triple`, **leftmost** lane. For `slide`, start lane. |
| `type` | see below | G5/G6 basics + G11 hard shapes |
| `length` | number | Required for `l_hook`, `fake_gap` |
| `foot` | `-1` \| `1` | Required for `l_hook` — foot direction into neighbor |
| `endLane` | `0`–`3` | Required for `slide` — destination lane (≠ `lane`) |
| `gapAt` | number | Optional for `fake_gap` — gap start fraction of length (default `0.4`) |
| `gapLen` | number | Optional for `fake_gap` — gap fraction (default `0.2`) |
| `mod` | `"ice"` \| `"gold"` | Optional per-note tint / gold bonus score |

### Note `type` values

| `type` | Behavior |
|--------|----------|
| `tap` | Standard black tile |
| `bomb` | Don't tap — press fails |
| `bridge` | 2-wide bar; cover both lanes (two fingers / keys) |
| `triple` | 3-wide bar; cover all three lanes |
| `l_hook` | Stem hold in `lane` + foot into neighbor (`foot`) |
| `fake_gap` | Hold black segments; white mid-gap must not be pressed |
| `slide` | Tile slides from `lane` → `endLane` before the hit line |

**Pattern-only hard shapes** (no dedicated note type — author notes + banner):

- **ZIG** — staggered taps A→B→C (+ `zig` event)
- **SPLIT** — outer lanes same `t` (+ `split` event)
- **CASCADE** — rapid diagonal taps (+ `cascade` event)
- **TRAP DOUBLE** — safe tap + bomb same `t` (+ `trap_double` event)

## Event

| Field | Type | Notes |
|-------|------|--------|
| `t` | number | Event time (same clock as notes) |
| `type` | see below | SPEED UP or obstacle / modifier banner |
| `mult` | number | Optional scroll multiplier for `speed_up` (default `1.35`) |
| `duration` | number | Obstacle/modifier banner seconds; clamped to **3–8** (default `4`) |

### Event `type` values

| `type` | Role |
|--------|------|
| `speed_up` | Banner + countdown, then scroll mult |
| `dont_tap` / `double` | G6 basic banners |
| `ice` | Slow-then-burst tempo modifier |
| `gold` | Gold-rush window (gold notes score bonus) |
| `fog` | Low visibility overlay |
| `reverse` | Lane input flip (0↔3, 1↔2) |
| `bridge` / `triple` / `l_hook` / `zig` / `split` / `fake_gap` / `slide` / `cascade` / `trap_double` | Hard shape banners |

**Tournament Blitz (G16):** Reverse / Fog / Fake Gap are **banned** — see `blitzWhitelist.ts`. Flag only in G11; not forced into Blitz charts.

**DOUBLE / SPLIT / TRAP:** author matching notes at the same `t` plus the banner event.

## Clock

```
songTime = AudioContext.currentTime - musicStartTime + chart.offset
```

Tiles spawn so their centers (taps/bombs/slides) or leading edges (holds) cross the hit line near `note.t`. `SPEED UP` shows a banner + countdown, then multiplies scroll rate. Obstacle banners display for 3–8s.
