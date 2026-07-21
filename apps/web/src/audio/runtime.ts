/**
 * Beatlane Web Audio runtime (G4).
 * Single AudioContext; master → music + SFX gains; mute via master gain.
 * No Howler / Tone / extra audio libs.
 */

export type SfxId = 'perfect' | 'great' | 'miss' | 'ui'

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

class AudioRuntime {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private music: GainNode | null = null
  private sfx: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private bedSource: AudioBufferSourceNode | null = null
  private muted = false
  /** AudioContext.currentTime when the bed started (sync ref for G5+). */
  private musicStartTime: number | null = null
  private loadPromise: Promise<void> | null = null

  /** Lazily create the shared graph. Does not resume a suspended context. */
  ensureGraph(): AudioContext {
    if (this.ctx) return this.ctx

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
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

  /** Resume context (user-gesture safe) and preload buffers. */
  async unlock(): Promise<void> {
    const ctx = this.ensureGraph()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
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
   */
  async startMusic(
    url: string,
    opts: { restart?: boolean; loop?: boolean } = {},
  ): Promise<number> {
    const restart = opts.restart === true
    const loop = opts.loop !== false
    if (!restart && this.bedSource && this.musicStartTime != null) {
      await this.unlock()
      return this.musicStartTime
    }

    await this.unlock()
    this.stopBed()

    const ctx = this.ensureGraph()
    const music = this.music
    if (!music) throw new Error('Music gain missing')

    const buf = await this.loadBuffer(url)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = loop
    src.connect(music)
    const when = ctx.currentTime
    src.start(when)
    this.bedSource = src
    this.musicStartTime = when
    return when
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

if (import.meta.env.DEV) {
  ;(window as unknown as { __beatlaneAudio?: AudioRuntime }).__beatlaneAudio =
    audioRuntime
}
