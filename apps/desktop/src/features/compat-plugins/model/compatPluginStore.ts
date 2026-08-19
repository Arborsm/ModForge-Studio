/**
 * @file Compat plugin store: holds the loaded plugin list, loading state and
 * code-plugin load diagnostics.
 * @module features/compat-plugins
 */
import { create } from 'zustand'
import type { CompatPluginSummary } from '../api/types'
import type { CodePluginLoadDiagnostic } from '../runtime/codePluginLoader'

type CompatPluginState = {
  plugins: CompatPluginSummary[]
  status: 'idle' | 'loading' | 'loaded' | 'error'
  error: string | null
  /** Diagnostics from the last code-plugin load attempt (empty = no issues). */
  diagnostics: CodePluginLoadDiagnostic[]
  setPlugins: (plugins: CompatPluginSummary[]) => void
  setStatus: (status: CompatPluginState['status']) => void
  setError: (error: string | null) => void
  setDiagnostics: (diagnostics: CodePluginLoadDiagnostic[]) => void
}

export const useCompatPluginStore = create<CompatPluginState>((set) => ({
  plugins: [],
  status: 'idle',
  error: null,
  diagnostics: [],
  setPlugins: (plugins) => set({ plugins, status: 'loaded', error: null }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: 'error' }),
  setDiagnostics: (diagnostics) => set({ diagnostics }),
}))
