import { create } from 'zustand'
import { appEvent } from '@platform/observability'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import {
  clonePlayerAppearanceProfile,
  createDefaultPlayerAppearanceProfile,
  readStoredPlayerAppearanceState,
  sanitizePlayerAppearanceProfile,
  type PlayerAppearanceProfile,
} from '@entities/event'

type PlayerAppearanceStoreValues = {
  profiles: PlayerAppearanceProfile[]
  activeProfileId: string | null
  hydrated: boolean
}

type PlayerAppearanceStoreActions = {
  hydrateFromAppUiState: () => void
  setActiveProfileId: (profileId: string | null) => void
  createProfile: (name: string) => void
  duplicateActiveProfile: () => void
  deleteActiveProfile: (fallbackName: string) => void
  changeProfile: (nextProfile: PlayerAppearanceProfile) => void
  importProfile: (nextProfile: PlayerAppearanceProfile) => void
}

export type PlayerAppearanceStore = PlayerAppearanceStoreValues & PlayerAppearanceStoreActions

function persistPlayerAppearance(profiles: PlayerAppearanceProfile[], activeProfileId: string | null) {
  void applyAppUiStatePatch({
    appearance: {
      playerAppearance: {
        profiles,
        activeProfileId,
      },
    },
  }).catch((error) => {
    appEvent('error', 'Failed to save player appearance state')
      .error(error)
      .context({ source: 'player-appearance-state', operation: 'save' })
      .emit({ notify: false })
  })
}

/**
 * Player appearance 工作台领域 store：profile 列表与选中态的唯一权威，mutation
 * action 内直接持久化到 AppUiState（无 React 镜像 effect）。hydrateFromAppUiState
 * 幂等，由 WorkbenchExperience 在 appUiStateReady 后触发一次；文案注入由调用侧
 * 传入名称参数，store 不依赖 locale。
 */
export const usePlayerAppearanceStore = create<PlayerAppearanceStore>()((set, get) => ({
  profiles: [],
  activeProfileId: null,
  hydrated: false,

  hydrateFromAppUiState: () => {
    if (get().hydrated) {
      return
    }

    const snapshot = getAppUiStateSnapshot()
    const stored = readStoredPlayerAppearanceState(
      JSON.stringify(snapshot.appearance.playerAppearance.profiles ?? []),
      snapshot.appearance.playerAppearance.activeProfileId ?? null,
    )
    set({ profiles: stored.profiles, activeProfileId: stored.activeProfileId, hydrated: true })
  },

  setActiveProfileId: (activeProfileId) => {
    set({ activeProfileId })
    persistPlayerAppearance(get().profiles, activeProfileId)
  },

  createProfile: (name) => {
    const nextProfile = createDefaultPlayerAppearanceProfile(name)
    const profiles = [...get().profiles, nextProfile]
    set({ profiles, activeProfileId: nextProfile.id })
    persistPlayerAppearance(profiles, nextProfile.id)
  },

  duplicateActiveProfile: () => {
    const { profiles, activeProfileId } = get()
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null
    if (!activeProfile) {
      return
    }

    const nextProfile = clonePlayerAppearanceProfile(activeProfile)
    const nextProfiles = [...profiles, nextProfile]
    set({ profiles: nextProfiles, activeProfileId: nextProfile.id })
    persistPlayerAppearance(nextProfiles, nextProfile.id)
  },

  deleteActiveProfile: (fallbackName) => {
    const { profiles, activeProfileId } = get()
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null
    if (!activeProfile) {
      return
    }

    const remainingProfiles = profiles.filter((profile) => profile.id !== activeProfile.id)
    if (remainingProfiles.length === 0) {
      const fallback = createDefaultPlayerAppearanceProfile(fallbackName)
      set({ profiles: [fallback], activeProfileId: fallback.id })
      persistPlayerAppearance([fallback], fallback.id)
      return
    }

    const nextActiveProfileId = remainingProfiles[0]?.id ?? null
    set({ profiles: remainingProfiles, activeProfileId: nextActiveProfileId })
    persistPlayerAppearance(remainingProfiles, nextActiveProfileId)
  },

  changeProfile: (nextProfile) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    const profiles = get().profiles.map((profile) => (profile.id === sanitized.id ? sanitized : profile))
    set({ profiles })
    persistPlayerAppearance(profiles, get().activeProfileId)
  },

  importProfile: (nextProfile) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    const profiles = [...get().profiles, sanitized]
    set({ profiles, activeProfileId: sanitized.id })
    persistPlayerAppearance(profiles, sanitized.id)
  },
}))

/** 派生当前激活 profile：找不到选中项时回落到列表首个，无 profile 时为 null。 */
export function selectActivePlayerAppearanceProfile(state: PlayerAppearanceStoreValues) {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? state.profiles[0] ?? null
}
