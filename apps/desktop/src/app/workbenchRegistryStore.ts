/**
 * @file Workbench registry store: holds the currently active `AppRegistry` and
 * the reload epoch. The app shell populates this once during the initial
 * workbench load and replaces it on each compat-plugin hot-reload.
 *
 * Lives in the `app` layer so lower FSD layers never import it directly; lower
 * layers request a reload through the typed shared event bridge and observe
 * reload status through the feature-level compat plugin store.
 * @module app
 */
import { create } from 'zustand'
import type { AppRegistry } from '@shared/contracts'

type WorkbenchRegistryStatus = 'idle' | 'loading' | 'loaded' | 'error'

type WorkbenchRegistryState = {
  registry: AppRegistry | null
  /** Monotonic reload counter; 0 after the initial load, +1 per successful reload. */
  epoch: number
  status: WorkbenchRegistryStatus
  error: string | null
  setRegistry: (registry: AppRegistry, epoch: number) => void
  setStatus: (status: WorkbenchRegistryStatus) => void
  setError: (error: string | null) => void
}

export const useWorkbenchRegistryStore = create<WorkbenchRegistryState>((set) => ({
  registry: null,
  epoch: 0,
  status: 'idle',
  error: null,
  setRegistry: (registry, epoch) => set({ registry, epoch, status: 'loaded', error: null }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: error ? 'error' : 'loaded' }),
}))
