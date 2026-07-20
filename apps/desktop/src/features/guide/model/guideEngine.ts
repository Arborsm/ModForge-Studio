import { create } from 'zustand'
import type { GuideDefinition } from '@shared/contracts'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state/appUiState'
import {
  GUIDE_PROGRESS_MODULE_KEY,
  findGuideForSurface,
  indexGuideDefinitions,
  normalizeCompletedGuideIds,
  readCompletedGuideIds,
} from './guideProgress'

type GuideRun = {
  guideId: string
  stepIndex: number
}

/** Replay intent consumed by the app shell, which owns mode/page navigation. */
export type GuideReplayRequest = {
  guideId: string
  surface: string
  nonce: number
}

type GuideEngineState = {
  definitions: Record<string, GuideDefinition>
  /** True once app UI state has loaded and `completedGuideIds` is trustworthy. */
  stateReady: boolean
  completedGuideIds: string[]
  currentSurface: string | null
  activeRun: GuideRun | null
  /** Replay requested while its surface is not visible; started by the surface watcher. */
  pendingGuideId: string | null
  replayRequest: GuideReplayRequest | null
  registerGuideDefinitions: (definitions: GuideDefinition[]) => void
  markGuideStateReady: () => void
  notifyGuideSurface: (surface: string | null) => void
  startGuide: (guideId: string) => void
  nextGuideStep: () => void
  previousGuideStep: () => void
  skipActiveGuide: () => void
  requestGuideReplay: (guideId: string) => void
  acknowledgeGuideReplay: (nonce: number) => void
  resetAllGuideProgress: () => void
}

function persistCompletedGuideIds(completed: string[]) {
  void applyAppUiStatePatch({
    workspace: { modules: { [GUIDE_PROGRESS_MODULE_KEY]: { completed } } },
  }).catch((error) => {
    console.error('[guide] failed to persist guide progress', error)
  })
}

function completeGuide(state: GuideEngineState, guideId: string): Partial<GuideEngineState> {
  const completedGuideIds = normalizeCompletedGuideIds([...state.completedGuideIds, guideId])
  persistCompletedGuideIds(completedGuideIds)
  return { completedGuideIds, activeRun: null }
}

function startRun(state: GuideEngineState, guideId: string): Partial<GuideEngineState> | null {
  const definition = state.definitions[guideId]
  if (!definition) {
    return null
  }

  return {
    activeRun: { guideId, stepIndex: 0 },
    pendingGuideId: state.pendingGuideId === guideId ? null : state.pendingGuideId,
  }
}

export const useGuideEngineStore = create<GuideEngineState>((set, get) => ({
  definitions: {},
  stateReady: false,
  completedGuideIds: [],
  currentSurface: null,
  activeRun: null,
  pendingGuideId: null,
  replayRequest: null,

  registerGuideDefinitions: (definitions) => {
    set({ definitions: indexGuideDefinitions(definitions) })
  },

  markGuideStateReady: () => {
    set({ completedGuideIds: readCompletedGuideIds(getAppUiStateSnapshot()), stateReady: true })
    const state = get()
    if (!state.activeRun && state.currentSurface) {
      const definition = findGuideForSurface(state.definitions, state.currentSurface)
      if (definition && !state.completedGuideIds.includes(definition.id)) {
        set({ activeRun: { guideId: definition.id, stepIndex: 0 } })
      }
    }
  },

  notifyGuideSurface: (surface) => {
    const state = get()
    if (state.currentSurface === surface) {
      return
    }

    set({ currentSurface: surface })

    if (state.pendingGuideId) {
      const pending = state.definitions[state.pendingGuideId]
      if (pending && pending.surface === surface) {
        set({ activeRun: { guideId: pending.id, stepIndex: 0 }, pendingGuideId: null })
        return
      }
    }

    let activeRun = state.activeRun
    if (activeRun) {
      const active = state.definitions[activeRun.guideId]
      if (active && active.surface !== surface) {
        activeRun = null
        set({ activeRun: null })
      }
    }

    if (activeRun || !state.stateReady) {
      return
    }

    const definition = findGuideForSurface(state.definitions, surface)
    if (definition && !state.completedGuideIds.includes(definition.id)) {
      set({ activeRun: { guideId: definition.id, stepIndex: 0 } })
    }
  },

  startGuide: (guideId) => {
    const next = startRun(get(), guideId)
    if (next) {
      set(next)
    }
  },

  nextGuideStep: () => {
    const state = get()
    const run = state.activeRun
    if (!run) {
      return
    }

    const definition = state.definitions[run.guideId]
    if (!definition) {
      set({ activeRun: null })
      return
    }

    if (run.stepIndex >= definition.steps.length - 1) {
      set(completeGuide(state, run.guideId))
      return
    }

    set({ activeRun: { ...run, stepIndex: run.stepIndex + 1 } })
  },

  previousGuideStep: () => {
    const run = get().activeRun
    if (!run || run.stepIndex === 0) {
      return
    }

    set({ activeRun: { ...run, stepIndex: run.stepIndex - 1 } })
  },

  skipActiveGuide: () => {
    const state = get()
    if (state.activeRun) {
      set(completeGuide(state, state.activeRun.guideId))
    }
  },

  requestGuideReplay: (guideId) => {
    const state = get()
    const definition = state.definitions[guideId]
    if (!definition) {
      return
    }

    const completedGuideIds = state.completedGuideIds.filter((id) => id !== guideId)
    persistCompletedGuideIds(completedGuideIds)
    const nonce = (state.replayRequest?.nonce ?? 0) + 1

    if (state.currentSurface === definition.surface) {
      set({
        completedGuideIds,
        activeRun: { guideId, stepIndex: 0 },
        pendingGuideId: null,
        replayRequest: { guideId, surface: definition.surface, nonce },
      })
      return
    }

    set({
      completedGuideIds,
      activeRun: null,
      pendingGuideId: guideId,
      replayRequest: { guideId, surface: definition.surface, nonce },
    })
  },

  acknowledgeGuideReplay: (nonce) => {
    const state = get()
    if (state.replayRequest?.nonce !== nonce) {
      return
    }

    if (state.pendingGuideId) {
      const pending = state.definitions[state.pendingGuideId]
      if (pending && pending.surface === state.currentSurface) {
        set({ activeRun: { guideId: pending.id, stepIndex: 0 }, pendingGuideId: null })
      }
    }
  },

  resetAllGuideProgress: () => {
    persistCompletedGuideIds([])
    set({ completedGuideIds: [], activeRun: null, pendingGuideId: null })
  },
}))

/** Re-registers definitions and clears runtime state between tests. */
export function resetGuideEngineForTest(definitions: GuideDefinition[] = []) {
  useGuideEngineStore.setState({
    definitions: indexGuideDefinitions(definitions),
    stateReady: false,
    completedGuideIds: [],
    currentSurface: null,
    activeRun: null,
    pendingGuideId: null,
    replayRequest: null,
  })
}
