import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { GuideDefinition } from '@shared/contracts'
import { applyAppUiStatePatch } from '@shared/lib/app-state/appUiState'
import {
  GUIDE_PROGRESS_MODULE_KEY,
  findGuideForSurface,
  indexGuideDefinitions,
  normalizeCompletedGuideIds,
  resetGuideEngineForTest,
  useGuideEngineStore,
} from '@features/guide'

const libraryGuide: GuideDefinition = {
  id: 'launcher-library',
  surface: 'launcher.library',
  steps: [
    { id: 'welcome', placement: 'center' },
    { id: 'nav-tabs', anchor: 'launcher-nav-tabs', placement: 'bottom' },
  ],
}

const discoverGuide: GuideDefinition = {
  id: 'launcher-discover',
  surface: 'launcher.discover',
  steps: [{ id: 'welcome', placement: 'center' }],
}

const definitions = [libraryGuide, discoverGuide]

function engineState() {
  return useGuideEngineStore.getState()
}

beforeEach(async () => {
  resetGuideEngineForTest(definitions)
  await applyAppUiStatePatch({ workspace: { modules: { [GUIDE_PROGRESS_MODULE_KEY]: null } } })
})

describe('guideProgress helpers', () => {
  it('normalizes persisted completed ids', () => {
    expect(normalizeCompletedGuideIds(['a', 'a', 'b', '', 3, null])).toEqual(['a', 'b'])
    expect(normalizeCompletedGuideIds('nope')).toEqual([])
    expect(normalizeCompletedGuideIds(undefined)).toEqual([])
  })

  it('indexes definitions and rejects duplicates', () => {
    const indexed = indexGuideDefinitions(definitions)
    expect(Object.keys(indexed)).toEqual(['launcher-library', 'launcher-discover'])
    expect(() => indexGuideDefinitions([libraryGuide, libraryGuide])).toThrow(/Duplicate/)
    expect(() => indexGuideDefinitions([{ id: 'x', surface: 's', steps: [] }])).toThrow(/Invalid/)
  })

  it('finds the guide bound to a surface', () => {
    const indexed = indexGuideDefinitions(definitions)
    expect(findGuideForSurface(indexed, 'launcher.library')?.id).toBe('launcher-library')
    expect(findGuideForSurface(indexed, 'launcher.updates')).toBeNull()
    expect(findGuideForSurface(indexed, null)).toBeNull()
  })
})

describe('guideEngine', () => {
  it('auto-starts the surface guide once state is ready', () => {
    engineState().notifyGuideSurface('launcher.library')
    expect(engineState().activeRun).toBeNull()

    engineState().markGuideStateReady()
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-library', stepIndex: 0 })
  })

  it('does not auto-start a completed guide', async () => {
    await applyAppUiStatePatch({
      workspace: { modules: { [GUIDE_PROGRESS_MODULE_KEY]: { completed: ['launcher-library'] } } },
    })
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    expect(engineState().activeRun).toBeNull()
  })

  it('walks steps forward and backward and completes at the end', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()

    engineState().nextGuideStep()
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-library', stepIndex: 1 })

    engineState().previousGuideStep()
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-library', stepIndex: 0 })

    engineState().previousGuideStep()
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-library', stepIndex: 0 })

    engineState().nextGuideStep()
    engineState().nextGuideStep()
    expect(engineState().activeRun).toBeNull()
    expect(engineState().completedGuideIds).toEqual(['launcher-library'])
  })

  it('marks the guide completed when skipped', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    engineState().skipActiveGuide()

    expect(engineState().activeRun).toBeNull()
    expect(engineState().completedGuideIds).toEqual(['launcher-library'])
  })

  it('aborts the active run when the surface changes away', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    expect(engineState().activeRun).not.toBeNull()

    engineState().notifyGuideSurface('launcher.discover')
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-discover', stepIndex: 0 })
  })

  it('starts a replay immediately when the surface is current', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    engineState().skipActiveGuide()

    engineState().requestGuideReplay('launcher-library')
    expect(engineState().completedGuideIds).toEqual([])
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-library', stepIndex: 0 })
    expect(engineState().pendingGuideId).toBeNull()
    expect(engineState().replayRequest?.guideId).toBe('launcher-library')
  })

  it('defers a replay until its surface becomes visible', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    engineState().skipActiveGuide()

    engineState().requestGuideReplay('launcher-discover')
    expect(engineState().activeRun).toBeNull()
    expect(engineState().pendingGuideId).toBe('launcher-discover')

    engineState().notifyGuideSurface('launcher.discover')
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-discover', stepIndex: 0 })
    expect(engineState().pendingGuideId).toBeNull()
  })

  it('starts a pending replay after acknowledgement when the surface already matches', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    engineState().requestGuideReplay('launcher-discover')
    const nonce = engineState().replayRequest?.nonce ?? 0
    expect(engineState().pendingGuideId).toBe('launcher-discover')

    // The shell navigates and the DOM watcher reports the new surface before the
    // acknowledgement lands (e.g. synchronous route render).
    useGuideEngineStore.setState({ currentSurface: 'launcher.discover' })
    engineState().acknowledgeGuideReplay(nonce)
    expect(engineState().activeRun).toEqual({ guideId: 'launcher-discover', stepIndex: 0 })
    expect(engineState().pendingGuideId).toBeNull()
  })

  it('resets all guide progress', () => {
    engineState().notifyGuideSurface('launcher.library')
    engineState().markGuideStateReady()
    engineState().skipActiveGuide()
    expect(engineState().completedGuideIds).toEqual(['launcher-library'])

    engineState().resetAllGuideProgress()
    expect(engineState().completedGuideIds).toEqual([])
    expect(engineState().activeRun).toBeNull()
    expect(engineState().pendingGuideId).toBeNull()
  })
})
