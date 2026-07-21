import { create } from 'zustand'

type AppState = {
  ready: boolean
}

/** Minimal client store — gameplay state arrives in later gates. */
export const useAppStore = create<AppState>(() => ({
  ready: true,
}))
