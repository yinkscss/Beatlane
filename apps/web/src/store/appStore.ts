import { create } from 'zustand'
import { audioRuntime } from '@/audio/runtime'
import { DEFAULT_LOCAL_TRACK_ID } from '@/audio/localTracks'
import type { PlayMode } from '@/game/classicPlayfield'
import { readMutedDefault, writeMutedPref } from '@/lib/mutePref'

const initialMuted = readMutedDefault()
audioRuntime.setMuted(initialMuted)

export type RunOutcome = 'fail' | 'clear' | 'quit'

export type LastRun = {
  mode: PlayMode
  score: number
  combo: number
  maxCombo: number
  outcome: RunOutcome
  chartTitle: string | null
  /** G13: server-validated Daily/Classic board score */
  submitted?: boolean
  validated?: boolean
  dailyDay?: string | null
  runId?: string | null
  serverScore?: number | null
  /** G16 Blitz cup */
  tournamentSlug?: string | null
  tournamentId?: string | null
  placement?: number | null
  payoutStubCusd?: number | null
}

type AppState = {
  ready: boolean
  muted: boolean
  playMode: PlayMode
  /** Local looping bed id for Classic endless. */
  classicTrackId: string
  bestCombo: number
  lastRun: LastRun | null
  setMuted: (muted: boolean) => void
  toggleMute: () => void
  setPlayMode: (mode: PlayMode) => void
  setClassicTrackId: (id: string) => void
  setLastRun: (run: LastRun) => void
}

/** Minimal client store — gameplay state arrives in later gates. */
export const useAppStore = create<AppState>((set, get) => ({
  ready: true,
  muted: initialMuted,
  playMode: 'classic',
  classicTrackId: DEFAULT_LOCAL_TRACK_ID,
  bestCombo: 0,
  lastRun: null,
  setMuted: (muted) => {
    audioRuntime.setMuted(muted)
    writeMutedPref(muted)
    set({ muted })
  },
  toggleMute: () => {
    const next = !get().muted
    audioRuntime.setMuted(next)
    writeMutedPref(next)
    set({ muted: next })
  },
  setPlayMode: (mode) => set({ playMode: mode }),
  setClassicTrackId: (classicTrackId) => set({ classicTrackId }),
  setLastRun: (run) =>
    set((s) => ({
      lastRun: run,
      bestCombo: Math.max(s.bestCombo, run.maxCombo, run.combo),
    })),
}))
