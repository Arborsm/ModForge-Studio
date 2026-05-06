import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { PendingWorkbenchCommandIntent } from '@shared/contracts'
import {
  resolveWorkbenchOpenAssetTarget,
  useWorkbenchCommandIntent,
} from './workbenchCommandIntent'
import type { UseGeneratedProjectReturn } from '@features/generated-project'

function createMockGeneratedProject(overrides: Partial<UseGeneratedProjectReturn> = {}): UseGeneratedProjectReturn {
  return {
    drafts: [],
    activeDraft: null,
    draftLoading: false,
    draftError: null,
    isDirty: false,
    dirtyPatchIds: new Set(),
    createDraft: vi.fn(),
    loadDraft: vi.fn(),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
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
    buildContentJson: vi.fn() as unknown as UseGeneratedProjectReturn['buildContentJson'],
    exportPack: vi.fn(),
    patchCountByWorkspace: {},
    ...overrides,
  }
}

describe('resolveWorkbenchOpenAssetTarget', () => {
  it('returns the patch workspace and asset id when patch exists', () => {
    const generatedProject = createMockGeneratedProject({
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
      } as UseGeneratedProjectReturn['activeDraft'],
    })

    const result = resolveWorkbenchOpenAssetTarget(
      { type: 'workbench/open-asset', assetId: 'patch-1', assetKind: 'map' },
      generatedProject,
    )

    expect(result).toEqual({ workspaceId: 'map', assetId: 'patch-1' })
  })

  it('returns null when patch does not exist', () => {
    const generatedProject = createMockGeneratedProject({
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
      } as UseGeneratedProjectReturn['activeDraft'],
    })

    const result = resolveWorkbenchOpenAssetTarget(
      { type: 'workbench/open-asset', assetId: 'missing-patch', assetKind: 'event', sourceId: 'draft-1' },
      generatedProject,
    )

    expect(result).toBeNull()
  })
})

describe('useWorkbenchCommandIntent', () => {
  it('consumes a navigation/open-workbench-view intent for studio-desk', async () => {
    const setWorkspaceMode = vi.fn()
    const setWorkspaceViewMode = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-1',
      command: { type: 'navigation/open-workbench-view', viewId: 'studio-desk' },
    }

    const { result } = renderHook(
      ({ pendingIntent }) =>
        useWorkbenchCommandIntent({
          pendingIntent,
          generatedProject: createMockGeneratedProject(),
          setWorkspaceMode,
          setWorkspaceViewMode,
          navigateToPatch,
          clearPendingIntent,
        }),
      { initialProps: { pendingIntent: intent } },
    )

    await waitFor(() => {
      expect(result.current.consumedIntentId).toBe('intent-1')
    })

    expect(setWorkspaceMode).toHaveBeenCalledWith('mods')
    expect(setWorkspaceViewMode).toHaveBeenCalledWith('edit')
    expect(navigateToPatch).toHaveBeenCalledWith(null)
    expect(clearPendingIntent).toHaveBeenCalled()
  })

  it('consumes a workbench/open-asset intent and navigates to the patch', async () => {
    const setWorkspaceMode = vi.fn()
    const setWorkspaceViewMode = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()

    const gp = createMockGeneratedProject({
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
        patches: [{ id: 'patch-abc', workspace: 'events', target: 'Data/Events/Town', action: 'EditData', logName: 'Event', enabled: true, editorState: {} }],
        virtualAssets: [],
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
      } as UseGeneratedProjectReturn['activeDraft'],
    })

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-2',
      command: { type: 'workbench/open-asset', assetId: 'patch-abc', assetKind: 'event', sourceId: 'draft-1' },
    }

    const { result } = renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        generatedProject: gp,
        setWorkspaceMode,
        setWorkspaceViewMode,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => {
      expect(result.current.consumedIntentId).toBe('intent-2')
    })

    expect(setWorkspaceMode).toHaveBeenCalledWith('events')
    expect(setWorkspaceViewMode).toHaveBeenCalledWith('edit')
    expect(navigateToPatch).toHaveBeenCalledWith('patch-abc')
    expect(clearPendingIntent).toHaveBeenCalled()
  })

  it('handles unsupported view ids safely', async () => {
    const setWorkspaceMode = vi.fn()
    const setWorkspaceViewMode = vi.fn()
    const navigateToPatch = vi.fn()
    const clearPendingIntent = vi.fn()

    const intent: PendingWorkbenchCommandIntent = {
      id: 'intent-3',
      command: { type: 'navigation/open-workbench-view', viewId: 'unknown-view' },
    }

    const { result } = renderHook(() =>
      useWorkbenchCommandIntent({
        pendingIntent: intent,
        generatedProject: createMockGeneratedProject(),
        setWorkspaceMode,
        setWorkspaceViewMode,
        navigateToPatch,
        clearPendingIntent,
      }),
    )

    await waitFor(() => {
      expect(result.current.consumedIntentId).toBe('intent-3')
    })

    // Only clearIntent should be called; no mode navigation
    expect(setWorkspaceMode).not.toHaveBeenCalled()
    expect(setWorkspaceViewMode).not.toHaveBeenCalled()
    expect(navigateToPatch).not.toHaveBeenCalled()
    expect(clearPendingIntent).toHaveBeenCalled()
  })
})
