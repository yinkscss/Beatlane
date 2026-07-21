import { create } from 'zustand'
import { audioRuntime } from '@/audio/runtime'

type AppState = {
  ready: boolean
  muted: boolean
  setMuted: (muted: boolean) => void
  toggleMute: () => void
}

/** Minimal client store — gameplay state arrives in later gates. */
export const useAppStore = create<AppState>((set, get) => ({
  ready: true,
  muted: false,
  setMuted: (muted) => {
    audioRuntime.setMuted(muted)
    set({ muted })
  },
  toggleMute: () => {
    const next = !get().muted
    audioRuntime.setMuted(next)
    set({ muted: next })
  },
}))
