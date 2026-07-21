import {
  Application,
  Container,
  FillGradient,
  Graphics,
  Rectangle,
} from 'pixi.js'
import {
  clampBannerDuration,
  type Chart,
  type ChartNote,
} from '@/charts/schema'
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
/** Classic ends the run on miss; Zen breaks combo only. */
export type PlayMode = 'classic' | 'zen'

export type SpeedUpPhase =
  | { phase: 'banner' }
  | { phase: 'countdown'; n: number }
  | { phase: 'apply'; mult: number }
  | { phase: 'clear' }

export type ObstacleBannerKind = 'hold' | 'dont_tap' | 'double'

export type ObstacleBannerPhase =
  | { phase: 'show'; kind: ObstacleBannerKind; durationSec: number }
  | { phase: 'clear' }

/** Song time in seconds from music start (before chart.offset). Null if music not ready. */
export type SongClock = () => number | null

export type ClassicPlayfieldHandlers = {
  onHit?: (grade: HitGrade, score: number, combo: number) => void
  /** Classic: run ended. Zen: combo broken; run continues. */
  onFail?: (reason: FailReason, score: number, combo: number) => void
  onSpeedUp?: (ev: SpeedUpPhase) => void
  onObstacleBanner?: (ev: ObstacleBannerPhase) => void
  onChartComplete?: (score: number, combo: number) => void
}

type TileKind = 'tap' | 'hold' | 'bomb'

type Tile = {
  root: Container
  body: Graphics
  fill: Graphics | null
  lane: number
  kind: TileKind
  /** Hold length in seconds (0 for non-hold). */
  length: number
  /** Chart press/start time (song clock + offset). */
  noteT: number
  /** Top edge Y in playfield coords. */
  y: number
  w: number
  h: number
  hit: boolean
  dying: boolean
  holding: boolean
}

type FxJob = { update: (dtMs: number) => boolean; destroy: () => void }

const SPEED_BANNER_MS = 900
const SPEED_COUNT_MS = 480
const DEFAULT_SPEED_MULT = 1.35
/** Slight forgiveness: release after this fraction of hold length. */
const HOLD_FORGIVE_FRAC = 0.08
const HOLD_MARKER = 0x7ec8ff
const BOMB_STRIPE_A = 0xff5c7a
const BOMB_STRIPE_B = 0x0d0d12

/**
 * Classic playfield: four lanes, chart-scheduled tiles (G5/G6), glass shatter + sparkles.
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
  private mode: PlayMode = 'classic'
  private w = 0
  private h = 0
  private resizeObs: ResizeObserver | null = null
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null
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
  private bannerTimers: number[] = []
  /** Song time (with chart.offset) at Classic fail — used to resume without rewind. */
  private failSongTime: number | null = null
  /** Post-revive miss absorb until this performance.now() (0 = off). */
  private shieldUntilMs = 0

  /** pointerId → hold tile */
  private pointerHolds = new Map<number, Tile>()
  /** lane → hold tile (keyboard) */
  private keyHolds = new Map<number, Tile>()

  constructor(handlers: ClassicPlayfieldHandlers = {}) {
    this.handlers = handlers
  }

  getMode() {
    return this.mode
  }

  setMode(mode: PlayMode) {
    this.mode = mode
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

  /** Current scroll multiplier (Speed Up stacks). Never reduced on revive. */
  getSpeedMult() {
    return this.speedMult
  }

  isShieldActive() {
    return this.shieldUntilMs > 0 && performance.now() < this.shieldUntilMs
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
    this.inputLayer.on('pointerdown', this.onPointerDown)
    this.inputLayer.on('pointerup', this.onPointerUp)
    this.inputLayer.on('pointerupoutside', this.onPointerUp)
    this.inputLayer.on('pointercancel', this.onPointerUp)

    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.failed || !this.running) return
      const lane = this.laneFromKey(e.key)
      if (lane === undefined) return
      e.preventDefault()
      if (e.repeat) return
      this.pressLane(lane, { source: 'key' })
    }
    this.onKeyUp = (e: KeyboardEvent) => {
      if (this.failed || !this.running) return
      const lane = this.laneFromKey(e.key)
      if (lane === undefined) return
      e.preventDefault()
      this.releaseKeyHold(lane)
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

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

  /** DEV/test: lanes with a currently hittable non-bomb tile. */
  getHittableLanes(): number[] {
    if (this.failed || !this.running) return []
    const hitY = this.h * PLAYFIELD.hitLineY
    const lanes: number[] = []
    for (const t of this.tiles) {
      if (t.hit || t.dying || t.kind === 'bomb') continue
      if (this.inHitWindow(t, hitY)) lanes.push(t.lane)
    }
    return lanes
  }

  /** DEV: song clock seconds including chart offset (null if waiting on music). */
  getSongTime(): number | null {
    return this.songTimeSec()
  }

  restart(): void {
    this.clearSpeedTimers()
    this.clearBannerTimers()
    this.clearActiveHolds()
    this.handlers.onSpeedUp?.({ phase: 'clear' })
    this.handlers.onObstacleBanner?.({ phase: 'clear' })
    this.clearTiles()
    this.clearFx()
    this.failed = false
    this.running = true
    this.score = 0
    this.combo = 0
    this.failSongTime = null
    this.shieldUntilMs = 0
    this.resetChartCursor()
    this.localStartMs = performance.now()
  }

  /**
   * Second Chance revive: keep score + speedMult, resume chart time.
   * Does NOT call resetChartCursor — scroll speed never slows after revive.
   * @param shieldMs post-revive shield duration (default 2000; 0 disables)
   */
  revive(opts: { shieldMs?: number } = {}): void {
    if (!this.failed) return
    const shieldMs = opts.shieldMs ?? 2000
    const offset = this.chart?.offset ?? 0
    const resumeAt = this.failSongTime ?? offset

    // Drop dying/hit tiles from the miss; keep live tiles scrolling.
    const keep: Tile[] = []
    for (const t of this.tiles) {
      if (t.dying || t.hit) {
        if (!t.root.destroyed) t.root.destroy({ children: true })
        continue
      }
      keep.push(t)
    }
    this.tiles = keep

    this.clearActiveHolds()
    this.clearBannerTimers()
    this.handlers.onObstacleBanner?.({ phase: 'clear' })

    // Resume on local clock from fail song time (music may restart independently).
    this.clock = null
    this.localStartMs = performance.now() - (resumeAt - offset) * 1000

    this.failed = false
    this.running = true
    this.combo = 0
    this.failSongTime = null
    this.shieldUntilMs =
      shieldMs > 0 ? performance.now() + shieldMs : 0
    // speedMult intentionally untouched — same speed forever after revive.
  }

  destroy(): void {
    this.running = false
    this.clearSpeedTimers()
    this.clearBannerTimers()
    this.clearActiveHolds()
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown)
    if (this.onKeyUp) window.removeEventListener('keyup', this.onKeyUp)
    this.onKeyDown = null
    this.onKeyUp = null
    this.resizeObs?.disconnect()
    this.resizeObs = null
    this.clearTiles()
    this.clearFx()
    this.gradient?.destroy()
    this.gradient = null
    if (this.app) {
      this.app.ticker.remove(this.tick)
      this.inputLayer.off('pointerdown', this.onPointerDown)
      this.inputLayer.off('pointerup', this.onPointerUp)
      this.inputLayer.off('pointerupoutside', this.onPointerUp)
      this.inputLayer.off('pointercancel', this.onPointerUp)
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

  private laneFromKey(key: string): number | undefined {
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
    return map[key]
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

  private clearBannerTimers() {
    for (const id of this.bannerTimers) window.clearTimeout(id)
    this.bannerTimers = []
  }

  private clearActiveHolds() {
    this.pointerHolds.clear()
    this.keyHolds.clear()
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

  private scrollSpeed(): number {
    return this.h * this.baseHeightsPerSec * this.speedMult
  }

  private travelTimeSec(): number {
    if (this.h <= 0) return 1.2
    const { h: tileH } = this.tileSize()
    const hitY = this.h * PLAYFIELD.hitLineY
    const speed = this.scrollSpeed()
    if (speed <= 0) return 1.2
    // Spawn top at -tileH; center crosses hit line at y = hitY - tileH/2
    const dist = hitY - tileH / 2 - -tileH
    return dist / speed
  }

  /** Lead time so hold leading edge (bottom) reaches hit line at note.t. */
  private holdTravelTimeSec(_length: number): number {
    if (this.h <= 0) return 1.2
    const speed = this.scrollSpeed()
    if (speed <= 0) return 1.2
    const hitY = this.h * PLAYFIELD.hitLineY
    // Spawn at y=-h; bottom at hitY when y = hitY - h → dist = hitY
    return hitY / speed
  }

  private leadForNote(note: ChartNote): number {
    if (note.type === 'hold') return this.holdTravelTimeSec(note.length)
    return this.travelTimeSec()
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

  private holdTileHeight(length: number): number {
    const base = this.tileSize().h
    const fromLength = length * this.scrollSpeed()
    return Math.max(base * 1.85, fromLength)
  }

  private drawTapBody(body: Graphics, w: number, h: number) {
    body.clear()
    body.roundRect(0, 0, w, h, 4).fill({ color: PLAYFIELD.tile })
    body
      .rect(0, h - 3, w, 3)
      .fill({ color: PLAYFIELD.tileInsetHighlight, alpha: 0.06 })
  }

  private drawHoldBody(body: Graphics, w: number, h: number, holding: boolean) {
    body.clear()
    body
      .roundRect(0, 0, w, h, 4)
      .fill({ color: holding ? 0x151520 : 0x12121a })
    // Leading-edge cue (sky dot)
    body.circle(w / 2, 12, 5).fill({ color: HOLD_MARKER, alpha: 1 })
    if (holding) {
      body
        .roundRect(0, 0, w, h, 4)
        .stroke({ width: 2, color: HOLD_MARKER, alpha: 0.85 })
    }
  }

  private drawBombBody(body: Graphics, w: number, h: number) {
    body.clear()
    body.roundRect(0, 0, w, h, 4).fill({ color: BOMB_STRIPE_B })
    const stripe = 7
    body.setStrokeStyle({ width: 0 })
    for (let i = -h; i < w + h; i += stripe * 2) {
      body
        .poly([
          i,
          0,
          i + stripe,
          0,
          i + stripe + h,
          h,
          i + h,
          h,
        ])
        .fill({ color: BOMB_STRIPE_A })
    }
    // Re-clip to rounded rect via overlay mask edges
    body
      .roundRect(0, 0, w, h, 4)
      .stroke({ width: 2, color: BOMB_STRIPE_A, alpha: 0.9 })
  }

  private updateHoldFill(tile: Tile, progress: number) {
    if (!tile.fill) return
    const p = Math.max(0, Math.min(1, progress))
    tile.fill.clear()
    if (p <= 0) return
    const fh = tile.h * p
    tile.fill
      .rect(0, tile.h - fh, tile.w, fh)
      .fill({ color: HOLD_MARKER, alpha: 0.4 })
  }

  private spawnNote(note: ChartNote) {
    const { w } = this.tileSize()
    const laneW = this.laneWidth()
    const x = note.lane * laneW + laneW * PLAYFIELD.tileInsetX
    const kind: TileKind = note.type
    const length = note.type === 'hold' ? note.length : 0
    const h =
      kind === 'hold' ? this.holdTileHeight(length) : this.tileSize().h

    const root = new Container()
    root.position.set(x, -h)
    const body = new Graphics()
    if (kind === 'bomb') this.drawBombBody(body, w, h)
    else if (kind === 'hold') this.drawHoldBody(body, w, h, false)
    else this.drawTapBody(body, w, h)
    root.addChild(body)

    let fill: Graphics | null = null
    if (kind === 'hold') {
      fill = new Graphics()
      root.addChild(fill)
    }

    this.tilesLayer.addChild(root)
    this.tiles.push({
      root,
      body,
      fill,
      lane: note.lane,
      kind,
      length,
      noteT: note.t,
      y: -h,
      w,
      h,
      hit: false,
      dying: false,
      holding: false,
    })
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

  private beginObstacleBanner(kind: ObstacleBannerKind, durationRaw?: number) {
    const durationSec = clampBannerDuration(durationRaw)
    this.handlers.onObstacleBanner?.({
      phase: 'show',
      kind,
      durationSec,
    })
    const id = window.setTimeout(() => {
      if (this.failed || !this.running) return
      this.handlers.onObstacleBanner?.({ phase: 'clear' })
    }, durationSec * 1000)
    this.bannerTimers.push(id)
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
      } else if (
        ev.type === 'hold' ||
        ev.type === 'dont_tap' ||
        ev.type === 'double'
      ) {
        this.beginObstacleBanner(ev.type, ev.duration)
      }
    }

    while (this.noteIndex < chart.notes.length) {
      const note = chart.notes[this.noteIndex]
      const lead = this.leadForNote(note)
      if (songTime < note.t - lead) break
      this.noteIndex++
      this.spawnNote(note)
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

  private holdProgress(tile: Tile, songTime: number | null): number {
    if (tile.kind !== 'hold' || tile.length <= 0) return 0
    if (songTime == null) {
      const hitY = this.h * PLAYFIELD.hitLineY
      // Visual fallback: fraction of tile past hit line
      return Math.max(0, Math.min(1, (hitY - tile.y) / tile.h))
    }
    return Math.max(0, Math.min(1, (songTime - tile.noteT) / tile.length))
  }

  private inHitWindow(tile: Tile, hitY: number): boolean {
    if (tile.kind === 'hold') {
      // Leading edge (bottom) near hit band, or already overlapping while holding
      const window = Math.max(tile.h * 0.12, this.tileSize().h * HIT_WINDOW_TILES)
      const bottom = tile.y + tile.h
      return bottom >= hitY - window && tile.y <= hitY + window * 0.25
    }
    const window = tile.h * HIT_WINDOW_TILES
    const top = tile.y
    const bottom = tile.y + tile.h
    return bottom >= hitY - window && top <= hitY + window * 0.35
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

    const speed = this.scrollSpeed()
    const hitY = this.h * PLAYFIELD.hitLineY
    const still: Tile[] = []
    for (const tile of this.tiles) {
      if (tile.dying) continue
      tile.y += speed * dt
      tile.root.y = tile.y

      if (tile.kind === 'hold' && tile.holding) {
        const progress = this.holdProgress(tile, songTime)
        this.updateHoldFill(tile, progress)
        if (progress >= 1 - HOLD_FORGIVE_FRAC) {
          this.completeHold(tile)
          continue
        }
      }

      if (tile.kind === 'bomb') {
        // Bomb passes safely if never pressed
        if (tile.y > hitY + tile.h * 0.55) {
          tile.root.destroy({ children: true })
          continue
        }
        still.push(tile)
        continue
      }

      if (tile.kind === 'hold') {
        // Miss if hold fully past window without being held to completion
        if (!tile.hit && !tile.holding && tile.y > hitY + tile.h * 0.15) {
          this.missTile(tile, 'miss')
          continue
        }
        still.push(tile)
        continue
      }

      const window = tile.h * HIT_WINDOW_TILES
      if (!tile.hit && tile.y > hitY + window * 0.55) {
        this.missTile(tile, 'miss')
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

  private onPointerDown = (e: {
    global: { x: number; y: number }
    pointerId?: number
  }) => {
    if (this.failed || !this.running || !this.app) return
    const local = this.app.stage.toLocal(e.global)
    const lane = Math.min(
      PLAYFIELD.lanes - 1,
      Math.max(0, Math.floor(local.x / this.laneWidth())),
    )
    const pointerId = e.pointerId ?? 0
    this.pressLane(lane, { source: 'pointer', pointerId })
  }

  private onPointerUp = (e: { pointerId?: number }) => {
    if (this.failed || !this.running) return
    const pointerId = e.pointerId ?? 0
    const tile = this.pointerHolds.get(pointerId)
    if (!tile) return
    this.pointerHolds.delete(pointerId)
    this.releaseHold(tile)
  }

  private pressLane(
    lane: number,
    opts: { source: 'pointer'; pointerId: number } | { source: 'key' },
  ) {
    if (this.failed || !this.running) return
    // Wait for music clock — unlock gestures must not count as Classic wrong-taps.
    if (this.chart && this.songTimeSec() == null) return

    const hitY = this.h * PLAYFIELD.hitLineY
    const candidates = this.tiles.filter((t) => {
      if (t.lane !== lane || t.hit || t.dying) return false
      if (t.kind === 'hold' && t.holding) return false
      return this.inHitWindow(t, hitY)
    })

    if (candidates.length === 0) {
      this.fail('wrong')
      return
    }

    candidates.sort((a, b) => {
      if (a.kind === 'hold' && b.kind !== 'hold') return -1
      if (b.kind === 'hold' && a.kind !== 'hold') return 1
      const ca = a.y + a.h / 2
      const cb = b.y + b.h / 2
      return Math.abs(ca - hitY) - Math.abs(cb - hitY)
    })
    const tile = candidates[0]

    if (tile.kind === 'bomb') {
      this.fail('wrong')
      return
    }

    if (tile.kind === 'hold') {
      this.startHold(tile)
      if (opts.source === 'pointer') {
        this.pointerHolds.set(opts.pointerId, tile)
      } else {
        this.keyHolds.set(lane, tile)
      }
      return
    }

    this.hitTile(tile)
  }

  private releaseKeyHold(lane: number) {
    const tile = this.keyHolds.get(lane)
    if (!tile) return
    this.keyHolds.delete(lane)
    this.releaseHold(tile)
  }

  private startHold(tile: Tile) {
    tile.holding = true
    this.drawHoldBody(tile.body, tile.w, tile.h, true)
    const songTime = this.songTimeSec()
    this.updateHoldFill(tile, this.holdProgress(tile, songTime))
  }

  private releaseHold(tile: Tile) {
    if (tile.hit || tile.dying || !tile.holding) return
    const songTime = this.songTimeSec()
    const progress = this.holdProgress(tile, songTime)
    if (progress >= 1 - HOLD_FORGIVE_FRAC) {
      this.completeHold(tile)
      return
    }
    // Early release ≈ miss (product lock: hold until length completes)
    tile.holding = false
    this.missTile(tile, 'miss')
  }

  private completeHold(tile: Tile) {
    if (tile.hit || tile.dying) return
    tile.holding = false
    // Detach from input maps
    for (const [id, t] of this.pointerHolds) {
      if (t === tile) this.pointerHolds.delete(id)
    }
    for (const [lane, t] of this.keyHolds) {
      if (t === tile) this.keyHolds.delete(lane)
    }
    this.hitTile(tile)
  }

  private hitTile(tile: Tile) {
    tile.hit = true
    tile.dying = true
    tile.holding = false
    const hitY = this.h * PLAYFIELD.hitLineY
    const dist =
      tile.kind === 'hold'
        ? 0
        : Math.abs(tile.y + tile.h / 2 - hitY)
    const grade: HitGrade =
      tile.kind === 'hold'
        ? 'perfect'
        : dist <= tile.h * PERFECT_WINDOW_TILES
          ? 'perfect'
          : 'great'

    this.combo += 1
    this.score += pointsForGrade(grade)
    this.handlers.onHit?.(grade, this.score, this.combo)

    const job = playGlassShatter({
      tile: tile.root,
      fxLayer: this.fxLayer,
      grade,
      tileW: tile.w,
      tileH: Math.min(tile.h, this.tileSize().h * 1.4),
    })
    this.fxJobs.push(job)

    const world = tile.root.getGlobalPosition()
    const local = this.fxLayer.toLocal(world)
    const sparkles = playHitSparkles({
      fxLayer: this.fxLayer,
      x: local.x + tile.w / 2,
      y: local.y + Math.min(tile.h, this.tileSize().h) / 2,
      perfect: grade === 'perfect',
    })
    this.fxJobs.push(sparkles)

    this.tiles = this.tiles.filter((t) => t !== tile)
    window.setTimeout(() => {
      tile.root.destroy({ children: true })
    }, 450)
  }

  /** Fade + drop a missed tile; Classic ends run, Zen only breaks combo. */
  private missTile(tile: Tile, reason: FailReason) {
    if (tile.dying || tile.hit) return
    tile.hit = true
    tile.dying = true
    tile.holding = false
    tile.root.alpha = 0.35
    window.setTimeout(() => {
      if (!tile.root.destroyed) tile.root.destroy({ children: true })
    }, 280)
    this.fail(reason)
  }

  /** Absorb one miss while post-revive shield is active. */
  private consumeShield(): boolean {
    if (!this.isShieldActive()) return false
    this.shieldUntilMs = 0
    return true
  }

  private fail(reason: FailReason) {
    if (this.mode === 'zen') {
      const endedCombo = this.combo
      this.combo = 0
      this.handlers.onFail?.(reason, this.score, endedCombo)
      return
    }
    if (this.failed) return
    if (this.consumeShield()) {
      // Shield ate the miss — combo breaks, run continues at same speed.
      this.combo = 0
      return
    }
    const songAtFail = this.songTimeSec()
    this.failSongTime = songAtFail
    this.failed = true
    this.running = false
    this.clearSpeedTimers()
    this.clearBannerTimers()
    this.clearActiveHolds()
    this.handlers.onSpeedUp?.({ phase: 'clear' })
    this.handlers.onObstacleBanner?.({ phase: 'clear' })
    const endedCombo = this.combo
    this.combo = 0
    // Keep speedMult — Second Chance resumes at same scroll speed.
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
