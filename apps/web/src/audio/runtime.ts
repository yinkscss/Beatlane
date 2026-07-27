/**
 * Beatlane Web Audio runtime (G4).
 * Single AudioContext; master → music + SFX gains; mute via master gain.
 * No Howler / Tone / extra audio libs.
 */

import { detectOnsets, type Onset } from '@/audio/onsets'

export type SfxId = 'perfect' | 'great' | 'miss' | 'ui'
export type { Onset }

const BED_URL = '/audio/bed.wav'

const SFX_URLS: Record<SfxId, string> = {
  perfect: '/audio/sfx-perfect.wav',
  great: '/audio/sfx-great.wav',
  miss: '/audio/sfx-miss.wav',
  ui: '/audio/sfx-ui.wav',
}

const MASTER_GAIN = 1
const MUSIC_GAIN = 0.42
const SFX_GAIN = 0.75

export class AudioRuntime {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private music: GainNode | null = null
  private sfx: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private bedSource: AudioBufferSourceNode | null = null
  private muted = false
  /** AudioContext.currentTime when the bed started (sync ref for G5+). */
  private musicStartTime: number | null = null
  /** Offset into the buffer where playback began (revive seek). */
  private musicOffsetSec = 0
  /** URL of the buffer currently routed through the music bus (if any). */
  private musicUrl: string | null = null
  /** Decoded bed length — used for Classic level-up on song loop. */
  private musicDurationSec: number | null = null
  private loadPromise: Promise<void> | null = null
  /** Serialize starts so overlapping kickBed/startMusic cannot stopBed mid-flight. */
  private startGate: Promise<void> = Promise.resolve()
  /** Current playbackRate on the bed (Classic loop doubling). */
  private musicRate = 1
  /** File-position anchor for rate-aware playhead math. */
  private fileAnchorSec = 0
  /** AudioContext.currentTime when fileAnchorSec was last set. */
  private ctxAnchorTime: number | null = null
  private onsetCache = new Map<string, Onset[]>()
  private onsetPromises = new Map<string, Promise<Onset[]>>()

  /** Lazily create the shared graph. Does not resume a suspended context. */
  ensureGraph(): AudioContext {
    if (this.ctx) return this.ctx

    const g = globalThis as typeof globalThis & {
      AudioContext?: typeof AudioContext
      webkitAudioContext?: typeof AudioContext
    }
    const Ctx = g.AudioContext || g.webkitAudioContext
    if (!Ctx) throw new Error('Web Audio API unavailable')
    const ctx = new Ctx()
    const master = ctx.createGain()
    const music = ctx.createGain()
    const sfx = ctx.createGain()

    master.gain.value = this.muted ? 0 : MASTER_GAIN
    music.gain.value = MUSIC_GAIN
    sfx.gain.value = SFX_GAIN

    music.connect(master)
    sfx.connect(master)
    master.connect(ctx.destination)

    this.ctx = ctx
    this.master = master
    this.music = music
    this.sfx = sfx
    return ctx
  }

  getContext(): AudioContext | null {
    return this.ctx
  }

  isMuted(): boolean {
    return this.muted
  }

  /** Mute via master gain — context stays alive. */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) {
      this.master.gain.value = muted ? 0 : MASTER_GAIN
    }
  }

  getMusicStartTime(): number | null {
    return this.musicStartTime
  }

  /** URL currently playing on the music bus, or null if idle. */
  getMusicUrl(): string | null {
    return this.musicUrl
  }

  /**
   * Current playhead inside the looping bed file (seconds), or null if idle.
   * Rate-aware: filePos = fileAnchor + (ctxNow - ctxAnchor) * rate, then modulo.
   */
  getMusicFilePositionSec(): number | null {
    if (this.musicStartTime == null || !this.ctx || this.ctxAnchorTime == null) {
      return null
    }
    const elapsed =
      (this.ctx.currentTime - this.ctxAnchorTime) * this.musicRate
    const pos = this.fileAnchorSec + elapsed
    const dur = this.musicDurationSec
    if (dur != null && dur > 0) {
      return ((pos % dur) + dur) % dur
    }
    return Math.max(0, pos)
  }

  getMusicRate(): number {
    return this.musicRate
  }

  /**
   * Instantly set bed playbackRate (no ramp — ramps desync onset-locked tiles).
   * Re-anchors the file playhead so getMusicFilePositionSec stays correct.
   */
  setMusicRate(rate: number): void {
    const r = Math.max(0.05, Math.min(8, rate))
    if (!this.bedSource || !this.ctx || this.ctxAnchorTime == null) {
      this.musicRate = r
      return
    }
    const pos = this.getMusicFilePositionSec() ?? this.fileAnchorSec
    this.fileAnchorSec = pos
    this.ctxAnchorTime = this.ctx.currentTime
    this.musicRate = r
    try {
      this.bedSource.playbackRate.value = r
    } catch {
      /* source may have ended */
    }
  }

  /**
   * Analyze (and cache) onsets for a music URL. Reuses the decode cache.
   * Returns [] when the track is too sparse — callers fall back to beat grid.
   */
  async getOnsets(url: string): Promise<Onset[]> {
    const hit = this.onsetCache.get(url)
    if (hit) return hit
    const inflight = this.onsetPromises.get(url)
    if (inflight) return inflight
    const p = (async () => {
      const buf = await this.loadBuffer(url)
      const onsets = await detectOnsets(buf)
      this.onsetCache.set(url, onsets)
      this.onsetPromises.delete(url)
      return onsets
    })().catch((err) => {
      this.onsetPromises.delete(url)
      throw err
    })
    this.onsetPromises.set(url, p)
    return p
  }

  /** Resume AudioContext only — safe to call from a user gesture. */
  async resumeContext(): Promise<void> {
    const ctx = this.ensureGraph()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  }

  /** Resume context (user-gesture safe) and preload buffers. */
  async unlock(): Promise<void> {
    await this.resumeContext()
    await this.preload()
  }

  async preload(): Promise<void> {
    this.ensureGraph()
    if (!this.loadPromise) {
      this.loadPromise = this.loadAll().catch((err) => {
        this.loadPromise = null
        throw err
      })
    }
    await this.loadPromise
  }

  private async loadAll(): Promise<void> {
    const urls = [BED_URL, ...Object.values(SFX_URLS)]
    await Promise.all(urls.map((url) => this.loadBuffer(url)))
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const hit = this.buffers.get(url)
    if (hit) return hit
    const ctx = this.ensureGraph()
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Audio fetch failed: ${url} (${res.status})`)
    const raw = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(raw.slice(0))
    this.buffers.set(url, buf)
    return buf
  }

  /**
   * Start (or restart) music from an arbitrary URL (Storage signed URL in G12).
   * Loops short placeholders so the run can finish the chart.
   * Concurrent callers share one in-flight start (Play kickBed on every tap).
   */
  startMusic(
    url: string,
    opts: { restart?: boolean; loop?: boolean; offsetSec?: number } = {},
  ): Promise<number> {
    const run = () => this.startMusicUnlocked(url, opts)
    const result = this.startGate.then(run, run)
    this.startGate = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async startMusicUnlocked(
    url: string,
    opts: { restart?: boolean; loop?: boolean; offsetSec?: number } = {},
  ): Promise<number> {
    const loop = opts.loop !== false
    const wantOffset = Math.max(0, opts.offsetSec ?? 0)
    // Different URL must replace the current bed (e.g. sticky bed.wav → track).
    const restart =
      opts.restart === true ||
      (this.musicUrl != null && this.musicUrl !== url) ||
      (opts.offsetSec != null &&
        Math.abs(wantOffset - this.musicOffsetSec) > 1e-3)
    if (
      !restart &&
      this.bedSource &&
      this.musicStartTime != null &&
      this.musicUrl === url
    ) {
      await this.resumeContext()
      return this.musicStartTime
    }

    // Resume only — do not await full SFX preload (that stalled Play → beginRun).
    await this.resumeContext()
    this.stopBed()
    void this.preload().catch(() => {
      /* sfx warm-up is best-effort */
    })

    const ctx = this.ensureGraph()
    const music = this.music
    if (!music) throw new Error('Music gain missing')

    const buf = await this.loadBuffer(url)
    // Another queued start may have won while we awaited decode — don't clobber
    // unless it is still the wrong URL (or we were asked to restart).
    if (
      this.bedSource &&
      this.musicStartTime != null &&
      this.musicUrl === url &&
      !opts.restart &&
      opts.offsetSec == null
    ) {
      return this.musicStartTime
    }

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = loop
    src.playbackRate.value = 1
    src.connect(music)
    const when = ctx.currentTime
    const offset =
      buf.duration > 0 ? wantOffset % buf.duration : wantOffset
    src.start(when, offset)
    this.bedSource = src
    this.musicStartTime = when
    this.musicOffsetSec = offset
    this.musicUrl = url
    this.musicDurationSec = buf.duration > 0 ? buf.duration : null
    this.musicRate = 1
    this.fileAnchorSec = offset
    this.ctxAnchorTime = when
    return when
  }

  /** Length of the current bed in seconds, or null if not loaded. */
  getMusicDurationSec(): number | null {
    return this.musicDurationSec
  }

  /** Duration of a decoded (cached) buffer, or null if not yet loaded. */
  getBufferDurationSec(url: string): number | null {
    const buf = this.buffers.get(url)
    return buf && buf.duration > 0 ? buf.duration : null
  }

  /**
   * Start (or restart) the looping bed track. Returns music start time
   * in AudioContext seconds for chart sync (G5).
   * If already playing and `restart` is false, returns the existing start time.
   */
  async startBed(opts: { restart?: boolean } = {}): Promise<number> {
    return this.startMusic(BED_URL, { ...opts, loop: true })
  }

  stopBed(): void {
    if (this.bedSource) {
      try {
        this.bedSource.stop()
      } catch {
        /* already stopped */
      }
      try {
        this.bedSource.disconnect()
      } catch {
        /* noop */
      }
      this.bedSource = null
    }
    this.musicStartTime = null
    this.musicOffsetSec = 0
    this.musicUrl = null
    this.musicDurationSec = null
    this.musicRate = 1
    this.fileAnchorSec = 0
    this.ctxAnchorTime = null
  }

  /** Fire-and-forget one-shot through the SFX bus (never stops the bed). */
  playSfx(id: SfxId): void {
    const ctx = this.ctx
    const sfx = this.sfx
    if (!ctx || !sfx || ctx.state !== 'running') return

    const buf = this.buffers.get(SFX_URLS[id])
    if (!buf) return

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(sfx)
    src.start()
  }
}

/** Session singleton — one AudioContext for the app. */
export const audioRuntime = new AudioRuntime()

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __beatlaneAudio?: AudioRuntime }).__beatlaneAudio =
    audioRuntime
}
