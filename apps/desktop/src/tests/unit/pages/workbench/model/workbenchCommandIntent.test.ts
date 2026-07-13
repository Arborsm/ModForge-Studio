import { describe, expect, it, vi } from 'vite-plus/test'
import { renderHook, waitFor } from '@testing-library/react'
import type { PendingWorkbenchCommandIntent } from '@shared/contracts'
import { resolveWorkbenchOpenAssetTarget, useWorkbenchCommandIntent } from '@pages/workbench/model/workbenchCommandIntent'
import type { UseCpMakerReturn } from '@features/cp-maker'

function createMockCpMaker(overrides: Partial<UseCpMakerReturn> = {}): UseCpMakerReturn {
  return {
    drafts: [],
    draftsReady: true,
    i18nFiles: [],
    setI18nFiles: vi.fn(),
    activeDraft: null,
    getActiveDraftKey: vi.fn().mockReturnValue(null),
    draftLoading: false,
    draftError: null,
    isDirty: false,
    dirtyPatchIds: new Set(),
    createDraft: vi.fn(),
    loadDraft: vi.fn(),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    clearActiveDraft: vi.fn(),
    copyDraft: vi.fn(),
    refreshDrafts: vi.fn(),
    addPatch: vi.fn(),
    removePatch: vi.fn(),
    updatePatch: vi.fn(),
    getPatchesForWorkspace: vi.fn().mockReturnValue([]),
    configSchema: [],
    addConfigEntry: vi.fn(),
    removeConfigEntry: vi.fn(),
    updateConfigEntry: vi.fn(),
    virtualAssets: [],
    addVirtualAsset: vi.fn(),
    removeVirtualAsset: vi.fn(),
    customLocations: [],
    setCustomLocations: vi.fn(),
    dynamicTokens: [],
    setDynamicTokens: vi.fn(),
    aliasTokenNames: {},
    addAliasTokenName: vi.fn(),
    removeAliasTokenName: vi.fn(),
    updateMetadata: vi.fn(),
    importPack: vi.fn(),
    buildManifestJson: vi.fn(),
    buildContentJson: vi.fn() as unknown as UseCpMakerReturn['buildContentJson'],
    exportPack: vi.fn(),
    chooseDirectory: vi.fn(),
    patchCountByWorkspace: {},
    ...overrides,
  }
}

async function runWithGuard(action: () => void | Promise<void>) {
  await action()
  return true
}

async function holdForUnsavedDecision() {
  return false
}

describe('resolveWorkbenchOpenAssetTarget', () => {
  it('returns the patch workspace and asset id when patch exists', () => {
    const cpMaker = createMockCpMaker({
      activeDraft: {
        draftStorageKey: 'draft-1',
        projectMetadata: {
          projectName: 'Test',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Test',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [
          { id: 'patch-1', workspace: 'map', target: 'Maps/Town', action: 'EditMap', logName: 'Test', enabled: true, editorState: {} },
        ],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })

    const result = resolveWorkbenchOpenAssetTarget({ type: 'workbench/open-asset', assetId: 'patch-1', assetKind: 'map' }, cpMaker)

    expect(result).toEqual({ workspaceId: 'map', assetId: 'patch-1' })
  })

  it('returns null when patch does not exist', () => {
    const cpMaker = createMockCpMaker({
      activeDraft: {
        draftStorageKey: 'draft-1',
        projectMetadata: {
          projectName: 'Test',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Test',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })

    const result = resolveWorkbenchOpenAssetTarget(
      { type: 'workbench/open-asset', assetId: 'missing-patch', assetKind: 'event', sourceId: 'draft-1' },
      cpMaker,
    )

    expect(result).toBeNull()
  })
})

describe('useWorkbenchCommandIntent', () => {
  it('routes registered module navigation intents directly', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-1',
      command: { type: 'navigation/open-workbench-module', moduleId: 'map-authoring' },
    }

    const { result } = renderHook(
      ({ pendingIntent }) =>
        useWorkbenchCommandIntent({
          pendingIntent,
          cpMaker: createMockCpMaker(),
          openModule,
          navigateToAuthoringWorkspace,
          runWithModUnsavedGuard: runWithGuard,
          runWithCpMakerUnsavedGuard: runWithGuard,
          navigateToPatch,
          clearPendingIntent,
        }),
      { initialProps: { pendingIntent: intent } },
    )

    await waitFor(() => {
      expect(result.current.consumedIntentId).toBe('intent-1')
    })

    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(openModule).toHaveBeenCalledWith('map-authoring')
    expect(navigateToPatch).not.toHaveBeenCalled()
    expect(clearPendingIntent).toHaveBeenCalled()
  })

  it('consumes a workbench/open-asset intent and navigates to the patch', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()

    const gp = createMockCpMaker({
      activeDraft: {
        draftStorageKey: 'draft-1',
        projectMetadata: {
          projectName: 'Test',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Test',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [
          {
            id: 'patch-abc',
            workspace: 'events',
            target: 'Data/Events/Town',
            action: 'EditData',
            logName: 'Event',
            enabled: true,
            editorState: {},
          },
        ],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-2',
      command: { type: 'workbench/open-asset', assetId: 'patch-abc', assetKind: 'event', sourceId: 'draft-1' },
    }

    const { result } = renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        cpMaker: gp,
        openModule,
        navigateToAuthoringWorkspace,
        runWithModUnsavedGuard: runWithGuard,
        runWithCpMakerUnsavedGuard: runWithGuard,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => {
      expect(result.current.consumedIntentId).toBe('intent-2')
    })

    expect(navigateToAuthoringWorkspace).toHaveBeenCalledWith('events')
    expect(navigateToPatch).toHaveBeenCalledWith('patch-abc')
    expect(clearPendingIntent).toHaveBeenCalled()
  })

  it('keeps a cross-draft open-asset intent pending while the target draft is loading', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()
    const loadDraft = vi.fn((_storageKey: string) => new Promise<void>(() => {}))

    const gp = createMockCpMaker({
      loadDraft: async (storageKey) => {
        await loadDraft(storageKey)
        return true
      },
      activeDraft: {
        draftStorageKey: 'draft-current',
        projectMetadata: {
          projectName: 'Current',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Current',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-cross-draft',
      command: {
        type: 'workbench/open-asset',
        assetId: 'patch-from-target-draft',
        assetKind: 'event',
        sourceId: 'draft-target',
      },
    }

    renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        cpMaker: gp,
        openModule,
        navigateToAuthoringWorkspace,
        runWithModUnsavedGuard: runWithGuard,
        runWithCpMakerUnsavedGuard: runWithGuard,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => {
      expect(loadDraft).toHaveBeenCalledWith('draft-target')
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(clearPendingIntent).not.toHaveBeenCalled()
    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(navigateToPatch).not.toHaveBeenCalled()
  })

  it('consumes a cross-draft intent when loading the target draft reports failure', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()
    const gp = createMockCpMaker({
      loadDraft: vi.fn().mockResolvedValue(false),
      activeDraft: {
        draftStorageKey: 'draft-current',
        projectMetadata: {
          projectName: 'Current',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Current',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })
    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-cross-draft-failed',
      command: { type: 'workbench/open-asset', assetId: 'missing', assetKind: 'event', sourceId: 'draft-target' },
    }

    const { result } = renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        cpMaker: gp,
        openModule,
        navigateToAuthoringWorkspace,
        runWithModUnsavedGuard: runWithGuard,
        runWithCpMakerUnsavedGuard: runWithGuard,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => expect(result.current.consumedIntentId).toBe(intent.id))
    expect(clearPendingIntent).toHaveBeenCalledOnce()
    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(navigateToPatch).not.toHaveBeenCalled()
  })

  it('consumes a cross-draft intent when loading the target draft rejects', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()
    const gp = createMockCpMaker({
      loadDraft: vi.fn().mockRejectedValue(new Error('load failed')),
      activeDraft: {
        draftStorageKey: 'draft-current',
        projectMetadata: {
          projectName: 'Current',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Current',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })
    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-cross-draft-rejected',
      command: { type: 'workbench/open-asset', assetId: 'missing', assetKind: 'event', sourceId: 'draft-target' },
    }

    const { result } = renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        cpMaker: gp,
        openModule,
        navigateToAuthoringWorkspace,
        runWithModUnsavedGuard: runWithGuard,
        runWithCpMakerUnsavedGuard: runWithGuard,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => expect(result.current.consumedIntentId).toBe(intent.id))
    expect(clearPendingIntent).toHaveBeenCalledOnce()
    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(navigateToPatch).not.toHaveBeenCalled()
  })

  it('waits for the CP Maker dirty guard before loading a cross-draft open-asset intent', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()
    const loadDraft = vi.fn()
    const runWithCpMakerUnsavedGuard = vi.fn(holdForUnsavedDecision)

    const gp = createMockCpMaker({
      isDirty: true,
      loadDraft,
      activeDraft: {
        draftStorageKey: 'draft-current',
        projectMetadata: {
          projectName: 'Current',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Current',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-cross-draft-dirty',
      command: {
        type: 'workbench/open-asset',
        assetId: 'patch-from-target-draft',
        assetKind: 'event',
        sourceId: 'draft-target',
      },
    }

    renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        cpMaker: gp,
        openModule,
        navigateToAuthoringWorkspace,
        runWithModUnsavedGuard: runWithGuard,
        runWithCpMakerUnsavedGuard,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => {
      expect(runWithCpMakerUnsavedGuard).toHaveBeenCalled()
    })

    expect(loadDraft).not.toHaveBeenCalled()
    expect(clearPendingIntent).not.toHaveBeenCalled()
    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(navigateToPatch).not.toHaveBeenCalled()
  })

  it('waits for the Mod workspace dirty guard before loading a cross-draft open-asset intent', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()
    const loadDraft = vi.fn()
    const runWithModUnsavedGuard = vi.fn(holdForUnsavedDecision)
    const runWithCpMakerUnsavedGuard = vi.fn(runWithGuard)

    const gp = createMockCpMaker({
      loadDraft,
      activeDraft: {
        draftStorageKey: 'draft-current',
        projectMetadata: {
          projectName: 'Current',
          projectDescription: '',
          projectAuthor: '',
          projectVersion: '1.0.0',
          projectUniqueId: 'Author.Current',
          gameRootPath: null,
          contentPackForUniqueId: 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
        i18nFiles: [],
      } as UseCpMakerReturn['activeDraft'],
    })

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-cross-draft-mod-dirty',
      command: {
        type: 'workbench/open-asset',
        assetId: 'patch-from-target-draft',
        assetKind: 'event',
        sourceId: 'draft-target',
      },
    }

    renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        cpMaker: gp,
        openModule,
        navigateToAuthoringWorkspace,
        runWithModUnsavedGuard,
        runWithCpMakerUnsavedGuard,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => {
      expect(runWithModUnsavedGuard).toHaveBeenCalled()
    })

    expect(runWithCpMakerUnsavedGuard).not.toHaveBeenCalled()
    expect(loadDraft).not.toHaveBeenCalled()
    expect(clearPendingIntent).not.toHaveBeenCalled()
    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(navigateToPatch).not.toHaveBeenCalled()
  })

  it('does not replay an already consumed intent when the same id returns after being cleared', async () => {
    const openModule = vi.fn()
    const navigateToAuthoringWorkspace = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-replay',
      command: { type: 'navigation/open-workbench-module', moduleId: 'map-authoring' },
    }

    const { result, rerender } = renderHook(
      ({ pendingIntent }) =>
        useWorkbenchCommandIntent({
          pendingIntent,
          cpMaker: createMockCpMaker(),
          openModule,
          navigateToAuthoringWorkspace,
          runWithModUnsavedGuard: runWithGuard,
          runWithCpMakerUnsavedGuard: runWithGuard,
          navigateToPatch,
          clearPendingIntent,
        }),
      { initialProps: { pendingIntent: intent as PendingWorkbenchCommandIntent | null } },
    )

    await waitFor(() => {
      expect(result.current.consumedIntentId).toBe('intent-replay')
    })

    rerender({ pendingIntent: null })
    rerender({ pendingIntent: intent })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(navigateToAuthoringWorkspace).not.toHaveBeenCalled()
    expect(openModule).toHaveBeenCalledTimes(1)
    expect(navigateToPatch).not.toHaveBeenCalled()
    expect(clearPendingIntent).toHaveBeenCalledTimes(1)
  })
})
