import { Container, Graphics } from 'pixi.js'

/** Irregular shard silhouettes from docs/beat-pitch.html SHARD_CLIPS (percent polygons). */
const SHARD_CLIPS: string[] = [
  '50% 0%, 100% 35%, 70% 100%, 20% 80%',
  '0% 20%, 55% 0%, 100% 50%, 40% 100%, 0% 70%',
  '15% 0%, 100% 10%, 85% 100%, 0% 60%',
  '0% 0%, 100% 0%, 60% 100%, 0% 80%',
  '30% 0%, 100% 40%, 80% 100%, 0% 100%, 10% 40%',
  '0% 40%, 70% 0%, 100% 70%, 45% 100%',
  '20% 0%, 100% 0%, 100% 100%, 50% 70%, 0% 100%',
  '0% 0%, 80% 20%, 100% 100%, 10% 90%',
]

export type ShatterGrade = 'perfect' | 'great'

type ShardAnim = {
  g: Graphics
  dx: number
  dy: number
  rot0: number
  rot1: number
  dur: number
  delay: number
  age: number
}

function parseClip(clip: string, w: number, h: number): number[] {
  const pts: number[] = []
  for (const part of clip.split(',')) {
    const [xs, ys] = part.trim().split(/\s+/)
    pts.push((parseFloat(xs) / 100) * w, (parseFloat(ys) / 100) * h)
  }
  return pts
}

function drawShardBody(g: Graphics, w: number, h: number, clip: string, perfect: boolean) {
  const pts = parseClip(clip, w, h)
  g.clear()
  g.poly(pts, true)
  if (perfect) {
    g.fill({ color: 0x141008, alpha: 0.72 })
    g.stroke({ width: 1, color: 0xffd54a, alpha: 0.65 })
  } else {
    g.fill({ color: 0x0d0d12, alpha: 0.75 })
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.45 })
  }
  // Specular edge — glass highlight
  const hw = w * 0.55
  const hh = h * 0.35
  g.poly([0, 0, hw, 0, hw * 0.35, hh, 0, hh * 0.7], true)
  g.fill({ color: perfect ? 0xffe678 : 0xc8e6ff, alpha: perfect ? 0.35 : 0.28 })
}

function drawCrackOverlay(w: number, h: number): Graphics {
  const g = new Graphics()
  const strokes: Array<{ a: number; b: number; c: number; d: number; alpha: number }> = [
    { a: w * 0.15, b: h * 0.1, c: w * 0.85, d: h * 0.55, alpha: 0.7 },
    { a: w * 0.7, b: h * 0.05, c: w * 0.25, d: h * 0.9, alpha: 0.55 },
    { a: w * 0.05, b: h * 0.45, c: w * 0.95, d: h * 0.35, alpha: 0.5 },
    { a: w * 0.4, b: 0, c: w * 0.55, d: h, alpha: 0.4 },
  ]
  for (const s of strokes) {
    g.moveTo(s.a, s.b)
    g.lineTo(s.c, s.d)
    g.stroke({ width: 1.5, color: 0xffffff, alpha: s.alpha })
  }
  g.moveTo(w * 0.2, h * 0.7)
  g.lineTo(w * 0.9, h * 0.2)
  g.stroke({ width: 1.2, color: 0xc8e6ff, alpha: 0.5 })
  g.blendMode = 'screen'
  return g
}

function drawFlash(w: number, h: number, perfect: boolean): Graphics {
  const g = new Graphics()
  g.roundRect(-w * 0.04, -h * 0.04, w * 1.08, h * 1.08, 6)
  g.fill({ color: perfect ? 0xfff5b4 : 0xffffff, alpha: perfect ? 0.85 : 0.75 })
  return g
}

/**
 * Crack → flash → shard burst matching beat-pitch.html shatterTile aesthetics.
 * Mutates `tile` (hides after crack), adds VFX under `fxLayer`, returns ticker updater + cleanup.
 */
export function playGlassShatter(opts: {
  tile: Container
  fxLayer: Container
  grade: ShatterGrade
  tileW: number
  tileH: number
}): { update: (dtMs: number) => boolean; destroy: () => void } {
  const { tile, fxLayer, grade, tileW, tileH } = opts
  const perfect = grade === 'perfect'
  const world = tile.getGlobalPosition()
  // Tile pivot is top-left within its parent; get bounds center in fxLayer space
  const parent = fxLayer
  const local = parent.toLocal(world)
  const cx = local.x + tileW / 2
  const cy = local.y + tileH / 2

  const cracks = drawCrackOverlay(tileW, tileH)
  tile.addChild(cracks)

  const flash = drawFlash(tileW, tileH, perfect)
  flash.position.set(local.x, local.y)
  flash.alpha = 0.95
  fxLayer.addChild(flash)

  // Crack prep: brief brightness pop (pitch glassCrack ~100ms)
  tile.scale.set(1.04)
  tile.alpha = 1

  const shards: ShardAnim[] = []
  const count = perfect ? 11 : 8
  const burst = new Container()
  burst.position.set(cx, cy)
  fxLayer.addChild(burst)

  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2)
    const dist = 36 + Math.random() * (perfect ? 70 : 52)
    const w = 10 + Math.random() * 16
    const h = 12 + Math.random() * 20
    const g = new Graphics()
    drawShardBody(g, w, h, SHARD_CLIPS[i % SHARD_CLIPS.length], perfect)
    g.pivot.set(w / 2, h / 2)
    const rot0 = (Math.random() * 40 - 20) * (Math.PI / 180)
    g.rotation = rot0
    burst.addChild(g)
    shards.push({
      g,
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist - 12 - Math.random() * 28,
      rot0,
      rot1: (140 + Math.random() * 220) * (Math.PI / 180),
      dur: 420 + Math.random() * 280,
      delay: i * 8,
      age: 0,
    })
  }

  let elapsed = 0
  let tileHidden = false
  let flashDone = false

  const destroy = () => {
    cracks.destroy()
    flash.destroy()
    burst.destroy({ children: true })
  }

  const update = (dtMs: number): boolean => {
    elapsed += dtMs

    // Flash out ~280ms (glassFlash)
    if (!flashDone) {
      const t = Math.min(1, elapsed / 280)
      flash.alpha = 0.95 * (1 - t)
      flash.scale.set(0.9 + t * 0.45)
      if (t >= 1) {
        flash.visible = false
        flashDone = true
      }
    }

    // Hide tile after brief crack (~70ms)
    if (!tileHidden && elapsed >= 70) {
      tile.visible = false
      tileHidden = true
    } else if (!tileHidden) {
      const crackT = Math.min(1, elapsed / 100)
      tile.scale.set(1 + 0.04 * (1 - crackT * 0.5))
    }

    let alive = !flashDone || shards.some((s) => s.age < s.delay + s.dur)
    for (const s of shards) {
      s.age += dtMs
      if (s.age < s.delay) {
        s.g.visible = false
        continue
      }
      s.g.visible = true
      const u = Math.min(1, (s.age - s.delay) / s.dur)
      // cubic-bezier-ish ease out (pitch shardFly)
      const e = 1 - Math.pow(1 - u, 2.2)
      s.g.position.set(s.dx * e, s.dy * e)
      s.g.rotation = s.rot0 + (s.rot1 - s.rot0) * e
      s.g.scale.set(1 - 0.65 * e)
      s.g.alpha = u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65
      if (u >= 1) alive = alive && false
    }

    if (elapsed > 750) return false
    return alive || elapsed < 300
  }

  return { update, destroy }
}
