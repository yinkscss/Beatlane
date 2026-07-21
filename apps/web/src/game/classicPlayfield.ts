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
  type ChartNoteMod,
} from '@/charts/schema'
import { playGlassShatter, type ShatterGrade } from '@/game/glassShatter'
import { playHitSparkles } from '@/game/hitSparkles'
import {
  gradeSpatialHit,
  holdTileProgress,
  pointsForGrade,
  tileFullyPastBottom,
  tilePartiallyOnPlayfield,
} from '@/game/judging'
import { PLAYFIELD, SCROLL } from '@/game/playfieldTheme'
import { SLOW_MO_SCROLL_MULT } from '@/lib/helpers'

export type FailReason = 'miss' | 'wrong'
export type HitGrade = ShatterGrade
/**
 * Classic/Daily end the run on miss; Zen/Blitz break combo only.
 * Blitz is timed (60s) tournament mode — helpers off (G16).
 */
export type PlayMode = 'classic' | 'zen' | 'daily' | 'blitz'

/** Song-time tap record for server revalidation (G13). */
export type TapRecord = {
  t: number
  lane: number
  grade: HitGrade
}

export type SpeedUpPhase =
  | { phase: 'banner' }
  | { phase: 'countdown'; n: number }
  | { phase: 'apply'; mult: number }
  | { phase: 'clear' }

export type ObstacleBannerKind =
  | 'hold'
  | 'dont_tap'
  | 'double'
  | 'ice'
  | 'gold'
  | 'fog'
  | 'reverse'
  | 'long_hold'
  | 'bridge'
  | 'triple'
  | 'l_hook'
  | 'zig'
  | 'split'
  | 'fake_gap'
  | 'slide'
  | 'cascade'
  | 'trap_double'

export type ObstacleBannerPhase =
  | { phase: 'show'; kind: ObstacleBannerKind; durationSec: number }
  | { phase: 'clear' }

export type ModifierPhase =
  | { phase: 'fog'; active: boolean }
  | { phase: 'reverse'; active: boolean }
  | { phase: 'gold'; active: boolean }

/** Song time in seconds from music start (before chart.offset). Null if music not ready. */
export type SongClock = () => number | null

export type ClassicPlayfieldHandlers = {
  onHit?: (grade: HitGrade, score: number, combo: number) => void
  /** Fired when a note awards score — includes song-time + lane for Daily submit. */
  onTapRecord?: (tap: TapRecord) => void
  /** Classic/Daily: run ended. Zen/Blitz: combo broken; run continues. */
  onFail?: (reason: FailReason, score: number, combo: number) => void
  /** Miss absorbed by timed or charged shield — run continues. */
  onShieldAbsorb?: (
    score: number,
    endedCombo: number,
    remainingCharges: number,
  ) => void
  onSpeedUp?: (ev: SpeedUpPhase) => void
  onObstacleBanner?: (ev: ObstacleBannerPhase) => void
  onModifier?: (ev: ModifierPhase) => void
  onChartComplete?: (score: number, combo: number) => void
}

type TileKind =
  | 'tap'
  | 'hold'
  | 'bomb'
  | 'long_hold'
  | 'bridge'
  | 'triple'
  | 'l_hook'
  | 'fake_gap'
  | 'slide'

type FakePhase = 'seg1' | 'gap' | 'seg2'

type Tile = {
  root: Container
  body: Graphics
  fill: Graphics | null
  gapGfx: Graphics | null
  footGfx: Graphics | null
  lane: number
  kind: TileKind
  /** Hold / long_hold / l_hook / fake_gap length in seconds. */
  length: number
  span: number
  foot: -1 | 0 | 1
  endLane: number
  gapAt: number
  gapLen: number
  mod: ChartNoteMod | null
  noteT: number
  y: number
  w: number
  h: number
  hit: boolean
  dying: boolean
  holding: boolean
  /** Lanes currently covering a multi-lane bar. */
  covered: Set<number>
  /** L-hook foot pressed at least once while holding. */
  footHit: boolean
  fakePhase: FakePhase
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
const ICE_COLOR = 0x7ec8ff
const GOLD_COLOR = 0xffb703
const GOLD_SCORE_MULT = 2
const BRIDGE_HINT = 0xff8a3d
const GAP_WHITE = 0xffffff

const ICE_SLOW_MULT = 0.55
const ICE_BURST_MULT = 1.4
const ICE_SLOW_MS = 1400
const ICE_BURST_MS = 1100
/**
 * Classic playfield: four lanes, chart-scheduled tiles (G5–G11), glass shatter + sparkles.
 * Timing = chart + music clock (not waveform analysis). Audio stays in `@/audio/runtime`.
 */
export class ClassicPlayfield {
  private app: Application | null = null
  private host: HTMLElement | null = null
  private handlers: ClassicPlayfieldHandlers
  private bg = new Graphics()
  private lanesGfx = new Graphics()
  private hitBand = new Graphics()
  private fogGfx = new Graphics()
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
  /** Temporary ICE slow/burst multiplier (stacks with speedMult). */
  private iceMult = 1
  /** G14 Slow-mo helper multiplier (stacks with iceMult; cleared after ms). */
  private helperSlowMult = 1
  private baseHeightsPerSec: number = SCROLL.heightsPerSec
  private localStartMs = 0
  private chartDone = false
  private speedTimers: number[] = []
  private bannerTimers: number[] = []
  private iceTimers: number[] = []
  private helperSlowTimers: number[] = []
  private failSongTime: number | null = null
  private shieldUntilMs = 0
  /** G14 Shield helper — one miss per charge (distinct from timed post-revive shield). */
  private shieldCharges = 0

  private reverseActive = false
  private fogActive = false
  private goldActive = false

  /** pointerId → hold-like tile */
  private pointerHolds = new Map<number, Tile>()
  /** lane → hold tile (keyboard) */
  private keyHolds = new Map<number, Tile>()
  /** pointerId → multi-lane bar tile (bridge/triple) */
  private pointerBars = new Map<number, { tile: Tile; lane: number }>()

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

  getShieldCharges() {
    return this.shieldCharges
  }

  hasAnyShield() {
    return this.isShieldActive() || this.shieldCharges > 0
  }

  isHelperSlowMoActive() {
    return this.helperSlowMult < 1
  }

  isReverseActive() {
    return this.reverseActive
  }

  isFogActive() {
    return this.fogActive
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
    stage.addChild(this.fogGfx)
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
    const lanes: number[] = []
    for (const t of this.tiles) {
      if (t.hit || t.dying || t.kind === 'bomb') continue
      if (!this.inHitWindow(t)) continue
      if (t.kind === 'bridge' || t.kind === 'triple') {
        for (let i = 0; i < t.span; i++) lanes.push(t.lane + i)
      } else if (t.kind === 'slide') {
        lanes.push(this.slideLane(t))
      } else if (t.kind === 'l_hook') {
        lanes.push(t.lane)
        lanes.push(t.lane + t.foot)
      } else {
        lanes.push(t.lane)
      }
    }
    return [...new Set(lanes)]
  }

  getSongTime(): number | null {
    return this.songTimeSec()
  }

  restart(): void {
    this.clearSpeedTimers()
    this.clearBannerTimers()
    this.clearIceTimers()
    this.clearActiveHolds()
    this.clearModifiers()
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
    this.shieldCharges = 0
    this.iceMult = 1
    this.clearHelperSlow()
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

    this.clock = null
    this.localStartMs = performance.now() - (resumeAt - offset) * 1000

    this.failed = false
    this.running = true
    this.combo = 0
    this.failSongTime = null
    this.shieldUntilMs =
      shieldMs > 0 ? performance.now() + shieldMs : 0
  }

  /**
   * G14 Slow-mo: temporary scroll crawl for `ms`. Does not change speedMult
   * (Second Chance same-speed invariant).
   */
  activateSlowMo(ms = 3000): void {
    if (this.failed || !this.running) return
    this.clearHelperSlow()
    this.helperSlowMult = SLOW_MO_SCROLL_MULT
    const id = window.setTimeout(() => {
      this.helperSlowMult = 1
    }, ms)
    this.helperSlowTimers.push(id)
  }

  /** G14 Shield one-miss: absorb the next fail without ending the run. */
  activateShieldCharge(charges = 1): void {
    if (this.failed || !this.running) return
    this.shieldCharges += Math.max(0, charges)
  }

  destroy(): void {
    this.running = false
    this.clearSpeedTimers()
    this.clearBannerTimers()
    this.clearIceTimers()
    this.clearHelperSlow()
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
    this.chartDone = false
  }

  private clearSpeedTimers() {
    for (const id of this.speedTimers) window.clearTimeout(id)
    this.speedTimers = []
  }

  private clearBannerTimers() {
    for (const id of this.bannerTimers) window.clearTimeout(id)
    this.bannerTimers = []
  }

  private clearIceTimers() {
    for (const id of this.iceTimers) window.clearTimeout(id)
    this.iceTimers = []
  }

  private clearActiveHolds() {
    this.pointerHolds.clear()
    this.keyHolds.clear()
    this.pointerBars.clear()
  }

  private clearModifiers() {
    this.reverseActive = false
    this.fogActive = false
    this.goldActive = false
    this.handlers.onModifier?.({ phase: 'fog', active: false })
    this.handlers.onModifier?.({ phase: 'reverse', active: false })
    this.handlers.onModifier?.({ phase: 'gold', active: false })
    this.drawFog()
  }

  /**
   * Prefer AudioContext music clock when a SongClock that returns non-null
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
    return (
      this.h *
      this.baseHeightsPerSec *
      this.speedMult *
      this.iceMult *
      this.helperSlowMult
    )
  }

  private travelTimeSec(): number {
    if (this.h <= 0) return 1.2
    const { h: tileH } = this.tileSize()
    const hitY = this.h * PLAYFIELD.hitLineY
    const speed = this.scrollSpeed()
    if (speed <= 0) return 1.2
    const dist = hitY - tileH / 2 - -tileH
    return dist / speed
  }

  private holdTravelTimeSec(_length: number): number {
    if (this.h <= 0) return 1.2
    const speed = this.scrollSpeed()
    if (speed <= 0) return 1.2
    const hitY = this.h * PLAYFIELD.hitLineY
    return hitY / speed
  }

  private isHoldLike(kind: TileKind): boolean {
    return (
      kind === 'hold' ||
      kind === 'long_hold' ||
      kind === 'l_hook' ||
      kind === 'fake_gap'
    )
  }

  private leadForNote(note: ChartNote): number {
    if (
      note.type === 'hold' ||
      note.type === 'long_hold' ||
      note.type === 'l_hook' ||
      note.type === 'fake_gap'
    ) {
      return this.holdTravelTimeSec(note.length)
    }
    return this.travelTimeSec()
  }

  /** Map physical input lane through REVERSE if active. */
  private mapInputLane(lane: number): number {
    if (!this.reverseActive) return lane
    return PLAYFIELD.lanes - 1 - lane
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
    this.drawFog()
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

  private drawFog() {
    this.fogGfx.clear()
    if (!this.fogActive || this.w <= 0) return
    // Soft white→lavender veil — readable black tiles still show underneath.
    this.fogGfx
      .rect(0, 0, this.w, this.h * 0.45)
      .fill({ color: 0xffffff, alpha: 0.42 })
    this.fogGfx
      .rect(0, this.h * 0.35, this.w, this.h * 0.65)
      .fill({ color: 0xb4a0dc, alpha: 0.28 })
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

  private holdTileHeight(length: number, long: boolean): number {
    const base = this.tileSize().h
    const fromLength = length * this.scrollSpeed()
    if (long) return Math.max(this.h * 0.48, fromLength)
    return Math.max(base * 1.85, fromLength)
  }

  private fillColor(mod: ChartNoteMod | null, fallback: number): number {
    if (mod === 'ice') return ICE_COLOR
    if (mod === 'gold') return GOLD_COLOR
    return fallback
  }

  private drawTapBody(
    body: Graphics,
    w: number,
    h: number,
    mod: ChartNoteMod | null,
  ) {
    body.clear()
    const color = this.fillColor(mod, PLAYFIELD.tile)
    body.roundRect(0, 0, w, h, 4).fill({ color })
    if (mod === 'ice') {
      body
        .roundRect(0, 0, w, h, 4)
        .stroke({ width: 2, color: 0xc8eeff, alpha: 0.9 })
    } else if (mod === 'gold') {
      body
        .roundRect(0, 0, w, h, 4)
        .stroke({ width: 2, color: 0xffe08a, alpha: 0.95 })
    } else {
      body
        .rect(0, h - 3, w, 3)
        .fill({ color: PLAYFIELD.tileInsetHighlight, alpha: 0.06 })
    }
  }

  private drawHoldBody(
    body: Graphics,
    w: number,
    h: number,
    holding: boolean,
    mod: ChartNoteMod | null,
  ) {
    body.clear()
    const base = this.fillColor(mod, holding ? 0x151520 : 0x12121a)
    body.roundRect(0, 0, w, h, 4).fill({ color: base })
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
    body
      .roundRect(0, 0, w, h, 4)
      .stroke({ width: 2, color: BOMB_STRIPE_A, alpha: 0.9 })
  }

  private drawBarBody(
    body: Graphics,
    w: number,
    h: number,
    covered: number,
    need: number,
    mod: ChartNoteMod | null,
  ) {
    body.clear()
    const color = this.fillColor(mod, PLAYFIELD.tile)
    body.roundRect(0, 0, w, h, 4).fill({ color })
    body
      .roundRect(0, 0, w, h, 4)
      .stroke({ width: 2.5, color: BRIDGE_HINT, alpha: 0.85 })
    // Coverage pips
    for (let i = 0; i < need; i++) {
      const cx = ((i + 0.5) / need) * w
      body
        .circle(cx, h / 2, 5)
        .fill({
          color: i < covered ? HOLD_MARKER : 0xffffff,
          alpha: i < covered ? 1 : 0.35,
        })
    }
  }

  private drawFakeGapVisual(tile: Tile) {
    if (!tile.gapGfx) return
    const gapY = tile.h * tile.gapAt
    const gapH = Math.max(8, tile.h * tile.gapLen)
    tile.gapGfx.clear()
    tile.gapGfx
      .rect(2, gapY, tile.w - 4, gapH)
      .fill({ color: GAP_WHITE, alpha: 0.72 })
    tile.gapGfx
      .rect(2, gapY, tile.w - 4, gapH)
      .stroke({ width: 1.5, color: BOMB_STRIPE_A, alpha: 0.75 })
  }

  private drawLHookFoot(tile: Tile) {
    if (!tile.footGfx || tile.foot === 0) return
    const laneW = this.laneWidth()
    const footW = laneW * (1 - PLAYFIELD.tileInsetX * 2)
    const footH = Math.max(14, this.tileSize().h * 0.55)
    tile.footGfx.clear()
    const x = tile.foot > 0 ? tile.w - 2 : -(footW - 2)
    const y = tile.h - footH - 4
    tile.footGfx
      .roundRect(x, y, footW, footH, 4)
      .fill({ color: this.fillColor(tile.mod, PLAYFIELD.tile) })
    tile.footGfx
      .roundRect(x, y, footW, footH, 4)
      .stroke({
        width: 2,
        color: tile.footHit ? HOLD_MARKER : BRIDGE_HINT,
        alpha: 0.9,
      })
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
    const laneW = this.laneWidth()
    const base = this.tileSize()
    const mod = 'mod' in note && note.mod ? note.mod : null

    let kind: TileKind = note.type as TileKind
    let length = 0
    let span = 1
    let foot: -1 | 0 | 1 = 0
    let endLane = note.lane
    let gapAt = 0.4
    let gapLen = 0.2
    let h = base.h
    let w = base.w
    let x = note.lane * laneW + laneW * PLAYFIELD.tileInsetX

    if (note.type === 'hold') {
      length = note.length
      h = this.holdTileHeight(length, false)
    } else if (note.type === 'long_hold') {
      length = note.length
      h = this.holdTileHeight(length, true)
    } else if (note.type === 'bridge') {
      span = 2
      w =
        span * laneW -
        laneW * PLAYFIELD.tileInsetX * 2
      h = base.h * 1.05
    } else if (note.type === 'triple') {
      span = 3
      w =
        span * laneW -
        laneW * PLAYFIELD.tileInsetX * 2
      h = base.h * 1.05
    } else if (note.type === 'l_hook') {
      length = note.length
      foot = note.foot
      h = this.holdTileHeight(length, false)
    } else if (note.type === 'fake_gap') {
      length = note.length
      gapAt = note.gapAt ?? 0.4
      gapLen = note.gapLen ?? 0.2
      h = this.holdTileHeight(length, true)
    } else if (note.type === 'slide') {
      endLane = note.endLane
    }

    const root = new Container()
    root.position.set(x, -h)
    const body = new Graphics()

    if (kind === 'bomb') this.drawBombBody(body, w, h)
    else if (kind === 'bridge' || kind === 'triple')
      this.drawBarBody(body, w, h, 0, span, mod)
    else if (this.isHoldLike(kind))
      this.drawHoldBody(body, w, h, false, mod)
    else this.drawTapBody(body, w, h, mod)

    root.addChild(body)

    let fill: Graphics | null = null
    if (this.isHoldLike(kind)) {
      fill = new Graphics()
      root.addChild(fill)
    }

    let gapGfx: Graphics | null = null
    if (kind === 'fake_gap') {
      gapGfx = new Graphics()
      root.addChild(gapGfx)
    }

    let footGfx: Graphics | null = null
    if (kind === 'l_hook') {
      footGfx = new Graphics()
      root.addChild(footGfx)
    }

    const tile: Tile = {
      root,
      body,
      fill,
      gapGfx,
      footGfx,
      lane: note.lane,
      kind,
      length,
      span,
      foot,
      endLane,
      gapAt,
      gapLen,
      mod,
      noteT: note.t,
      y: -h,
      w,
      h,
      hit: false,
      dying: false,
      holding: false,
      covered: new Set(),
      footHit: false,
      fakePhase: 'seg1',
    }

    if (kind === 'fake_gap') this.drawFakeGapVisual(tile)
    if (kind === 'l_hook') this.drawLHookFoot(tile)

    this.tilesLayer.addChild(root)
    this.tiles.push(tile)
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

  private beginIceModifier(durationSec: number) {
    this.clearIceTimers()
    this.iceMult = ICE_SLOW_MULT
    const burstId = window.setTimeout(() => {
      if (this.failed || !this.running) return
      this.iceMult = ICE_BURST_MULT
    }, ICE_SLOW_MS)
    const endId = window.setTimeout(() => {
      if (this.failed || !this.running) return
      this.iceMult = 1
    }, Math.min(durationSec * 1000, ICE_SLOW_MS + ICE_BURST_MS))
    this.iceTimers.push(burstId, endId)
  }

  private beginTimedModifier(
    kind: 'fog' | 'reverse' | 'gold',
    durationSec: number,
  ) {
    if (kind === 'fog') {
      this.fogActive = true
      this.drawFog()
      this.handlers.onModifier?.({ phase: 'fog', active: true })
    } else if (kind === 'reverse') {
      this.reverseActive = true
      this.handlers.onModifier?.({ phase: 'reverse', active: true })
    } else {
      this.goldActive = true
      this.handlers.onModifier?.({ phase: 'gold', active: true })
    }

    const id = window.setTimeout(() => {
      if (this.failed || !this.running) return
      if (kind === 'fog') {
        this.fogActive = false
        this.drawFog()
        this.handlers.onModifier?.({ phase: 'fog', active: false })
      } else if (kind === 'reverse') {
        this.reverseActive = false
        this.handlers.onModifier?.({ phase: 'reverse', active: false })
      } else {
        this.goldActive = false
        this.handlers.onModifier?.({ phase: 'gold', active: false })
      }
    }, durationSec * 1000)
    this.bannerTimers.push(id)
  }

  private beginObstacleBanner(kind: ObstacleBannerKind, durationRaw?: number) {
    const durationSec = clampBannerDuration(durationRaw)
    this.handlers.onObstacleBanner?.({
      phase: 'show',
      kind,
      durationSec,
    })

    if (kind === 'ice') this.beginIceModifier(durationSec)
    else if (kind === 'fog' || kind === 'reverse' || kind === 'gold') {
      this.beginTimedModifier(kind, durationSec)
    }

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
      } else {
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

  /** Fraction of hold consumed as the tile scrolls through the hit band. */
  private holdProgress(tile: Tile): number {
    if (!this.isHoldLike(tile.kind) || tile.length <= 0 || tile.h <= 0) return 0
    const hitY = this.h * PLAYFIELD.hitLineY
    return holdTileProgress(tile.y, tile.h, hitY)
  }

  private slideLane(tile: Tile): number {
    const hitY = this.h * PLAYFIELD.hitLineY
    const startY = -tile.h
    const progress = Math.max(
      0,
      Math.min(1, (tile.y - startY) / (hitY - tile.h / 2 - startY)),
    )
    const laneF = tile.lane + (tile.endLane - tile.lane) * progress
    return Math.min(
      PLAYFIELD.lanes - 1,
      Math.max(0, Math.round(laneF)),
    )
  }

  private updateSlideX(tile: Tile) {
    const laneW = this.laneWidth()
    const hitY = this.h * PLAYFIELD.hitLineY
    const startY = -tile.h
    const progress = Math.max(
      0,
      Math.min(1, (tile.y - startY) / (hitY - tile.h / 2 - startY)),
    )
    const laneF = tile.lane + (tile.endLane - tile.lane) * progress
    const x = laneF * laneW + laneW * PLAYFIELD.tileInsetX
    tile.root.x = x
  }

  /** Accept tap/HOLD start while any part of the tile is still on-screen. */
  private inHitWindow(tile: Tile): boolean {
    return tilePartiallyOnPlayfield(tile.y, tile.h, this.h)
  }

  private tileCoversLane(tile: Tile, lane: number): boolean {
    if (tile.kind === 'bridge' || tile.kind === 'triple') {
      return lane >= tile.lane && lane < tile.lane + tile.span
    }
    if (tile.kind === 'slide') return this.slideLane(tile) === lane
    if (tile.kind === 'l_hook') {
      return lane === tile.lane || lane === tile.lane + tile.foot
    }
    return tile.lane === lane
  }

  private tick = () => {
    if (!this.app || !this.running || this.failed) {
      this.updateFxOnly()
      return
    }
    const dtMs = this.app.ticker.deltaMS
    const dt = dtMs / 1000
    const songTime = this.songTimeSec()

    // Schedule only when the song clock is live. Still scroll existing tiles if
    // the audio clock is briefly null (overlapping startMusic used to stall here).
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
      if (tile.kind === 'slide') this.updateSlideX(tile)

      if (this.isHoldLike(tile.kind) && tile.holding) {
        const progress = this.holdProgress(tile)
        this.updateHoldFill(tile, progress)

        if (tile.kind === 'fake_gap') {
          this.tickFakeGap(tile, progress)
          if (tile.dying || tile.hit) continue
        } else if (tile.kind === 'l_hook') {
          if (
            progress >= 1 - HOLD_FORGIVE_FRAC &&
            tile.footHit
          ) {
            this.completeHold(tile)
            continue
          }
        } else if (progress >= 1 - HOLD_FORGIVE_FRAC) {
          this.completeHold(tile)
          continue
        }
      }

      if (tile.kind === 'bomb') {
        if (tile.y > hitY + tile.h * 0.55) {
          tile.root.destroy({ children: true })
          continue
        }
        still.push(tile)
        continue
      }

      if (this.isHoldLike(tile.kind)) {
        if (!tile.hit && !tile.holding && tileFullyPastBottom(tile.y, this.h)) {
          this.missTile(tile, 'miss')
          continue
        }
        // L-hook finished hold without foot → miss
        if (
          tile.kind === 'l_hook' &&
          tile.holding &&
          this.holdProgress(tile) >= 1 - HOLD_FORGIVE_FRAC &&
          !tile.footHit
        ) {
          tile.holding = false
          this.missTile(tile, 'miss')
          continue
        }
        still.push(tile)
        continue
      }

      if (tile.kind === 'bridge' || tile.kind === 'triple') {
        if (!tile.hit && tileFullyPastBottom(tile.y, this.h)) {
          this.missTile(tile, 'miss')
          continue
        }
        still.push(tile)
        continue
      }

      if (!tile.hit && tileFullyPastBottom(tile.y, this.h)) {
        this.missTile(tile, 'miss')
        continue
      }
      still.push(tile)
    }
    this.tiles = still.filter((t) => !t.dying)

    this.updateFx(dtMs)
  }

  private tickFakeGap(tile: Tile, progress: number) {
    const gapEnd = tile.gapAt + tile.gapLen
    if (progress < tile.gapAt) {
      tile.fakePhase = 'seg1'
      return
    }
    if (progress < gapEnd) {
      tile.fakePhase = 'gap'
      // Holding through the white gap = fail
      if (tile.holding) {
        tile.holding = false
        this.missTile(tile, 'wrong')
      }
      return
    }
    tile.fakePhase = 'seg2'
    if (progress >= 1 - HOLD_FORGIVE_FRAC && tile.holding) {
      this.completeHold(tile)
    }
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
    // Keep the long-tap alive even if the finger drifts slightly off-canvas.
    try {
      ;(this.app.canvas as HTMLCanvasElement).setPointerCapture?.(pointerId)
    } catch {
      /* ignore — capture is best-effort */
    }
    this.pressLane(lane, { source: 'pointer', pointerId })
  }

  private onPointerUp = (e: { pointerId?: number }) => {
    if (this.failed || !this.running) return
    const pointerId = e.pointerId ?? 0
    if (this.app) {
      try {
        ;(this.app.canvas as HTMLCanvasElement).releasePointerCapture?.(
          pointerId,
        )
      } catch {
        /* already released */
      }
    }
    const hold = this.pointerHolds.get(pointerId)
    if (hold) {
      this.pointerHolds.delete(pointerId)
      this.releaseHold(hold)
    }
    const bar = this.pointerBars.get(pointerId)
    if (bar) {
      this.pointerBars.delete(pointerId)
      bar.tile.covered.delete(bar.lane)
      this.redrawBar(bar.tile)
    }
  }

  private pressLane(
    rawLane: number,
    opts: { source: 'pointer'; pointerId: number } | { source: 'key' },
  ) {
    if (this.failed || !this.running) return
    if (this.chart && this.songTimeSec() == null) return

    const lane = this.mapInputLane(rawLane)
    const hitY = this.h * PLAYFIELD.hitLineY
    const candidates = this.tiles.filter((t) => {
      if (t.hit || t.dying) return false
      if (!this.tileCoversLane(t, lane)) return false
      // Already holding (except L-hook foot press)
      if (this.isHoldLike(t.kind) && t.holding && t.kind !== 'l_hook') {
        return false
      }
      if (t.kind === 'l_hook' && t.holding && lane === t.lane + t.foot) {
        return true
      }
      return this.inHitWindow(t)
    })

    if (candidates.length === 0) {
      this.fail('wrong')
      return
    }

    candidates.sort((a, b) => {
      if (this.isHoldLike(a.kind) && !this.isHoldLike(b.kind)) return -1
      if (this.isHoldLike(b.kind) && !this.isHoldLike(a.kind)) return 1
      const ca = a.y + a.h / 2
      const cb = b.y + b.h / 2
      return Math.abs(ca - hitY) - Math.abs(cb - hitY)
    })
    const tile = candidates[0]

    if (tile.kind === 'bomb') {
      this.fail('wrong')
      return
    }

    if (tile.kind === 'bridge' || tile.kind === 'triple') {
      tile.covered.add(lane)
      this.redrawBar(tile)
      if (opts.source === 'pointer') {
        this.pointerBars.set(opts.pointerId, { tile, lane })
      }
      if (tile.covered.size >= tile.span) {
        this.hitTile(tile)
      }
      return
    }

    if (tile.kind === 'l_hook') {
      if (lane === tile.lane + tile.foot && tile.holding) {
        tile.footHit = true
        this.drawLHookFoot(tile)
        return
      }
      if (lane === tile.lane && !tile.holding) {
        this.startHold(tile)
        if (opts.source === 'pointer') {
          this.pointerHolds.set(opts.pointerId, tile)
        } else {
          this.keyHolds.set(lane, tile)
        }
      }
      return
    }

    if (tile.kind === 'fake_gap') {
      const progress = this.holdProgress(tile)
      if (progress >= tile.gapAt && progress < tile.gapAt + tile.gapLen) {
        // Pressing in the white gap fails
        this.fail('wrong')
        return
      }
      if (!tile.holding) {
        this.startHold(tile)
        if (opts.source === 'pointer') {
          this.pointerHolds.set(opts.pointerId, tile)
        } else {
          this.keyHolds.set(lane, tile)
        }
      }
      return
    }

    if (this.isHoldLike(tile.kind)) {
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

  private redrawBar(tile: Tile) {
    this.drawBarBody(
      tile.body,
      tile.w,
      tile.h,
      tile.covered.size,
      tile.span,
      tile.mod,
    )
  }

  private releaseKeyHold(rawLane: number) {
    const lane = this.mapInputLane(rawLane)
    const tile = this.keyHolds.get(lane)
    if (tile) {
      this.keyHolds.delete(lane)
      this.releaseHold(tile)
    }
    // Multi-lane bars via keyboard: drop coverage for this lane
    for (const t of this.tiles) {
      if (
        (t.kind === 'bridge' || t.kind === 'triple') &&
        t.covered.has(lane)
      ) {
        t.covered.delete(lane)
        this.redrawBar(t)
      }
    }
  }

  private startHold(tile: Tile) {
    tile.holding = true
    this.drawHoldBody(tile.body, tile.w, tile.h, true, tile.mod)
    if (tile.kind === 'fake_gap') this.drawFakeGapVisual(tile)
    if (tile.kind === 'l_hook') this.drawLHookFoot(tile)
    this.updateHoldFill(tile, this.holdProgress(tile))
  }

  private releaseHold(tile: Tile) {
    if (tile.hit || tile.dying || !tile.holding) return
    const progress = this.holdProgress(tile)

    if (tile.kind === 'fake_gap') {
      const gapEnd = tile.gapAt + tile.gapLen
      // Allowed to release into / during gap; must re-press after
      if (progress >= tile.gapAt && progress < gapEnd + 0.02) {
        tile.holding = false
        this.drawHoldBody(tile.body, tile.w, tile.h, false, tile.mod)
        this.drawFakeGapVisual(tile)
        tile.fill?.clear()
        return
      }
      if (progress >= 1 - HOLD_FORGIVE_FRAC) {
        this.completeHold(tile)
        return
      }
      // Early release on black segment = miss
      tile.holding = false
      this.missTile(tile, 'miss')
      return
    }

    if (tile.kind === 'l_hook') {
      if (progress >= 1 - HOLD_FORGIVE_FRAC && tile.footHit) {
        this.completeHold(tile)
        return
      }
      tile.holding = false
      this.missTile(tile, 'miss')
      return
    }

    if (progress >= 1 - HOLD_FORGIVE_FRAC) {
      this.completeHold(tile)
      return
    }
    tile.holding = false
    this.missTile(tile, 'miss')
  }

  private completeHold(tile: Tile) {
    if (tile.hit || tile.dying) return
    tile.holding = false
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
      this.isHoldLike(tile.kind) ||
      tile.kind === 'bridge' ||
      tile.kind === 'triple'
        ? 0
        : Math.abs(tile.y + tile.h / 2 - hitY)
    const grade: HitGrade = gradeSpatialHit({
      dist,
      tileH: tile.h,
      alwaysPerfect:
        this.isHoldLike(tile.kind) ||
        tile.kind === 'bridge' ||
        tile.kind === 'triple',
    })

    // Blitz cups score most tiles (design-pack), not grade points.
    let pts = this.mode === 'blitz' ? 1 : pointsForGrade(grade)
    if (this.mode !== 'blitz' && (tile.mod === 'gold' || this.goldActive)) {
      pts *= GOLD_SCORE_MULT
    }

    this.combo += 1
    this.score += pts
    this.handlers.onHit?.(grade, this.score, this.combo)
    const songT = this.songTimeSec()
    if (songT != null) {
      this.handlers.onTapRecord?.({
        t: songT,
        // Slides are judged at endLane; bridge/triple use leftmost lane.
        lane: tile.kind === 'slide' ? tile.endLane : tile.lane,
        grade,
      })
    }

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

  private clearHelperSlow() {
    for (const id of this.helperSlowTimers) window.clearTimeout(id)
    this.helperSlowTimers = []
    this.helperSlowMult = 1
  }

  private consumeShield(): boolean {
    if (this.isShieldActive()) {
      this.shieldUntilMs = 0
      return true
    }
    if (this.shieldCharges > 0) {
      this.shieldCharges -= 1
      return true
    }
    return false
  }

  private fail(reason: FailReason) {
    if (this.mode === 'zen' || this.mode === 'blitz') {
      const endedCombo = this.combo
      this.combo = 0
      this.handlers.onFail?.(reason, this.score, endedCombo)
      return
    }
    if (this.failed) return
    if (this.consumeShield()) {
      const endedCombo = this.combo
      this.combo = 0
      this.handlers.onShieldAbsorb?.(
        this.score,
        endedCombo,
        this.shieldCharges,
      )
      return
    }
    const songAtFail = this.songTimeSec()
    this.failSongTime = songAtFail
    this.failed = true
    this.running = false
    this.clearSpeedTimers()
    this.clearBannerTimers()
    this.clearIceTimers()
    this.clearHelperSlow()
    this.clearActiveHolds()
    this.iceMult = 1
    this.shieldCharges = 0
    this.clearModifiers()
    this.handlers.onSpeedUp?.({ phase: 'clear' })
    this.handlers.onObstacleBanner?.({ phase: 'clear' })
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
