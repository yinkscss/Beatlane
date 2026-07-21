# Beatlane chart schema (v1)

Hand-authored JSON charts drive tiles. The **chart + music start time** is the gameplay clock — not waveform analysis.

Loaded from `public/charts/*.json` (G5). Storage signed URLs land in G12.

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
| `t` | number | Hit time in seconds from music start (after `offset`). For `hold`, press/start time. |
| `lane` | `0`–`3` | Left → right |
| `type` | `"tap"` \| `"hold"` \| `"bomb"` | G6: hold until length completes; bomb fails if pressed |
| `length` | number | **Required for `hold`**. Hold duration in seconds (press until complete; slight forgiveness OK). |

## Event

| Field | Type | Notes |
|-------|------|--------|
| `t` | number | Event time (same clock as notes) |
| `type` | `"speed_up"` \| `"hold"` \| `"dont_tap"` \| `"double"` | SPEED UP countdown; obstacle banners for HOLD / DON'T TAP / DOUBLE |
| `mult` | number | Optional scroll multiplier for `speed_up` (default `1.35`) |
| `duration` | number | Obstacle banner seconds; clamped to **3–8** (default `4`) |

**DOUBLE rows:** author two (or more) notes with the same `t` in different lanes, plus a `double` banner event. Dual-lane rows are obstacle events — not every row.

## Clock

```
songTime = AudioContext.currentTime - musicStartTime + chart.offset
```

Tiles spawn so their centers (taps/bombs) or leading edges (holds) cross the hit line near `note.t`. `SPEED UP` shows a banner + countdown, then multiplies scroll rate. Obstacle banners (`hold` / `dont_tap` / `double`) display for 3–8s.
