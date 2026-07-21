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
| `t` | number | Hit time in seconds from music start (after `offset`) |
| `lane` | `0`–`3` | Left → right |
| `type` | `"tap"` | G6+ adds `hold` / bomb types |

## Event

| Field | Type | Notes |
|-------|------|--------|
| `t` | number | Event time (same clock as notes) |
| `type` | `"speed_up"` | G5; more event types in G6+ |
| `mult` | number | Optional scroll multiplier (default `1.35`) |

## Clock

```
songTime = AudioContext.currentTime - musicStartTime + chart.offset
```

Tiles spawn so their centers cross the hit line near `note.t`. `SPEED UP` shows a banner + countdown, then multiplies scroll rate.
