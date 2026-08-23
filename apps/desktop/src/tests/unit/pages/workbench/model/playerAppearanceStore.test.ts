import { beforeEach, describe, expect, test } from 'vite-plus/test'
import { createDefaultPlayerAppearanceProfile } from '@entities/event'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { selectActivePlayerAppearanceProfile, usePlayerAppearanceStore } from '@pages/workbench/model/playerAppearanceStore'

/** 归位内存 snapshot 与 store；await patch 顺带 flush patch 队列，确保前一用例的 persist 已落进 snapshot。 */
async function resetState() {
  await applyAppUiStatePatch({
    appearance: {
      playerAppearance: {
        profiles: [],
        activeProfileId: null,
      },
    },
  })
  usePlayerAppearanceStore.setState({ profiles: [], activeProfileId: null, hydrated: false })
}

function hydrate() {
  usePlayerAppearanceStore.getState().hydrateFromAppUiState()
  return usePlayerAppearanceStore.getState()
}

beforeEach(resetState)

describe('playerAppearanceStore', () => {
  test('hydrateFromAppUiState reads persisted profiles once and stays idempotent', async () => {
    const persisted = createDefaultPlayerAppearanceProfile('Persisted')
    await applyAppUiStatePatch({
      appearance: {
        playerAppearance: {
          profiles: [persisted],
          activeProfileId: persisted.id,
        },
      },
    })

    const hydrated = hydrate()
    expect(hydrated.profiles.map((profile) => profile.id)).toEqual([persisted.id])
    expect(hydrated.activeProfileId).toBe(persisted.id)

    // 二次 hydrate 不得覆盖之后的 mutation
    usePlayerAppearanceStore.getState().createProfile('Local')
    usePlayerAppearanceStore.getState().hydrateFromAppUiState()
    expect(usePlayerAppearanceStore.getState().profiles).toHaveLength(2)
  })

  test('hydrateFromAppUiState ensures a default profile when nothing is stored', () => {
    const hydrated = hydrate()
    expect(hydrated.profiles).toHaveLength(1)
    expect(hydrated.activeProfileId).toBe(hydrated.profiles[0]!.id)
  })

  test('createProfile appends, selects and persists the new profile', async () => {
    const base = hydrate().profiles.length
    usePlayerAppearanceStore.getState().createProfile('Farmer A')

    const state = usePlayerAppearanceStore.getState()
    expect(state.profiles).toHaveLength(base + 1)
    expect(state.profiles[base]!.label).toBe('Farmer A')
    expect(state.activeProfileId).toBe(state.profiles[base]!.id)

    await applyAppUiStatePatch({})
    const snapshot = getAppUiStateSnapshot()
    expect(snapshot.appearance.playerAppearance.profiles.map((profile) => (profile as { id: string }).id)).toEqual(
      state.profiles.map((profile) => profile.id),
    )
    expect(snapshot.appearance.playerAppearance.activeProfileId).toBe(state.activeProfileId)
  })

  test('duplicateActiveProfile clones the active profile', () => {
    const base = hydrate().profiles.length
    usePlayerAppearanceStore.getState().createProfile('Original')

    usePlayerAppearanceStore.getState().duplicateActiveProfile()
    const state = usePlayerAppearanceStore.getState()
    expect(state.profiles).toHaveLength(base + 2)
    expect(state.activeProfileId).toBe(state.profiles[base + 1]!.id)
  })

  test('deleteActiveProfile rebuilds a fallback profile when the last one is removed', () => {
    hydrate()
    const state = usePlayerAppearanceStore.getState()
    // 删到只剩一个，再删触发 fallback 重建
    while (usePlayerAppearanceStore.getState().profiles.length > 1) {
      usePlayerAppearanceStore.getState().deleteActiveProfile('Fallback Name')
    }
    usePlayerAppearanceStore.getState().deleteActiveProfile('Fallback Name')

    const next = usePlayerAppearanceStore.getState()
    expect(next.profiles).toHaveLength(1)
    expect(next.profiles[0]!.label).toBe('Fallback Name')
    expect(next.activeProfileId).toBe(next.profiles[0]!.id)
    expect(state.hydrated).toBe(true)
  })

  test('changeProfile replaces the matching profile', () => {
    hydrate()
    usePlayerAppearanceStore.getState().createProfile('Before')

    const created = usePlayerAppearanceStore.getState().profiles.at(-1)!
    usePlayerAppearanceStore.getState().changeProfile({ ...created, label: 'After' })
    expect(usePlayerAppearanceStore.getState().profiles.at(-1)!.label).toBe('After')
  })

  test('selectActivePlayerAppearanceProfile falls back to the first profile', () => {
    hydrate()
    usePlayerAppearanceStore.getState().createProfile('First')
    usePlayerAppearanceStore.getState().createProfile('Second')

    const state = usePlayerAppearanceStore.getState()
    expect(selectActivePlayerAppearanceProfile(state)?.id).toBe(state.activeProfileId)

    usePlayerAppearanceStore.setState({ activeProfileId: 'missing-id' })
    expect(selectActivePlayerAppearanceProfile(usePlayerAppearanceStore.getState())?.id).toBe(
      usePlayerAppearanceStore.getState().profiles[0]!.id,
    )
  })
})
