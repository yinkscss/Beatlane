import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioRuntime } from '@/audio/runtime'

type FakeSource = {
  buffer: AudioBuffer | null
  loop: boolean
  playbackRate: { value: number }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function installWebAudioMock(opts: { loadDelayMs?: number } = {}) {
  const loadDelayMs = opts.loadDelayMs ?? 40
  const sources: FakeSource[] = []
  let currentTime = 1

  class FakeGain {
    gain = { value: 1 }
    connect() {}
  }

  class FakeCtx {
    state: AudioContextState = 'running'
    get currentTime() {
      return currentTime
    }
    createGain() {
      return new FakeGain()
    }
    createBufferSource(): FakeSource {
      const src: FakeSource = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(() => {
          currentTime += 0.01
        }),
        stop: vi.fn(),
        disconnect: vi.fn(),
      }
      sources.push(src)
      return src
    }
    async resume() {
      this.state = 'running'
    }
    async decodeAudioData(raw: ArrayBuffer) {
      return {
        duration: 1,
        length: raw.byteLength || 1,
        sampleRate: 44100,
        numberOfChannels: 1,
      } as AudioBuffer
    }
  }

  vi.stubGlobal('AudioContext', FakeCtx)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      await new Promise((r) => setTimeout(r, loadDelayMs))
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(16),
      }
    }),
  )

  return {
    sources,
    advance(dt: number) {
      currentTime += dt
    },
  }
}

describe('AudioRuntime.startMusic', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serializes concurrent startMusic so a second call cannot stopBed the first', async () => {
    const mock = installWebAudioMock({ loadDelayMs: 50 })
    const rt = new AudioRuntime()
    const stopSpy = vi.spyOn(rt, 'stopBed')

    const p1 = rt.startMusic('/audio/bed.wav')
    await new Promise((r) => setTimeout(r, 10))
    const p2 = rt.startMusic('/audio/bed.wav')
    const [a, b] = await Promise.all([p1, p2])

    expect(a).toBeTypeOf('number')
    expect(b).toBe(a)
    expect(rt.getMusicStartTime()).toBe(a)
    // Unserialized overlapping starts each called stopBed(); the later one
    // nulled musicStartTime after the first start had already gone live.
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(mock.sources.filter((s) => s.start.mock.calls.length > 0)).toHaveLength(
      1,
    )
  })

  it('fast-path returns the same start time when already playing', async () => {
    installWebAudioMock({ loadDelayMs: 5 })
    const rt = new AudioRuntime()
    const first = await rt.startMusic('/audio/bed.wav')
    const second = await rt.startMusic('/audio/bed.wav')
    expect(second).toBe(first)
    expect(rt.getMusicStartTime()).toBe(first)
    expect(rt.getMusicUrl()).toBe('/audio/bed.wav')
  })

  it('replaces sticky bed.wav when a different track URL is requested', async () => {
    const mock = installWebAudioMock({ loadDelayMs: 5 })
    const rt = new AudioRuntime()
    const bedStart = await rt.startMusic('/audio/bed.wav')
    expect(rt.getMusicUrl()).toBe('/audio/bed.wav')

    const trackStart = await rt.startMusic('/audio/tracks/dirty-mastered.mp3')
    expect(trackStart).not.toBe(bedStart)
    expect(rt.getMusicUrl()).toBe('/audio/tracks/dirty-mastered.mp3')
    expect(rt.getMusicStartTime()).toBe(trackStart)
    expect(mock.sources.filter((s) => s.start.mock.calls.length > 0)).toHaveLength(
      2,
    )
  })
})
