import { Container, Graphics } from 'pixi.js'

type Sparkle = {
  g: Graphics
  dx: number
  dy: number
  dur: number
  age: number
}

/**
 * Soft white sparkle particles on successful hits (design-pack .sparkle).
 * Complements glass shatter — short burst around the tile center.
 */
export function playHitSparkles(opts: {
  fxLayer: Container
  x: number
  y: number
  perfect: boolean
}): { update: (dtMs: number) => boolean; destroy: () => void } {
  const { fxLayer, x, y, perfect } = opts
  const root = new Container()
  root.position.set(x, y)
  fxLayer.addChild(root)

  const count = perfect ? 10 : 7
  const sparks: Sparkle[] = []
  const tint = perfect ? 0xffd54a : 0xffffff

  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25)
    const dist = 18 + Math.random() * (perfect ? 42 : 32)
    const size = 3 + Math.random() * 4
    const g = new Graphics()
    g.roundRect(-size / 2, -size / 2, size, size, 1).fill({
      color: tint,
      alpha: 0.9,
    })
    root.addChild(g)
    sparks.push({
      g,
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist - 8 - Math.random() * 16,
      dur: 420 + Math.random() * 220,
      age: 0,
    })
  }

  const destroy = () => {
    root.destroy({ children: true })
  }

  const update = (dtMs: number): boolean => {
    let alive = false
    for (const s of sparks) {
      s.age += dtMs
      const u = Math.min(1, s.age / s.dur)
      const e = 1 - Math.pow(1 - u, 1.8)
      s.g.position.set(s.dx * e, s.dy * e)
      s.g.scale.set(1 - 0.8 * e)
      s.g.alpha = 0.9 * (1 - u)
      if (u < 1) alive = true
    }
    return alive
  }

  return { update, destroy }
}
