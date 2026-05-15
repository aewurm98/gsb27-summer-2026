import { create } from 'zustand'

interface MapState {
  weekIndex: number
  setWeekIndex: (i: number) => void
}

export const useMapStore = create<MapState>((set) => ({
  weekIndex: 2, // default to Week 3 — most classmates have started by then
  setWeekIndex: (weekIndex) => set({ weekIndex }),
}))
