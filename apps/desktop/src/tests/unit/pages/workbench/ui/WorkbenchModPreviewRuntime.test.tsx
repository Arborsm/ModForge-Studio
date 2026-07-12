import { createRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { WorkbenchModPreviewRuntime, type ModWorkspaceGuardHandle } from '@pages/workbench/ui/WorkbenchModPreviewRuntime'
import type { WorkspaceLayoutHandle } from '@shared/contracts'

const useModWorkspaceMock = vi.hoisted(() => vi.fn())

vi.mock('@pages/workbench/workspaces/mod', async () => {
  const actual = await vi.importActual<typeof import('@pages/workbench/workspaces/mod')>('@pages/workbench/workspaces/mod')
  return {
    ...actual,
    useModWorkspace: useModWorkspaceMock,
    ModWorkspaceDecisionDialogs: () => null,
  }
})

vi.mock('@pages/workbench/model/workspace-panels/buildWorkspacePanels', () => ({
  buildWorkspacePanels: () => [
    {
      id: 'mods',
      title: 'Mods',
      subtitle: '',
      content: <div>Mods panel</div>,
      minWidth: 100,
      minHeight: 100,
    },
  ],
}))

vi.mock('@pages/workbench/ui/WorkbenchLayoutHost', () => ({
  WorkbenchLayoutHost: () => <div>Layout host</div>,
}))

function createModWorkspaceMock() {
  return {
    copy: {},
    requestUnsavedChangeDecision: vi.fn(async (action: () => void | Promise<void>) => {
      await action()
      return true
    }),
    hasUnsavedChanges: true,
    pendingUnsavedChangeDecision: null,
    diagnostics: [],
    modProjects: [],
    projectDetail: null,
    statusMessage: '',
    i18nFiles: [],
    pluginDefinition: null,
    filteredModProjects: [],
    activeProjectPath: null,
    activeProject: null,
    modFilter: '',
    contentPatcherOnly: true,
    compatibleOnly: true,
    setModFilter: vi.fn(),
    setContentPatcherOnly: vi.fn(),
    setCompatibleOnly: vi.fn(),
    handleSelectProject: vi.fn(),
    handleImportProject: vi.fn(),
    handleRefreshProjects: vi.fn(),
    manifestEditor: { text: '', value: null, error: null },
    contentEditor: { text: '', value: null, error: null },
    contentSummary: {
      format: null,
      changeCount: 0,
      includeCount: 0,
      dynamicTokenCount: 0,
      configKeys: [],
      patches: [],
    },
    selectedPatchId: null,
    setSelectedPatchId: vi.fn(),
    selectedPatch: null,
    patchWhenError: null,
    canPersist: false,
    lastSaveResult: null,
    contentPatcherSnapshot: null,
    contentPatcherSimulation: null,
    contentPatcherResultAsset: null,
    contentPatcherResultLoading: false,
    contentPatcherResultError: null,
    simulationContext: {},
    setI18nFiles: vi.fn(),
    navigatorMode: 'patches',
    selectedTargetPath: null,
    setNavigatorMode: vi.fn(),
    scaleUpEditor: null,
    handleManifestFieldChange: vi.fn(),
    handleManifestTextChange: vi.fn(),
    handleContentTextChange: vi.fn(),
    handleAddPatch: vi.fn(),
    handleRemoveSelectedPatch: vi.fn(),
    handlePatchFieldChange: vi.fn(),
    handlePatchWhenChange: vi.fn(),
    handleSaveProject: vi.fn(),
    handleExportProject: vi.fn(),
    handleSimulationContextChange: vi.fn(),
    setSelectedTargetPath: vi.fn(),
    handleOpenScaleUpEditor: vi.fn(),
    handleScaleUpContentChange: vi.fn(),
    handleCloseScaleUpEditor: vi.fn(),
    pendingExportOverwriteDecision: null,
    confirmUnsavedSaveAndContinue: vi.fn(),
    confirmUnsavedDiscardAndContinue: vi.fn(),
    cancelUnsavedChangeDecision: vi.fn(),
    confirmExportOverwrite: vi.fn(),
    cancelExportOverwrite: vi.fn(),
  }
}

describe('WorkbenchModPreviewRuntime', () => {
  beforeEach(() => {
    useModWorkspaceMock.mockReset()
    useModWorkspaceMock.mockImplementation(createModWorkspaceMock)
  })

  it('publishes a stable unsaved guard even when the mod workspace returns a new decision callback per render', async () => {
    const guardUpdates: Array<ModWorkspaceGuardHandle | null> = []
    const workspaceLayoutRef = createRef<WorkspaceLayoutHandle | null>()
    const onModI18nSourceLocaleChange = vi.fn()
    const onModI18nTargetLocaleChange = vi.fn()
    const onModI18nQueryChange = vi.fn()
    const onModI18nStatusFilterChange = vi.fn()
    const onGuardHandleChange = (update: Parameters<Dispatch<SetStateAction<ModWorkspaceGuardHandle | null>>>[0]) => {
      const previous = guardUpdates.at(-1) ?? null
      guardUpdates.push(typeof update === 'function' ? update(previous) : update)
    }
    const onStatusSnapshotChange = vi.fn()
    const onPersistStateChange = vi.fn()
    const onLayoutMetaChange = vi.fn()

    const { rerender } = render(
      <WorkbenchModPreviewRuntime
        copy={{} as never}
        locale="en-US"
        theme="light"
        accentColor="#2278f2"
        workspaceMode="mod-browser"
        directoryInfo={null}
        heavyWorkspaceReady
        workspaceLayoutRef={workspaceLayoutRef}
        workspaceLayoutStorageKey="mod-browser"
        workspaceLayouts={{}}
        modI18nSourceLocale="default"
        modI18nTargetLocale="zh-CN"
        modI18nQuery=""
        modI18nStatusFilter="all"
        onModI18nSourceLocaleChange={onModI18nSourceLocaleChange}
        onModI18nTargetLocaleChange={onModI18nTargetLocaleChange}
        onModI18nQueryChange={onModI18nQueryChange}
        onModI18nStatusFilterChange={onModI18nStatusFilterChange}
        onGuardHandleChange={onGuardHandleChange}
        onStatusSnapshotChange={onStatusSnapshotChange}
        onPersistStateChange={onPersistStateChange}
        onLayoutMetaChange={onLayoutMetaChange}
      />,
    )

    await waitFor(() => {
      expect(guardUpdates).toHaveLength(1)
    })

    const firstGuard = guardUpdates[0]

    rerender(
      <WorkbenchModPreviewRuntime
        copy={{} as never}
        locale="en-US"
        theme="light"
        accentColor="#2278f2"
        workspaceMode="mod-browser"
        directoryInfo={null}
        heavyWorkspaceReady
        workspaceLayoutRef={workspaceLayoutRef}
        workspaceLayoutStorageKey="mod-browser"
        workspaceLayouts={{}}
        modI18nSourceLocale="default"
        modI18nTargetLocale="zh-CN"
        modI18nQuery=""
        modI18nStatusFilter="all"
        onModI18nSourceLocaleChange={onModI18nSourceLocaleChange}
        onModI18nTargetLocaleChange={onModI18nTargetLocaleChange}
        onModI18nQueryChange={onModI18nQueryChange}
        onModI18nStatusFilterChange={onModI18nStatusFilterChange}
        onGuardHandleChange={onGuardHandleChange}
        onStatusSnapshotChange={onStatusSnapshotChange}
        onPersistStateChange={onPersistStateChange}
        onLayoutMetaChange={onLayoutMetaChange}
      />,
    )

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(useModWorkspaceMock).toHaveBeenCalledTimes(2)
    expect(useModWorkspaceMock).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'mod', defaultI18nOnly: false }))
    expect(guardUpdates).toEqual([firstGuard])
  })
})
