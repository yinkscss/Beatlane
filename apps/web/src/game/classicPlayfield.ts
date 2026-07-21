import {
  Application,
  Container,
  FillGradient,
  Graphics,
  Rectangle,
} from 'pixi.js'
import { playGlassShatter, type ShatterGrade } from '@/game/glassShatter'
import { playHitSparkles } from '@/game/hitSparkles'
import { pointsForGrade } from '@/game/judging'
import {
  HIT_WINDOW_TILES,
  PERFECT_WINDOW_TILES,
  PLAYFIELD,
  SCROLL,
} from '@/game/playfieldTheme'

export type FailReason = 'miss' | 'wrong'
export type HitGrade = ShatterGrade

export type ClassicPlayfieldHandlers = {
  onHit?: (grade: HitGrade, score: number, combo: number) => void
  onFail?: (reason: FailReason, score: number, combo: number) => void
}

type Tile = {
  root: Container
  body: Graphics
  lane: number
  /** Top edge Y in playfield coords. */
  y: number
  w: number
  h: number
  hit: boolean
  dying: boolean
}

type FxJob = { update: (dtMs: number) => boolean; destroy: () => void }

/**
 * Classic stub playfield: four lanes, scrolling tiles, glass shatter + sparkles,
 * score/combo for G3 HUD. Audio lives in `@/audio/runtime` (G4), wired from Play.
 */
export class ClassicPlayfield {
  private app: Application | null = null
  private host: HTMLElement | null = null
  private handlers: ClassicPlayfieldHandlers
  private bg = new Graphics()
  private lanesGfx = new Graphics()
  private hitBand = new Graphics()
  private tilesLayer = new Container()
  private fxLayer = new Container()
  private inputLayer = new Graphics()
  private tiles: Tile[] = []
  private fxJobs: FxJob[] = []
  private running = false
  private failed = false
  private score = 0
  private combo = 0
  private spawnAcc = 0
  private spawnMs: number = SCROLL.spawnMs
  private lastLane = -1
  private w = 0
  private h = 0
  private resizeObs: ResizeObserver | null = null
  private onKey: ((e: KeyboardEvent) => void) | null = null
  private gradient: FillGradient | null = null

  constructor(handlers: ClassicPlayfieldHandlers = {}) {
    this.handlers = handlers
  }

  getScore() {
    return this.score
  }

  getCombo() {
    return this.combo
  }

  isFailed() {
    return this.failed
  }

  async mount(host: HTMLElement): Promise<void> {
    this.host = host
    const app = new Application()
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    })
    this.app = app

    host.replaceChildren(app.canvas)
    app.canvas.style.display = 'block'
    app.canvas.style.width = '100%'
    app.canvas.style.height = '100%'
    app.canvas.style.touchAction = 'none'

    const stage = app.stage
    stage.addChild(this.bg)
    stage.addChild(this.lanesGfx)
    stage.addChild(this.tilesLayer)
    stage.addChild(this.hitBand)
    stage.addChild(this.fxLayer)
    stage.addChild(this.inputLayer)

    this.inputLayer.eventMode = 'static'
    this.inputLayer.cursor = 'pointer'
    this.inputLayer.on('pointerdown', this.onPointer)

    this.onKey = (e: KeyboardEvent) => {
      if (this.failed || !this.running) return
      const map: Record<string, number> = {
        '1': 0,
        '2': 1,
        '3': 2,
        '4': 3,
        d: 0,
        f: 1,
        j: 2,
        k: 3,
        D: 0,
        F: 1,
        J: 2,
        K: 3,
      }
      const lane = map[e.key]
      if (lane === undefined) return
      e.preventDefault()
      this.tapLane(lane)
    }
    window.addEventListener('keydown', this.onKey)

    this.resizeObs = new ResizeObserver(() => this.layout())
    this.resizeObs.observe(host)
    this.layout()

    this.running = true
    this.failed = false
    this.score = 0
    this.combo = 0
    this.spawnAcc = 400
    this.spawnMs = SCROLL.spawnMs

    app.ticker.add(this.tick)

    if (import.meta.env.DEV) {
      ;(window as unknown as { __beatlane?: ClassicPlayfield }).__beatlane =
        this
    }
  }

  /** DEV/test: lanes with a currently hittable tile. */
  getHittableLanes(): number[] {
    if (this.failed || !this.running) return []
    const hitY = this.h * PLAYFIELD.hitLineY
    const lanes: number[] = []
    for (const t of this.tiles) {
      if (t.hit || t.dying) continue
      const window = t.h * HIT_WINDOW_TILES
      const top = t.y
      const bottom = t.y + t.h
      if (bottom >= hitY - window && top <= hitY + window * 0.35) {
        lanes.push(t.lane)
      }
    }
    return lanes
  }

  restart(): void {
    this.clearTiles()
    this.clearFx()
    this.failed = false
    this.running = true
    this.score = 0
    this.combo = 0
    this.spawnAcc = 400
    this.spawnMs = SCROLL.spawnMs
    this.lastLane = -1
  }

  destroy(): void {
    this.running = false
    if (this.onKey) window.removeEventListener('keydown', this.onKey)
    this.onKey = null
    this.resizeObs?.disconnect()
    this.resizeObs = null
    this.clearTiles()
    this.clearFx()
    this.gradient?.destroy()
    this.gradient = null
    if (this.app) {
      this.app.ticker.remove(this.tick)
      this.inputLayer.off('pointerdown', this.onPointer)
      this.app.destroy(true, { children: true })
      this.app = null
    }
    if (this.host) this.host.replaceChildren()
    this.host = null
    if (import.meta.env.DEV) {
      const w = window as unknown as { __beatlane?: ClassicPlayfield }
      if (w.__beatlane === this) delete w.__beatlane
    }
  }

  private layout = () => {
    if (!this.app || !this.host) return
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.w = w
    this.h = h
    this.app.renderer.resize(w, h)
    this.drawBackdrop()
    this.drawLanes()
    this.drawHitBand()
    this.inputLayer.clear()
    this.inputLayer.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.001 })
    this.inputLayer.hitArea = new Rectangle(0, 0, w, h)
  }

  private drawBackdrop() {
    this.gradient?.destroy()
    const grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0.35, y: 1 },
      colorStops: PLAYFIELD.gradient.map((s) => ({
        offset: s.offset,
        color: s.color,
      })),
      textureSpace: 'local',
    })
    this.gradient = grad
    this.bg.clear()
    this.bg.rect(0, 0, this.w, this.h).fill(grad)

    // Faint diamond hatch (PRD §5.1) — light white rules
    const step = 48
    this.bg.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.12 })
    for (let i = -this.h; i < this.w + this.h; i += step) {
      this.bg.moveTo(i, 0)
      this.bg.lineTo(i + this.h, this.h)
      this.bg.moveTo(i, this.h)
      this.bg.lineTo(i + this.h, 0)
    }
    this.bg.stroke()
  }

  private drawLanes() {
    const { lanes, laneRule, laneRuleAlpha } = PLAYFIELD
    const laneW = this.w / lanes
    this.lanesGfx.clear()
    for (let i = 1; i < lanes; i++) {
      const x = Math.round(i * laneW) + 0.5
      this.lanesGfx.moveTo(x, 0)
      this.lanesGfx.lineTo(x, this.h)
      this.lanesGfx.stroke({
        width: 1.5,
        color: laneRule,
        alpha: laneRuleAlpha,
      })
    }
  }

  private drawHitBand() {
    const y = this.h * PLAYFIELD.hitLineY
    const left = this.w * 0.08
    const right = this.w * 0.92
    this.hitBand.clear()
    // Soft glow
    this.hitBand
      .roundRect(left, y - 4, right - left, 8, 4)
      .fill({ color: 0xffffff, alpha: 0.18 })
    this.hitBand
      .roundRect(left, y - 1.5, right - left, 3, 2)
      .fill({ color: PLAYFIELD.hitLine, alpha: 1 })
  }

  private laneWidth() {
    return this.w / PLAYFIELD.lanes
  }

  private tileSize() {
    const laneW = this.laneWidth()
    const w = laneW * (1 - PLAYFIELD.tileInsetX * 2)
    const h = this.h * PLAYFIELD.tileHeight
    return { w, h }
  }

  private spawnTile(lane: number) {
    const { w, h } = this.tileSize()
    const laneW = this.laneWidth()
    const x = lane * laneW + laneW * PLAYFIELD.tileInsetX
    const root = new Container()
    root.position.set(x, -h)
    const body = new Graphics()
    body.roundRect(0, 0, w, h, 4).fill({ color: PLAYFIELD.tile })
    // Subtle inset edge like pitch tile
    body
      .rect(0, h - 3, w, 3)
      .fill({ color: PLAYFIELD.tileInsetHighlight, alpha: 0.06 })
    root.addChild(body)
    this.tilesLayer.addChild(root)
    this.tiles.push({ root, body, lane, y: -h, w, h, hit: false, dying: false })
  }

  private pickLane(): number {
    let lane = Math.floor(Math.random() * PLAYFIELD.lanes)
    if (lane === this.lastLane && Math.random() < 0.7) {
      lane = (lane + 1 + Math.floor(Math.random() * 3)) % PLAYFIELD.lanes
    }
    this.lastLane = lane
    return lane
  }

  private tick = () => {
    if (!this.app || !this.running || this.failed) {
      this.updateFxOnly()
      return
    }
    const dtMs = this.app.ticker.deltaMS
    const dt = dtMs / 1000
    const speed = this.h * SCROLL.heightsPerSec

    // Spawn
    this.spawnAcc += dtMs
    if (this.spawnAcc >= this.spawnMs) {
      this.spawnAcc = 0
      this.spawnTile(this.pickLane())
      this.spawnMs = Math.max(
        SCROLL.minSpawnMs,
        this.spawnMs - 4,
      )
    }

    const hitY = this.h * PLAYFIELD.hitLineY
    const still: Tile[] = []
    for (const tile of this.tiles) {
      if (tile.dying) continue
      tile.y += speed * dt
      tile.root.y = tile.y

      const window = tile.h * HIT_WINDOW_TILES
      if (!tile.hit && tile.y > hitY + window * 0.55) {
        this.fail('miss')
        tile.root.alpha = 0.35
        still.push(tile)
        continue
      }
      still.push(tile)
    }
    this.tiles = still.filter((t) => !t.dying)

    this.updateFx(dtMs)
  }

  private updateFxOnly() {
    if (!this.app) return
    this.updateFx(this.app.ticker.deltaMS)
  }

  private updateFx(dtMs: number) {
    const next: FxJob[] = []
    for (const job of this.fxJobs) {
      if (job.update(dtMs)) next.push(job)
      else job.destroy()
    }
    this.fxJobs = next
  }

  private onPointer = (e: { global: { x: number; y: number } }) => {
    if (this.failed || !this.running || !this.app) return
    const local = this.app.stage.toLocal(e.global)
    const lane = Math.min(
      PLAYFIELD.lanes - 1,
      Math.max(0, Math.floor(local.x / this.laneWidth())),
    )
    this.tapLane(lane)
  }

  private tapLane(lane: number) {
    if (this.failed || !this.running) return
    const hitY = this.h * PLAYFIELD.hitLineY
    const candidates = this.tiles.filter((t) => {
      if (t.lane !== lane || t.hit || t.dying) return false
      const window = t.h * HIT_WINDOW_TILES
      const top = t.y
      const bottom = t.y + t.h
      return bottom >= hitY - window && top <= hitY + window * 0.35
    })

    if (candidates.length === 0) {
      this.fail('wrong')
      return
    }

    // Nearest to hit line
    candidates.sort(
      (a, b) =>
        Math.abs(a.y + a.h / 2 - hitY) - Math.abs(b.y + b.h / 2 - hitY),
    )
    const tile = candidates[0]
    this.hitTile(tile)
  }

  private hitTile(tile: Tile) {
    tile.hit = true
    tile.dying = true
    const hitY = this.h * PLAYFIELD.hitLineY
    const dist = Math.abs(tile.y + tile.h / 2 - hitY)
    const grade: HitGrade =
      dist <= tile.h * PERFECT_WINDOW_TILES ? 'perfect' : 'great'

    this.combo += 1
    this.score += pointsForGrade(grade)
    this.handlers.onHit?.(grade, this.score, this.combo)

    const job = playGlassShatter({
      tile: tile.root,
      fxLayer: this.fxLayer,
      grade,
      tileW: tile.w,
      tileH: tile.h,
    })
    this.fxJobs.push(job)

    const world = tile.root.getGlobalPosition()
    const local = this.fxLayer.toLocal(world)
    const sparkles = playHitSparkles({
      fxLayer: this.fxLayer,
      x: local.x + tile.w / 2,
      y: local.y + tile.h / 2,
      perfect: grade === 'perfect',
    })
    this.fxJobs.push(sparkles)

    // Remove tile from active list after shatter starts; visual stays until job hides it
    this.tiles = this.tiles.filter((t) => t !== tile)
    window.setTimeout(() => {
      tile.root.destroy({ children: true })
    }, 450)
  }

  private fail(reason: FailReason) {
    if (this.failed) return
    this.failed = true
    this.running = false
    const endedCombo = this.combo
    this.combo = 0
    this.handlers.onFail?.(reason, this.score, endedCombo)
  }

  private clearTiles() {
    for (const t of this.tiles) {
      if (!t.root.destroyed) t.root.destroy({ children: true })
    }
    this.tiles = []
    this.tilesLayer.removeChildren()
  }

  private clearFx() {
    for (const j of this.fxJobs) j.destroy()
    this.fxJobs = []
    this.fxLayer.removeChildren()
  }
}
