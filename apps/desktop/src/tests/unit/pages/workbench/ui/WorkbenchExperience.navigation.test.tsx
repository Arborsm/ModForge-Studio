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
import { editorCopy, getModWorkspaceCopy, getViewMenuCopy } from '@locales/api'

const applyAppUiStatePatchSpy = vi.hoisted(() => vi.fn((_patch: unknown) => Promise.resolve()))
const getAppUiStateSnapshotSpy = vi.hoisted(() => vi.fn())
const navCopy = editorCopy['en-US'].workbenchNavigation
const viewMenuCopy = getViewMenuCopy('en-US')

vi.mock('@shared/lib/app-state', async () => {
  const actual = await vi.importActual<typeof import('@shared/lib/app-state')>('@shared/lib/app-state')
  return {
    ...actual,
    getAppUiStateSnapshot: getAppUiStateSnapshotSpy,
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
const clearActiveDraftSpy = vi.fn()
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
      clearActiveDraft: clearActiveDraftSpy,
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
    category: 'dev',
    activation: { kind: 'component' },
    component: () => <div>{title}</div>,
  }
}

function toolWorkspaceRegistration(
  viewId: 'mod-browser' | 'mod-i18n',
  title: string,
  order: number,
  presentation: 'browser' | 'authoring' = 'browser',
): WorkbenchViewRegistration {
  return {
    id: viewId,
    kind: 'workbench-view',
    viewId,
    title,
    order,
    category: 'tool',
    activation: { kind: 'workspace', workspaceMode: viewId, presentation },
  }
}

function i18nGeneratorRegistration(): WorkbenchViewRegistration {
  return {
    ...viewRegistration('i18n-generator'),
    category: 'tool',
    order: 120,
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
  appUiStateReady?: boolean
}

function renderExperienceElement({
  onWorkbenchEvent = vi.fn(),
  workbenchActivationKey,
  workbenchViews,
  appUiStateReady = true,
}: RenderExperienceOptions = {}) {
  const registeredViews = workbenchViews ?? []

  return (
    <WorkbenchExperience
      pendingWorkbenchIntent={null}
      onClearPendingIntent={vi.fn()}
      active
      appUiStateReady={appUiStateReady}
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

function getSideNav() {
  return screen.getByRole('navigation', { name: navCopy.shellNavLabel })
}

function openModsBrowserTool() {
  fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup }))
  fireEvent.click(within(getSideNav()).getByRole('button', { name: new RegExp(getModWorkspaceCopy('en-US').workspaceLabel, 'i') }))
}

describe('WorkbenchExperience shell navigation', () => {
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
    clearActiveDraftSpy.mockClear()
    mapRuntimeRenderSpy.mockClear()
    applyAppUiStatePatchSpy.mockClear()
    getAppUiStateSnapshotSpy.mockReset()
    getAppUiStateSnapshotSpy.mockReturnValue({
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
    })
    validateGameDirectoryMock.mockReset()
  })

  it('opens the home shell by default without restoring the previous workspace page', () => {
    renderExperience()

    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('starts with the workbench side navigation collapsed', () => {
    renderExperience()

    const sideNav = getSideNav()
    expect(sideNav).toHaveAttribute('data-collapsed', 'true')
    expect(within(sideNav).getByRole('button', { name: navCopy.shellNavExpand })).toBeTruthy()
  })

  it('hydrates the saved side navigation sections and page after app UI state becomes ready', async () => {
    const restoredView = viewRegistration('restored-tool')
    const { rerender } = renderExperience({ appUiStateReady: false, workbenchViews: [restoredView] })

    expect(getSideNav()).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()

    getAppUiStateSnapshotSpy.mockReturnValue({
      workspace: {
        workspaceViewMode: 'edit',
        layouts: {},
        cpMaker: { activeGeneratedDraftKey: null },
        lastLocation: {
          workbenchRoute: 'workspace',
          workspaceMode: 'items',
          workspaceViewMode: 'edit',
          registeredWorkbenchViewId: restoredView.viewId,
        },
        sideNav: {
          collapsed: false,
          browseOpen: false,
          toolsOpen: true,
          devOpen: false,
        },
      },
      appearance: {
        recentGameDirectories: [],
        playerAppearance: { profiles: [], activeProfileId: null },
      },
    })
    applyAppUiStatePatchSpy.mockClear()

    rerender(
      <LocaleProvider locale="en-US">{renderExperienceElement({ appUiStateReady: true, workbenchViews: [restoredView] })}</LocaleProvider>,
    )

    await waitFor(() => {
      expect(getSideNav()).toHaveAttribute('data-collapsed', 'false')
      expect(screen.getAllByText('restored-tool')).toHaveLength(2)
    })
    expect(within(getSideNav()).getByRole('button', { name: navCopy.shellNavBrowseGroup })).toHaveAttribute('aria-expanded', 'false')
    expect(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup })).toHaveAttribute('aria-expanded', 'true')
    expect(
      applyAppUiStatePatchSpy.mock.calls.some(([patch]) => {
        const workspace = (patch as { workspace?: Record<string, unknown> }).workspace
        return Boolean(workspace?.sideNav || workspace?.lastLocation)
      }),
    ).toBe(false)

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavBrowseGroup }))
    await waitFor(() => {
      expect(
        applyAppUiStatePatchSpy.mock.calls.some(
          ([patch]) => (patch as { workspace?: { sideNav?: { browseOpen?: boolean } } }).workspace?.sideNav?.browseOpen === true,
        ),
      ).toBe(true)
    })

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Home' }))
    await waitFor(() => {
      expect(
        applyAppUiStatePatchSpy.mock.calls.some(
          ([patch]) =>
            (patch as { workspace?: { lastLocation?: { workbenchRoute?: string } } }).workspace?.lastLocation?.workbenchRoute === 'home',
        ),
      ).toBe(true)
    })
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

  it('keeps home active in the side navigation while the home page is open', () => {
    renderExperience()

    const sideNav = getSideNav()
    const home = within(sideNav).getByRole('button', { name: 'Home' })

    expect(home).toHaveAttribute('aria-current', 'page')
    expect(home.className).toContain('is-current')
    expect(screen.getByRole('region', { name: 'Workbench Home' }).getAttribute('data-content')).toBe('none')
  })

  it('renders the project title menu and keeps history controls in the expanded side navigation', () => {
    renderExperience()

    expect(screen.getByRole('button', { name: new RegExp(navCopy.shellProjectTitleEmpty, 'i') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: navCopy.shellHistoryBack })).toBeNull()
    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavExpand }))
    expect(screen.getByRole('button', { name: navCopy.shellHistoryBack })).toBeDisabled()
    expect(screen.getByRole('button', { name: navCopy.shellHistoryForward })).toBeDisabled()
    expect(screen.getByRole('button', { name: viewMenuCopy.resetLabel })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: navCopy.recentPages })).toBeNull()
  })

  it('opens root browse pages in preview mode from the no-project home browse links', async () => {
    renderExperience()
    await configureGameDirectory()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(home).getByRole('button', { name: navCopy.rootModeLabels.map }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
  })

  it('opens root browse pages from the side navigation and enables history back', async () => {
    renderExperience()
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavExpand }))
    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
    expect(screen.getByRole('button', { name: navCopy.shellHistoryBack })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: navCopy.shellHistoryBack }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
    })
  })

  it('keeps home open when the global shortcut is pressed there', () => {
    renderExperience()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
  })

  it('closes the home page when switching back to launcher mode', () => {
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

  it('guards root navigation while the Mods browser tool has unsaved edits', async () => {
    modPreviewState.dirty = true
    renderExperience({ workbenchViews: [toolWorkspaceRegistration('mod-browser', 'Mods', 100)] })
    openModsBrowserTool()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(modPreviewState.requested).toBe(true)
    })
    expect(validateGameDirectoryMock).not.toHaveBeenCalled()
  })

  it('keeps native close requests blocked while an unsaved guard decision is pending', async () => {
    modPreviewState.dirty = true
    const onCloseWindow = vi.fn(async () => true)
    let closeHandler: () => boolean | Promise<boolean> = () => {
      throw new Error('Window close handler was not registered.')
    }

    const toolViews = [toolWorkspaceRegistration('mod-browser', 'Mods', 100)]
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
        getWorkbenchViewRegistration={(viewId) => toolViews.find((view) => view.viewId === viewId) ?? viewRegistration(viewId)}
        workbenchViews={toolViews}
      />,
    )
    openModsBrowserTool()

    await waitFor(() => {
      expect(closeHandler).toBeTypeOf('function')
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

    const toolViews = [toolWorkspaceRegistration('mod-browser', 'Mods', 100)]
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
        getWorkbenchViewRegistration={(viewId) => toolViews.find((view) => view.viewId === viewId) ?? viewRegistration(viewId)}
        workbenchViews={toolViews}
      />,
    )
    openModsBrowserTool()

    await waitFor(() => {
      expect(closeHandler).toBeTypeOf('function')
    })

    await expect(closeHandler()).resolves.toBe(false)
    await waitFor(() => {
      expect(modPreviewState.pendingAction).toBeTypeOf('function')
    })

    await modPreviewState.pendingAction?.()

    expect(onCloseWindow).toHaveBeenCalledTimes(1)
  })

  it('opens empty-world create actions when a project is active without content', async () => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    renderExperience()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    expect(home.getAttribute('data-content')).toBe('empty')
    fireEvent.click(within(home).getByRole('button', { name: new RegExp(`^${navCopy.shellCreateMap}`) }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
  })

  it('loads a selected project from the recent list', async () => {
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
    fireEvent.click(within(home).getByRole('button', { name: /Festival Dialogue Pack/i }))

    await waitFor(() => {
      expect(loadDraftSpy).toHaveBeenCalledWith('festival-dialogue')
    })
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
    fireEvent.click(within(home).getByRole('button', { name: /Festival Dialogue Pack/i }))

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

  it('does not persist workspace view mode while navigating shell pages', async () => {
    renderExperience()
    await configureGameDirectory()

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    fireEvent.click(within(home).getByRole('button', { name: navCopy.rootModeLabels.map }))

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

  it('opens tools and side-nav browse entries from the shell', async () => {
    renderExperience()
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
  })

  it('does not reopen the home page when a late workbench activation arrives after opening a workspace', async () => {
    const { rerender } = renderExperience({ workbenchActivationKey: 0 })
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })

    rerender(<LocaleProvider locale="en-US">{renderExperienceElement({ workbenchActivationKey: 1 })}</LocaleProvider>)

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
  })

  it('closes the current project from the project title menu', async () => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    renderExperience()

    fireEvent.click(screen.getByRole('button', { name: /Festival Dialogue Pack/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: navCopy.shellProjectMenuClose }))

    await waitFor(() => {
      expect(clearActiveDraftSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('shows the workspace toolbar and edit gate without a project', async () => {
    renderExperience()
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })

    const modeControls = screen.getByRole('group', { name: `${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}` })
    expect(within(modeControls).getByRole('button', { name: navCopy.shellBrowseMode })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(modeControls).getByRole('button', { name: navCopy.shellEditMode }))

    await waitFor(() => {
      expect(screen.getByText(navCopy.shellEditLockedTitle)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: navCopy.shellEditLockedStayBrowse }))

    await waitFor(() => {
      expect(screen.queryByText(navCopy.shellEditLockedTitle)).toBeNull()
    })
    expect(within(modeControls).getByRole('button', { name: navCopy.shellBrowseMode })).toHaveAttribute('aria-pressed', 'true')
  })

  it('omits the workspace toolbar for standalone registered tools', async () => {
    renderExperience({ workbenchViews: [i18nGeneratorRegistration()] })
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Tools' }))
    const generatorButton = within(getSideNav()).getByRole('button', { name: /i18n Generator/i })
    fireEvent.click(generatorButton)

    await waitFor(() => {
      expect(generatorButton).toHaveAttribute('aria-current', 'page')
    })
    expect(screen.queryByRole('group', { name: `${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}` })).toBeNull()
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
  })

  it('lists the Mods browser first in Tools and opens it as a tool workspace', async () => {
    renderExperience({
      workbenchViews: [
        toolWorkspaceRegistration('mod-browser', 'Mods', 100),
        toolWorkspaceRegistration('mod-i18n', 'Translations', 110),
        i18nGeneratorRegistration(),
      ],
    })

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup }))
    const toolsSection = getSideNav().querySelector<HTMLElement>('[data-section="tools"]')
    const toolItems = toolsSection?.querySelectorAll<HTMLElement>('.workbench-side-nav-item')
    expect(toolItems?.[0]).toHaveTextContent(getModWorkspaceCopy('en-US').workspaceLabel)
    expect(toolItems?.[1]).toHaveTextContent('Translations')

    fireEvent.click(toolItems![0])

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
      expect(screen.getByText('Mods preview')).toBeTruthy()
      expect(toolItems![0]).toHaveAttribute('aria-current', 'page')
    })
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
    expect(screen.queryByRole('group', { name: `${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}` })).toBeNull()

    fireEvent.click(toolItems![1])

    await waitFor(() => {
      expect(toolItems![1]).toHaveAttribute('aria-current', 'page')
    })
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
    expect(screen.queryByRole('group', { name: `${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}` })).toBeNull()

    fireEvent.click(toolItems![2])

    await waitFor(() => {
      expect(toolItems![0]).not.toHaveAttribute('aria-current')
      expect(toolItems![2]).toHaveAttribute('aria-current', 'page')
    })
  })

  it('uses workspace presentation rather than navigation category to select authoring chrome', async () => {
    renderExperience({ workbenchViews: [toolWorkspaceRegistration('mod-browser', 'Mods', 100, 'authoring')] })

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup }))
    fireEvent.click(within(getSideNav()).getByRole('button', { name: /Mods/i }))

    await waitFor(() => expect(document.querySelector('.workbench-ws-toolbar')).toBeTruthy())
    expect(screen.getByRole('group', { name: `${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}` })).toBeTruthy()
  })

  it('marks a restored workspace tool as selected in the side navigation', async () => {
    getAppUiStateSnapshotSpy.mockReturnValue({
      workspace: {
        workspaceViewMode: 'preview',
        layouts: {},
        cpMaker: { activeGeneratedDraftKey: null },
        lastLocation: {
          workbenchRoute: 'workspace',
          workspaceMode: 'mod-browser',
          workspaceViewMode: 'edit',
          registeredWorkbenchViewId: null,
        },
        sideNav: { collapsed: false, browseOpen: true, toolsOpen: true, devOpen: false },
      },
      appearance: {
        recentGameDirectories: [],
        playerAppearance: { profiles: [], activeProfileId: null },
      },
    })

    renderExperience({ workbenchViews: [toolWorkspaceRegistration('mod-browser', 'Mods', 100)] })

    const modsButton = within(getSideNav()).getByRole('button', { name: new RegExp(getModWorkspaceCopy('en-US').workspaceLabel, 'i') })
    await waitFor(() => expect(modsButton).toHaveAttribute('aria-current', 'page'))
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
    expect(screen.queryByText(navCopy.shellEditLockedTitle)).toBeNull()
  })

  it('allows edit mode when a project is active without showing the gate', async () => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    renderExperience()
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: navCopy.shellEditMode }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: navCopy.shellEditMode })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.queryByText(navCopy.shellEditLockedTitle)).toBeNull()
  })
})
