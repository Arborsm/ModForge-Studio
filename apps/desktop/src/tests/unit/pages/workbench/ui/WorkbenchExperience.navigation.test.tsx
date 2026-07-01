import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import WorkbenchExperience from '@pages/workbench/ui/WorkbenchExperience'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LocaleProvider } from '@locales/provider'
import type { AppEvent, WorkbenchViewRegistration } from '@shared/contracts'
import type { CpMakerDraft } from '@features/cp-maker'
import type { ModWorkspaceGuardHandle } from '@pages/workbench/ui/WorkbenchModPreviewRuntime'
import { validateGameDirectory } from '@entities/game/api'
import type { GameDirectoryInfo } from '@entities/game/api'

const applyAppUiStatePatchSpy = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@shared/lib/app-state', async () => {
  const actual = await vi.importActual<typeof import('@shared/lib/app-state')>('@shared/lib/app-state')
  return {
    ...actual,
    getAppUiStateSnapshot: vi.fn(() => ({
      workspace: {
        workspaceViewMode: 'edit',
        layouts: {},
        cpMaker: {
          activeGeneratedDraftKey: null,
        },
      },
      appearance: {
        recentGameDirectories: [],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
      },
    })),
    applyAppUiStatePatch: applyAppUiStatePatchSpy,
  }
})

const loadDraftSpy = vi.fn()
const createDraftSpy = vi.fn()
const chooseDirectorySpy = vi.fn()
const importPackSpy = vi.fn()
const copyDraftSpy = vi.fn()
const deleteDraftSpy = vi.fn()
const updateMetadataSpy = vi.fn()
const exportPackSpy = vi.fn()
const saveDraftSpy = vi.fn()
const useCpMakerState = vi.hoisted(() => ({
  activeDraft: null as CpMakerDraft | null,
  drafts: [] as Array<{
    draftStorageKey: string
    projectName: string
    projectUniqueId: string
    lastDraftSavedAt: number | null
    lastExportedAt: number | null
  }>,
}))
const modPreviewState = vi.hoisted(() => ({
  dirty: false,
  pending: false,
  requested: false,
  pendingAction: null as (() => void | Promise<void>) | null,
}))
const mapRuntimeRenderSpy = vi.hoisted(() => vi.fn())

vi.mock('@features/cp-maker', async () => {
  const actual = await vi.importActual<typeof import('@features/cp-maker')>('@features/cp-maker')
  return {
    ...actual,
    useCpMaker: () => ({
      activeDraft: useCpMakerState.activeDraft,
      drafts: useCpMakerState.drafts,
      patchCountByWorkspace: {},
      dirtyPatchIds: new Set<string>(),
      isDirty: false,
      draftLoading: false,
      draftError: null,
      createDraft: createDraftSpy,
      loadDraft: loadDraftSpy,
      saveDraft: saveDraftSpy,
      chooseDirectory: chooseDirectorySpy,
      importPack: importPackSpy,
      copyDraft: copyDraftSpy,
      deleteDraft: deleteDraftSpy,
      updateMetadata: updateMetadataSpy,
      exportPack: exportPackSpy,
    }),
  }
})

vi.mock('@entities/game/api', () => ({
  detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
  listKnownGameDirectories: vi.fn().mockResolvedValue([]),
  scanMaps: vi.fn().mockResolvedValue([]),
  validateGameDirectory: vi.fn(),
}))

const validateGameDirectoryMock = vi.mocked(validateGameDirectory)
const validDirectoryInfo: GameDirectoryInfo = {
  rootPath: '/tmp/Stardew Valley',
  executablePath: '/tmp/Stardew Valley/Stardew Valley',
  mapsPath: '/tmp/Stardew Valley/Content/Maps',
  mapCount: 1,
}

vi.mock('@pages/workbench/ui/WorkbenchPreviewRuntime', () => ({
  WorkbenchPreviewRuntime: ({ workspaceMode }: { workspaceMode: string }) => (
    <div>{workspaceMode === 'map' ? 'Viewport' : `${workspaceMode} preview`}</div>
  ),
}))

vi.mock('@pages/workbench/ui/WorkbenchMapPreviewRuntime', () => ({
  WorkbenchMapPreviewRuntime: (props: { active: boolean; visible: boolean }) => {
    mapRuntimeRenderSpy({
      active: props.active,
      visible: props.visible,
    })
    return props.visible ? <div>Viewport</div> : null
  },
}))

vi.mock('@pages/workbench/ui/WorkbenchModPreviewRuntime', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react')
  return {
    WorkbenchModPreviewRuntime: ({
      onGuardHandleChange,
    }: {
      onGuardHandleChange: (
        update: ModWorkspaceGuardHandle | null | ((current: ModWorkspaceGuardHandle | null) => ModWorkspaceGuardHandle | null),
      ) => void
    }) => {
      useEffect(() => {
        if (!modPreviewState.dirty) {
          onGuardHandleChange(null)
          return
        }

        onGuardHandleChange({
          hasUnsavedChanges: true,
          hasPendingUnsavedDecision: modPreviewState.pending,
          requestUnsavedChangeDecision: async (action: () => void | Promise<void>) => {
            modPreviewState.requested = true
            modPreviewState.pending = true
            modPreviewState.pendingAction = action
            return false
          },
        })
      }, [onGuardHandleChange])

      return <div>Mods preview</div>
    },
  }
})

function viewRegistration(title: string): WorkbenchViewRegistration {
  return {
    id: title,
    kind: 'workbench-view',
    viewId: title,
    title,
    component: () => <div>{title}</div>,
  }
}

function draft(draftStorageKey: string): CpMakerDraft {
  return {
    draftStorageKey,
    projectMetadata: {
      projectName: 'Festival Dialogue Pack',
      projectDescription: '',
      projectAuthor: 'Arbor',
      projectVersion: '1.0.0',
      projectUniqueId: 'Author.FestivalDialogue',
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
  }
}

type RenderExperienceOptions = {
  onWorkbenchEvent?: (event: AppEvent) => void
  workbenchActivationKey?: number
  workbenchViews?: readonly WorkbenchViewRegistration[]
}

function renderExperienceElement({ onWorkbenchEvent = vi.fn(), workbenchActivationKey, workbenchViews }: RenderExperienceOptions = {}) {
  const registeredViews = workbenchViews ?? []

  return (
    <WorkbenchExperience
      pendingWorkbenchIntent={null}
      onClearPendingIntent={vi.fn()}
      active
      appUiStateReady
      theme="light"
      locale="en-US"
      accentColor="#2278f2"
      desktopHost={false}
      onToggleTheme={vi.fn()}
      onSwitchToLauncher={vi.fn()}
      onOpenSettings={vi.fn()}
      onMinimizeWindow={vi.fn()}
      onToggleMaximizeWindow={vi.fn()}
      onCloseWindow={vi.fn()}
      onWorkbenchEvent={onWorkbenchEvent}
      getWorkbenchViewRegistration={(viewId) => registeredViews.find((view) => view.viewId === viewId) ?? viewRegistration(viewId)}
      workbenchViews={workbenchViews}
      workbenchActivationKey={workbenchActivationKey}
    />
  )
}

function renderExperience(options: RenderExperienceOptions = {}) {
  return renderWithLocale(renderExperienceElement(options))
}

async function configureGameDirectory() {
  validateGameDirectoryMock.mockResolvedValue(validDirectoryInfo)

  fireEvent.click(screen.getByRole('button', { name: 'Configure' }))
  fireEvent.change(screen.getByPlaceholderText('Select the Stardew Valley install folder'), {
    target: { value: validDirectoryInfo.rootPath },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Scan and Load Resources' }))

  await waitFor(() => {
    expect(validateGameDirectoryMock).toHaveBeenCalledWith(validDirectoryInfo.rootPath)
  })
  await waitFor(() => {
    expect(screen.queryByText('Game directory not configured')).toBeNull()
  })
}

function getDock() {
  return screen.getByRole('navigation', { name: 'Recent pages' })
}

describe('WorkbenchExperience launchpad navigation', () => {
  beforeEach(() => {
    useCpMakerState.activeDraft = null
    useCpMakerState.drafts = []
    modPreviewState.dirty = false
    modPreviewState.pending = false
    modPreviewState.requested = false
    modPreviewState.pendingAction = null
    loadDraftSpy.mockClear()
    createDraftSpy.mockClear()
    chooseDirectorySpy.mockClear()
    importPackSpy.mockClear()
    copyDraftSpy.mockClear()
    deleteDraftSpy.mockClear()
    updateMetadataSpy.mockClear()
    exportPackSpy.mockClear()
    saveDraftSpy.mockClear()
    mapRuntimeRenderSpy.mockClear()
    applyAppUiStatePatchSpy.mockClear()
    validateGameDirectoryMock.mockReset()
  })

  it('opens the launchpad by default without restoring the previous workspace page', () => {
    renderExperience()

    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('opens initialization while no game directory is available', () => {
    renderExperience()

    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
    expect(screen.getByText('Game directory not configured')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Configure' }))

    expect(screen.getAllByText('Game directory').length).toBeGreaterThan(0)
  })

  it('mounts the map resource runtime at the workbench level before the map page is visible', () => {
    renderExperience()

    expect(mapRuntimeRenderSpy).toHaveBeenCalledWith({ active: true, visible: false })
    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('keeps home active in the titlebar dock while the launchpad is open', () => {
    renderExperience()

    const dock = getDock()
    const home = within(dock).getByRole('button', { name: 'Home' })

    expect(home).toHaveAttribute('aria-current', 'page')
    expect(home).toHaveClass('workbench-dock-item-active')
    expect(within(dock).queryByRole('button', { name: 'Project Library' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Workbench Home' })).getByRole('region', { name: 'Project Library' })).toBeTruthy()
  })

  it('opens root browse pages in preview mode from the launchpad', async () => {
    renderExperience()
    await configureGameDirectory()

    const dialog = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Maps' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
    expect(screen.queryByText('studio-desk')).toBeNull()
  })

  it('keeps command search on the home page when the global shortcut is pressed there', () => {
    renderExperience()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
    expect(screen.getByRole('listbox', { name: 'Search results' })).toBeTruthy()
  })

  it('closes the launchpad when switching back to launcher mode', () => {
    const onSwitchToLauncher = vi.fn()

    renderWithLocale(
      <WorkbenchExperience
        pendingWorkbenchIntent={null}
        onClearPendingIntent={vi.fn()}
        active
        appUiStateReady
        theme="light"
        locale="en-US"
        accentColor="#2278f2"
        desktopHost={false}
        onToggleTheme={vi.fn()}
        onSwitchToLauncher={onSwitchToLauncher}
        onOpenSettings={vi.fn()}
        onMinimizeWindow={vi.fn()}
        onToggleMaximizeWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onWorkbenchEvent={vi.fn()}
        getWorkbenchViewRegistration={(viewId) => viewRegistration(viewId)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Launcher' }))

    expect(onSwitchToLauncher).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
  })

  it('guards game directory validation before committing a new root while mod preview has unsaved edits', async () => {
    modPreviewState.dirty = true
    renderExperience()
    await configureGameDirectory()

    const dialog = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Translations' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.change(screen.getByPlaceholderText('Select the Stardew Valley install folder'), {
      target: { value: '/tmp/Stardew Valley' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Scan and Load Resources' }))

    await waitFor(() => {
      expect(modPreviewState.requested).toBe(true)
    })
    expect(validateGameDirectoryMock).toHaveBeenCalledTimes(1)
  })

  it('keeps native close requests blocked while an unsaved guard decision is pending', async () => {
    modPreviewState.dirty = true
    const onCloseWindow = vi.fn(async () => true)
    let closeHandler: () => boolean | Promise<boolean> = () => {
      throw new Error('Window close handler was not registered.')
    }

    renderWithLocale(
      <WorkbenchExperience
        pendingWorkbenchIntent={null}
        onClearPendingIntent={vi.fn()}
        active
        appUiStateReady
        theme="light"
        locale="en-US"
        accentColor="#2278f2"
        desktopHost={false}
        onToggleTheme={vi.fn()}
        onSwitchToLauncher={vi.fn()}
        onOpenSettings={vi.fn()}
        onMinimizeWindow={vi.fn()}
        onToggleMaximizeWindow={vi.fn()}
        onCloseWindow={onCloseWindow}
        onWindowCloseRequestChange={(handler) => {
          closeHandler =
            handler ??
            (() => {
              throw new Error('Window close handler was cleared.')
            })
        }}
        onWorkbenchEvent={vi.fn()}
        getWorkbenchViewRegistration={(viewId) => viewRegistration(viewId)}
      />,
    )

    await waitFor(() => {
      expect(closeHandler).toBeTypeOf('function')
    })

    await configureGameDirectory()

    fireEvent.click(within(screen.getByRole('region', { name: 'Workbench Home' })).getByRole('button', { name: 'Translations' }))

    await waitFor(() => {
      expect(screen.getByText('Mods preview')).toBeTruthy()
    })

    await expect(closeHandler()).resolves.toBe(false)

    await waitFor(() => {
      expect(modPreviewState.requested).toBe(true)
    })
    expect(onCloseWindow).not.toHaveBeenCalled()

    await expect(closeHandler()).resolves.toBe(false)

    expect(onCloseWindow).not.toHaveBeenCalled()
  })

  it('continues the guarded close after an unsaved decision is confirmed', async () => {
    modPreviewState.dirty = true
    const onCloseWindow = vi.fn(async () => true)
    let closeHandler: () => boolean | Promise<boolean> = () => {
      throw new Error('Window close handler was not registered.')
    }

    renderWithLocale(
      <WorkbenchExperience
        pendingWorkbenchIntent={null}
        onClearPendingIntent={vi.fn()}
        active
        appUiStateReady
        theme="light"
        locale="en-US"
        accentColor="#2278f2"
        desktopHost={false}
        onToggleTheme={vi.fn()}
        onSwitchToLauncher={vi.fn()}
        onOpenSettings={vi.fn()}
        onMinimizeWindow={vi.fn()}
        onToggleMaximizeWindow={vi.fn()}
        onCloseWindow={onCloseWindow}
        onWindowCloseRequestChange={(handler) => {
          closeHandler =
            handler ??
            (() => {
              throw new Error('Window close handler was cleared.')
            })
        }}
        onWorkbenchEvent={vi.fn()}
        getWorkbenchViewRegistration={(viewId) => viewRegistration(viewId)}
      />,
    )

    await waitFor(() => {
      expect(closeHandler).toBeTypeOf('function')
    })

    await configureGameDirectory()

    fireEvent.click(within(screen.getByRole('region', { name: 'Workbench Home' })).getByRole('button', { name: 'Translations' }))

    await waitFor(() => {
      expect(screen.getByText('Mods preview')).toBeTruthy()
    })

    await expect(closeHandler()).resolves.toBe(false)
    await waitFor(() => {
      expect(modPreviewState.pendingAction).toBeTypeOf('function')
    })

    await modPreviewState.pendingAction?.()

    expect(onCloseWindow).toHaveBeenCalledTimes(1)
  })

  it('focuses the project library instead of disabling maker entries when no project is active', () => {
    renderExperience()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    const make = within(home).getByRole('button', { name: 'Map Making' })

    expect(make).not.toBeDisabled()
    fireEvent.click(make)

    expect(within(home).getByRole('region', { name: 'Project Library' }).className).toContain('is-focus')
    expect(screen.getByRole('dialog', { name: 'Create New Project' })).toBeTruthy()
  })

  it('opens project making workspaces directly when a project is active', async () => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    renderExperience()

    fireEvent.click(within(screen.getByRole('region', { name: 'Workbench Home' })).getByRole('button', { name: 'Map Making' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
  })

  it('keeps maker entries available when no project is active', () => {
    renderExperience()

    const home = screen.getByRole('region', { name: 'Workbench Home' })

    expect(within(home).queryByRole('button', { name: 'Project Page' })).toBeNull()
    expect(within(home).getByRole('button', { name: 'Map Making' })).not.toBeDisabled()
  })

  it('loads a selected project before entering pending making pages', async () => {
    useCpMakerState.drafts = [
      {
        draftStorageKey: 'festival-dialogue',
        projectName: 'Festival Dialogue Pack',
        projectUniqueId: 'Author.FestivalDialogue',
        lastDraftSavedAt: null,
        lastExportedAt: null,
      },
    ]
    renderExperience()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Map Making' }))
    const library = within(home).getByRole('region', { name: 'Project Library' })
    expect(library.className).toContain('is-focus')
    fireEvent.click(within(library).getByRole('button', { name: 'Open Project Festival Dialogue Pack' }))

    await waitFor(() => {
      expect(loadDraftSpy).toHaveBeenCalledWith('festival-dialogue')
    })
  })

  it('focuses the in-page project library from the home action', () => {
    useCpMakerState.drafts = [
      {
        draftStorageKey: 'festival-dialogue',
        projectName: 'Festival Dialogue Pack',
        projectUniqueId: 'Author.FestivalDialogue',
        lastDraftSavedAt: null,
        lastExportedAt: null,
      },
    ]
    renderExperience()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Open Project Library' }))

    const library = within(home).getByRole('region', { name: 'Project Library' })
    expect(library.className).toContain('is-focus')
    expect(within(library).getByRole('button', { name: 'Open Project Festival Dialogue Pack' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Project Library' })).toBeNull()
  })

  it('keeps the home page open when selecting a project without a pending maker intent', async () => {
    useCpMakerState.drafts = [
      {
        draftStorageKey: 'festival-dialogue',
        projectName: 'Festival Dialogue Pack',
        projectUniqueId: 'Author.FestivalDialogue',
        lastDraftSavedAt: null,
        lastExportedAt: null,
      },
    ]
    renderExperience()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Open Project Festival Dialogue Pack' }))

    await waitFor(() => {
      expect(loadDraftSpy).toHaveBeenCalledWith('festival-dialogue')
    })
    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
  })

  it('does not reselect the same draft when patch edits replace the active draft object', async () => {
    const onWorkbenchEvent = vi.fn()
    useCpMakerState.activeDraft = draft('festival-dialogue')
    const { rerender } = renderExperience({ onWorkbenchEvent })

    await waitFor(() => {
      expect(onWorkbenchEvent).toHaveBeenCalledTimes(1)
    })
    expect(onWorkbenchEvent).toHaveBeenLastCalledWith({
      type: 'cp-maker/draft-selected',
      draftKey: 'festival-dialogue',
    })

    useCpMakerState.activeDraft = {
      ...draft('festival-dialogue'),
      patches: [
        {
          id: 'patch-town',
          workspace: 'events',
          target: 'Data/Events/Town',
          action: 'EditData',
          logName: 'Town events',
          enabled: true,
          editorState: { entries: { intro: 'spring/Farmer 0 0' } },
        },
      ],
    }

    rerender(
      <LocaleProvider locale="en-US">
        <WorkbenchExperience
          pendingWorkbenchIntent={null}
          onClearPendingIntent={vi.fn()}
          active
          appUiStateReady
          theme="light"
          locale="en-US"
          accentColor="#2278f2"
          desktopHost={false}
          onToggleTheme={vi.fn()}
          onSwitchToLauncher={vi.fn()}
          onOpenSettings={vi.fn()}
          onMinimizeWindow={vi.fn()}
          onToggleMaximizeWindow={vi.fn()}
          onCloseWindow={vi.fn()}
          onWorkbenchEvent={onWorkbenchEvent}
          getWorkbenchViewRegistration={(viewId) => viewRegistration(viewId)}
        />
      </LocaleProvider>,
    )

    expect(onWorkbenchEvent).toHaveBeenCalledTimes(1)
  })

  it('does not persist workspace view mode while navigating launchpad pages', () => {
    renderExperience()

    const dialog = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Maps' }))

    expect(applyAppUiStatePatchSpy).not.toHaveBeenCalledWith({
      workspace: {
        workspaceViewMode: 'preview',
      },
    })
  })

  it('does not patch recent game directories again when the same directory list rerenders', async () => {
    const { rerender } = renderExperience()
    await configureGameDirectory()

    applyAppUiStatePatchSpy.mockClear()

    rerender(<LocaleProvider locale="en-US">{renderExperienceElement()}</LocaleProvider>)
    rerender(<LocaleProvider locale="en-US">{renderExperienceElement()}</LocaleProvider>)

    await waitFor(() => {
      expect(applyAppUiStatePatchSpy).not.toHaveBeenCalled()
    })
  })

  it('opens dev-only registered workbench views from the launchpad', async () => {
    renderExperience({
      workbenchViews: [
        {
          id: 'dev-resource-browser',
          kind: 'workbench-view',
          title: '资源浏览器',
          viewId: 'dev-resource-browser',
          devOnly: true,
          component: () => <div>Resource Browser Lab</div>,
        },
      ],
    })
    await configureGameDirectory()

    const dialog = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(dialog).getByRole('button', { name: '资源浏览器' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Resource Browser Lab')).toBeTruthy()
    const dock = getDock()
    expect(within(dock).queryByRole('button', { name: 'Project Library' })).toBeNull()
    expect(within(dock).getByRole('button', { name: '资源浏览器' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not reopen the launchpad when a late workbench activation arrives after opening a dev view', async () => {
    const workbenchViews: readonly WorkbenchViewRegistration[] = [
      {
        id: 'dev-resource-browser',
        kind: 'workbench-view',
        title: '资源浏览器',
        viewId: 'dev-resource-browser',
        devOnly: true,
        component: () => <div>Resource Browser Lab</div>,
      },
    ]
    const { rerender } = renderExperience({ workbenchActivationKey: 0, workbenchViews })
    await configureGameDirectory()

    fireEvent.click(within(screen.getByRole('region', { name: 'Workbench Home' })).getByRole('button', { name: '资源浏览器' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })

    rerender(<LocaleProvider locale="en-US">{renderExperienceElement({ workbenchActivationKey: 1, workbenchViews })}</LocaleProvider>)

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Resource Browser Lab')).toBeTruthy()
  })
})
