import { create } from 'zustand'
import { audioRuntime } from '@/audio/runtime'
import type { PlayMode } from '@/game/classicPlayfield'

export type RunOutcome = 'fail' | 'clear' | 'quit'

export type LastRun = {
  mode: PlayMode
  score: number
  combo: number
  maxCombo: number
  outcome: RunOutcome
  chartTitle: string | null
}

type AppState = {
  ready: boolean
  muted: boolean
  playMode: PlayMode
  bestCombo: number
  lastRun: LastRun | null
  setMuted: (muted: boolean) => void
  toggleMute: () => void
  setPlayMode: (mode: PlayMode) => void
  setLastRun: (run: LastRun) => void
}

/** Minimal client store — gameplay state arrives in later gates. */
export const useAppStore = create<AppState>((set, get) => ({
  ready: true,
  muted: false,
  playMode: 'classic',
  bestCombo: 0,
  lastRun: null,
  setMuted: (muted) => {
    audioRuntime.setMuted(muted)
    set({ muted })
  },
  toggleMute: () => {
    const next = !get().muted
    audioRuntime.setMuted(next)
    set({ muted: next })
  },
  setPlayMode: (mode) => set({ playMode: mode }),
  setLastRun: (run) =>
    set((s) => ({
      lastRun: run,
      bestCombo: Math.max(s.bestCombo, run.maxCombo, run.combo),
    })),
}))
