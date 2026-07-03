import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import WorkbenchExperience from './WorkbenchExperience'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LocaleProvider } from '@locales/provider'
import type { AppEvent, WorkbenchViewRegistration } from '@shared/contracts'
import type { CpMakerDraft } from '@shared/contracts'
import type { ModWorkspaceGuardHandle } from './WorkbenchModPreviewRuntime'
import { validateGameDirectory } from '@entities/game/api'

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
      loadDraft: loadDraftSpy,
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

vi.mock('./WorkbenchPreviewRuntime', () => ({
  WorkbenchPreviewRuntime: ({ workspaceMode }: { workspaceMode: string }) => (
    <div>{workspaceMode === 'map' ? 'Viewport' : `${workspaceMode} preview`}</div>
  ),
}))

vi.mock('./WorkbenchMapPreviewRuntime', () => ({
  WorkbenchMapPreviewRuntime: (props: { active: boolean; visible: boolean }) => {
    mapRuntimeRenderSpy({
      active: props.active,
      visible: props.visible,
    })
    return props.visible ? <div>Viewport</div> : null
  },
}))

vi.mock('./WorkbenchModPreviewRuntime', async () => {
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
          requestUnsavedChangeDecision: async () => {
            modPreviewState.requested = true
            modPreviewState.pending = true
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

function renderExperience({
  onWorkbenchEvent = vi.fn(),
  workbenchActivationKey,
  workbenchViews,
}: {
  onWorkbenchEvent?: (event: AppEvent) => void
  workbenchActivationKey?: number
  workbenchViews?: readonly WorkbenchViewRegistration[]
} = {}) {
  const registeredViews = workbenchViews ?? []

  return renderWithLocale(
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
    />,
  )
}

describe('WorkbenchExperience launchpad navigation', () => {
  beforeEach(() => {
    useCpMakerState.activeDraft = null
    useCpMakerState.drafts = []
    modPreviewState.dirty = false
    modPreviewState.pending = false
    modPreviewState.requested = false
    loadDraftSpy.mockClear()
    mapRuntimeRenderSpy.mockClear()
    applyAppUiStatePatchSpy.mockClear()
    validateGameDirectoryMock.mockReset()
  })

  it('opens the launchpad by default without restoring the previous workspace page', () => {
    renderExperience()

    expect(screen.getByRole('dialog', { name: 'Workbench Navigation' })).toBeTruthy()
    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('opens initialization while no game directory is available', () => {
    renderExperience()

    expect(screen.getByRole('dialog', { name: 'Workbench Navigation' })).toBeTruthy()
    expect(screen.getAllByText('Game directory').length).toBeGreaterThan(0)
  })

  it('mounts the map resource runtime at the workbench level before the map page is visible', () => {
    renderExperience()

    expect(mapRuntimeRenderSpy).toHaveBeenCalledWith({ active: true, visible: false })
    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('keeps home active instead of project manager while the launchpad is open', () => {
    renderExperience()

    const home = screen.getByRole('button', { name: 'Home' })
    const projectManager = screen.getByRole('button', { name: 'Project Manager' })

    expect(home).toHaveAttribute('aria-current', 'page')
    expect(home).toHaveClass('workbench-dock-item-active')
    expect(projectManager).not.toHaveAttribute('aria-current')
    expect(projectManager).not.toHaveClass('workbench-dock-item-active')
  })

  it('opens root browse pages in preview mode from the launchpad', async () => {
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Browser' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Workbench Navigation' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
    expect(screen.queryByText('studio-desk')).toBeNull()
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
    expect(screen.queryByRole('dialog', { name: 'Workbench Navigation' })).toBeNull()
  })

  it('guards game directory validation before committing a new root while mod preview has unsaved edits', async () => {
    modPreviewState.dirty = true
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Translation Browser' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Workbench Navigation' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.change(screen.getByPlaceholderText('Select the Stardew Valley install folder'), {
      target: { value: '/tmp/Stardew Valley' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Scan and Load Resources' }))

    await waitFor(() => {
      expect(modPreviewState.requested).toBe(true)
    })
    expect(validateGameDirectoryMock).not.toHaveBeenCalled()
  })

  it('forces close on a repeated close request after the unsaved guard is already pending', async () => {
    modPreviewState.dirty = true
    const onCloseWindow = vi.fn()
    let closeHandler: () => void = () => {
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

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Workbench Navigation' })).getByRole('button', { name: 'Translation Browser' }),
    )

    await waitFor(() => {
      expect(screen.getByText('Mods preview')).toBeTruthy()
    })

    closeHandler()

    await waitFor(() => {
      expect(modPreviewState.requested).toBe(true)
    })
    expect(onCloseWindow).not.toHaveBeenCalled()

    closeHandler()

    expect(onCloseWindow).toHaveBeenCalledTimes(1)
  })

  it('keeps the project page locked while no project is active', () => {
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })
    expect(within(dialog).getByRole('button', { name: 'Project Page' })).toBeDisabled()
  })

  it('opens the StudioDesk main surface from the launchpad project page when a project is active', () => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    renderExperience()

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Workbench Navigation' })).getByRole('button', { name: 'Map Browser' }))
    expect(screen.getByText('Viewport')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Workbench Navigation' })).getByRole('button', { name: 'Project Page' }))

    expect(screen.getByText('studio-desk')).toBeTruthy()
  })

  it('keeps launchpad making entries locked when no project is active', () => {
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })

    expect(within(dialog).getByRole('button', { name: 'Project Page' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Map Making' })).toBeDisabled()
  })

  it('loads a selected project before entering making pages', () => {
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

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Making' }))

    expect(loadDraftSpy).not.toHaveBeenCalled()
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

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Browser' }))

    expect(applyAppUiStatePatchSpy).not.toHaveBeenCalledWith({
      workspace: {
        workspaceViewMode: 'preview',
      },
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

    const dialog = screen.getByRole('dialog', { name: 'Workbench Navigation' })
    fireEvent.click(within(dialog).getByRole('button', { name: '资源浏览器' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Workbench Navigation' })).toBeNull()
    })
    expect(screen.getByText('Resource Browser Lab')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Project Manager' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Project Manager' })).not.toHaveClass('workbench-dock-item-active')
    expect(screen.getByRole('button', { name: '资源浏览器' })).toHaveAttribute('aria-current', 'page')
  })
})
