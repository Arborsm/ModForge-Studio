/**
 * @file Compat plugin store: holds the loaded plugin list and loading state.
 * @module features/compat-plugins
 */
import { create } from 'zustand'
import type { CompatPluginSummary } from '../api/types'

type CompatPluginState = {
  plugins: CompatPluginSummary[]
  status: 'idle' | 'loading' | 'loaded' | 'error'
  error: string | null
  setPlugins: (plugins: CompatPluginSummary[]) => void
  setStatus: (status: CompatPluginState['status']) => void
  setError: (error: string | null) => void
}

export const useCompatPluginStore = create<CompatPluginState>((set) => ({
  plugins: [],
  status: 'idle',
  error: null,
  setPlugins: (plugins) => set({ plugins, status: 'loaded', error: null }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: 'error' }),
}))
