import {
  Application,
  Container,
  FillGradient,
  Graphics,
  Rectangle,
} from 'pixi.js'
import type { Chart } from '@/charts/schema'
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

export type SpeedUpPhase =
  | { phase: 'banner' }
  | { phase: 'countdown'; n: number }
  | { phase: 'apply'; mult: number }
  | { phase: 'clear' }

/** Song time in seconds from music start (before chart.offset). Null if music not ready. */
export type SongClock = () => number | null

export type ClassicPlayfieldHandlers = {
  onHit?: (grade: HitGrade, score: number, combo: number) => void
  onFail?: (reason: FailReason, score: number, combo: number) => void
  onSpeedUp?: (ev: SpeedUpPhase) => void
  onChartComplete?: (score: number, combo: number) => void
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

const SPEED_BANNER_MS = 900
const SPEED_COUNT_MS = 480
const DEFAULT_SPEED_MULT = 1.35

/**
 * Classic playfield: four lanes, chart-scheduled tiles (G5), glass shatter + sparkles.
 * Timing = chart + music clock (not waveform analysis). Audio stays in `@/audio/runtime`.
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
  private w = 0
  private h = 0
  private resizeObs: ResizeObserver | null = null
  private onKey: ((e: KeyboardEvent) => void) | null = null
  private gradient: FillGradient | null = null

  private chart: Chart | null = null
  private clock: SongClock | null = null
  private noteIndex = 0
  private eventIndex = 0
  private speedMult = 1
  private baseHeightsPerSec: number = SCROLL.heightsPerSec
  private localStartMs = 0
  private chartDone = false
  private speedTimers: number[] = []

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

  getChart() {
    return this.chart
  }

  setSongClock(clock: SongClock | null) {
    this.clock = clock
  }

  setChart(chart: Chart | null) {
    this.chart = chart
    this.baseHeightsPerSec =
      chart?.scrollHeightsPerSec ?? SCROLL.heightsPerSec
    this.resetChartCursor()
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
    this.resetChartCursor()
    this.localStartMs = performance.now()

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

  /** DEV: song clock seconds including chart offset (null if waiting on music). */
  getSongTime(): number | null {
    return this.songTimeSec()
  }

  restart(): void {
    this.clearSpeedTimers()
    this.handlers.onSpeedUp?.({ phase: 'clear' })
    this.clearTiles()
    this.clearFx()
    this.failed = false
    this.running = true
    this.score = 0
    this.combo = 0
    this.resetChartCursor()
    this.localStartMs = performance.now()
  }

  destroy(): void {
    this.running = false
    this.clearSpeedTimers()
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

  private resetChartCursor() {
    this.noteIndex = 0
    this.eventIndex = 0
    this.speedMult = 1
    this.chartDone = false
    this.baseHeightsPerSec =
      this.chart?.scrollHeightsPerSec ?? SCROLL.heightsPerSec
  }

  private clearSpeedTimers() {
    for (const id of this.speedTimers) window.clearTimeout(id)
    this.speedTimers = []
  }

  /**
   * Song clock + chart.offset. When a music clock is wired, returns null until
   * `getMusicStartTime()` is available so we never mix local + audio clocks.
   */
  private songTimeSec(): number | null {
    const offset = this.chart?.offset ?? 0
    if (this.clock) {
      const t = this.clock()
      if (t == null) return null
      return t + offset
    }
    return (performance.now() - this.localStartMs) / 1000 + offset
  }

  private travelTimeSec(): number {
    if (this.h <= 0) return 1.2
    const { h: tileH } = this.tileSize()
    const hitY = this.h * PLAYFIELD.hitLineY
    const speed = this.h * this.baseHeightsPerSec * this.speedMult
    if (speed <= 0) return 1.2
    // Spawn top at -tileH; center crosses hit line at y = hitY - tileH/2
    const dist = hitY - tileH / 2 - -tileH
    return dist / speed
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
    body
      .rect(0, h - 3, w, 3)
      .fill({ color: PLAYFIELD.tileInsetHighlight, alpha: 0.06 })
    root.addChild(body)
    this.tilesLayer.addChild(root)
    this.tiles.push({ root, body, lane, y: -h, w, h, hit: false, dying: false })
  }

  private beginSpeedUp(mult: number) {
    this.clearSpeedTimers()
    this.handlers.onSpeedUp?.({ phase: 'banner' })

    let delay = SPEED_BANNER_MS
    for (const n of [3, 2, 1] as const) {
      const id = window.setTimeout(() => {
        if (this.failed || !this.running) return
        this.handlers.onSpeedUp?.({ phase: 'countdown', n })
      }, delay)
      this.speedTimers.push(id)
      delay += SPEED_COUNT_MS
    }

    const applyId = window.setTimeout(() => {
      if (this.failed || !this.running) return
      this.speedMult *= mult
      this.handlers.onSpeedUp?.({ phase: 'apply', mult: this.speedMult })
      const clearId = window.setTimeout(() => {
        this.handlers.onSpeedUp?.({ phase: 'clear' })
      }, 400)
      this.speedTimers.push(clearId)
    }, delay)
    this.speedTimers.push(applyId)
  }

  private scheduleFromChart(songTime: number) {
    const chart = this.chart
    if (!chart) return

    while (
      this.eventIndex < chart.events.length &&
      songTime >= chart.events[this.eventIndex].t
    ) {
      const ev = chart.events[this.eventIndex++]
      if (ev.type === 'speed_up') {
        this.beginSpeedUp(ev.mult ?? DEFAULT_SPEED_MULT)
      }
    }

    const lead = this.travelTimeSec()
    while (
      this.noteIndex < chart.notes.length &&
      songTime >= chart.notes[this.noteIndex].t - lead
    ) {
      const note = chart.notes[this.noteIndex++]
      this.spawnTile(note.lane)
    }

    if (
      !this.chartDone &&
      this.noteIndex >= chart.notes.length &&
      this.tiles.length === 0
    ) {
      this.chartDone = true
      this.handlers.onChartComplete?.(this.score, this.combo)
    }
  }

  private tick = () => {
    if (!this.app || !this.running || this.failed) {
      this.updateFxOnly()
      return
    }
    const dtMs = this.app.ticker.deltaMS
    const dt = dtMs / 1000
    const songTime = this.songTimeSec()

    // Wait for music start before chart scheduling / scroll (keeps clock authoritative).
    if (this.chart && songTime == null) {
      this.updateFx(dtMs)
      return
    }

    if (this.chart && songTime != null) {
      this.scheduleFromChart(songTime)
    }

    const speed = this.h * this.baseHeightsPerSec * this.speedMult
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
    // Wait for music clock — unlock gestures must not count as Classic wrong-taps.
    if (this.chart && this.songTimeSec() == null) return

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

    this.tiles = this.tiles.filter((t) => t !== tile)
    window.setTimeout(() => {
      tile.root.destroy({ children: true })
    }, 450)
  }

  private fail(reason: FailReason) {
    if (this.failed) return
    this.failed = true
    this.running = false
    this.clearSpeedTimers()
    this.handlers.onSpeedUp?.({ phase: 'clear' })
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
