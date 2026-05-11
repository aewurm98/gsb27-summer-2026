import { create } from 'zustand'

interface MapState {
  weekIndex: number
  setWeekIndex: (i: number) => void
}

export const useMapStore = create<MapState>((set) => ({
  weekIndex: 0,
  setWeekIndex: (weekIndex) => set({ weekIndex }),
}))
