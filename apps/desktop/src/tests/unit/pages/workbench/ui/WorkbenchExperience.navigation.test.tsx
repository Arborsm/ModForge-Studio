import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { lazy, useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import WorkbenchExperience from '@pages/workbench/ui/WorkbenchExperience'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LocaleProvider } from '@locales/provider'
import type { AppEvent, WorkbenchModuleRegistration } from '@shared/contracts'
import type { CpMakerDraft } from '@features/cp-maker'
import { validateGameDirectory } from '@entities/game/api'
import type { GameDirectoryInfo } from '@entities/game/api'
import { editorCopy, getViewMenuCopy } from '@locales/api'
import { useWorkbenchModuleState } from '@pages/workbench/model/workbenchModuleContexts'

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
const loadSessionSpy = vi.fn(async () => ({ activeDraftKey: null, activeGeneratedDraftKey: null }))
const saveSessionSpy = vi.fn(async (session) => session)
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
  registered: false,
  pendingAction: null as (() => void | Promise<void>) | null,
}))

vi.mock('@features/cp-maker', async () => {
  const actual = await vi.importActual<typeof import('@features/cp-maker')>('@features/cp-maker')
  return {
    ...actual,
    useCpMaker: () => ({
      activeDraft: useCpMakerState.activeDraft,
      drafts: useCpMakerState.drafts,
      draftsReady: true,
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
    useCpMakerPort: () => ({ loadSession: loadSessionSpy, saveSession: saveSessionSpy }),
  }
})

vi.mock('@features/cp-maker/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/cp-maker/provider')>()
  return {
    ...actual,
    useCpMakerPort: () => ({ chooseDirectory: chooseDirectorySpy }),
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

function viewRegistration(title: string): WorkbenchModuleRegistration {
  return {
    id: title,
    navigation: { section: 'development', order: 900, icon: 'beaker', labelKey: 'dev-resource-browser' },
    presentation: 'standalone',
    projectAccess: 'none',
    layout: 'fixed',
    runtime: lazy(async () => ({ default: () => <div>{title}</div> })),
    persistenceKey: title,
  }
}

const browseRegistration = (
  id: 'map-browser' | 'event-browser' | 'character-browser' | 'building-browser' | 'item-browser',
  order: number,
  icon: WorkbenchModuleRegistration['navigation']['icon'],
): WorkbenchModuleRegistration => ({
  ...viewRegistration(id),
  navigation: { section: 'browse', order, icon, labelKey: id },
  presentation: 'browser',
  layout: 'dockable',
  runtime: lazy(async () => ({ default: () => <div>{id === 'map-browser' ? 'Viewport' : id}</div> })),
})

const defaultBrowseModules = [
  browseRegistration('map-browser', 10, 'map'),
  browseRegistration('event-browser', 20, 'events'),
  browseRegistration('character-browser', 30, 'characters'),
  browseRegistration('building-browser', 40, 'buildings'),
  browseRegistration('item-browser', 50, 'items'),
]

function toolWorkspaceRegistration(
  moduleId: 'mod-browser' | 'mod-translation',
  title: string,
  order: number,
  presentation: 'browser' | 'authoring' = 'browser',
): WorkbenchModuleRegistration {
  function ToolRuntime() {
    const moduleState = useWorkbenchModuleState()
    const onUnsavedGuardChange = moduleState.onUnsavedGuardChange
    useEffect(() => {
      if (moduleId !== 'mod-translation' || !modPreviewState.dirty) return
      modPreviewState.registered = true
      onUnsavedGuardChange({
        hasUnsavedChanges: true,
        hasPendingUnsavedDecision: modPreviewState.pending,
        requestUnsavedChangeDecision: async (action) => {
          modPreviewState.requested = true
          modPreviewState.pending = true
          modPreviewState.pendingAction = action
          return false
        },
      })
      return () => {
        modPreviewState.registered = false
        onUnsavedGuardChange(null)
      }
    }, [onUnsavedGuardChange])
    return <div>{title}</div>
  }
  return {
    id: moduleId,
    navigation: {
      section: 'tools',
      order,
      icon: moduleId === 'mod-translation' ? 'languages' : 'package',
      labelKey: moduleId,
    },
    presentation,
    projectAccess: presentation === 'browser' ? 'read' : 'write',
    layout: 'dockable',
    runtime: lazy(async () => ({ default: ToolRuntime })),
    persistenceKey: moduleId,
  }
}

function i18nGeneratorRegistration(): WorkbenchModuleRegistration {
  return {
    ...viewRegistration('i18n-generator'),
    navigation: { section: 'tools', order: 120, icon: 'languages', labelKey: 'i18n-generator' },
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
    i18nFiles: [],
  }
}

type RenderExperienceOptions = {
  onWorkbenchEvent?: (event: AppEvent) => void
  workbenchActivationKey?: number
  workbenchModules?: readonly WorkbenchModuleRegistration[]
  appUiStateReady?: boolean
}

function renderExperienceElement({
  onWorkbenchEvent = vi.fn(),
  workbenchActivationKey,
  workbenchModules,
  appUiStateReady = true,
}: RenderExperienceOptions = {}) {
  const registeredViews = [...defaultBrowseModules, ...(workbenchModules ?? [])]

  return (
    <WorkbenchExperience
      pendingWorkbenchIntent={null}
      onClearPendingIntent={vi.fn()}
      active
      appUiStateReady={appUiStateReady}
      desktopHost={false}
      onToggleTheme={vi.fn()}
      onSwitchToLauncher={vi.fn()}
      onOpenSettings={vi.fn()}
      onMinimizeWindow={vi.fn()}
      onToggleMaximizeWindow={vi.fn()}
      onCloseWindow={vi.fn()}
      onWorkbenchEvent={onWorkbenchEvent}
      getWorkbenchModuleRegistration={(moduleId) => registeredViews.find((view) => view.id === moduleId) ?? viewRegistration(moduleId)}
      workbenchModules={registeredViews}
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

function openModTranslationTool() {
  fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup }))
  fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['mod-translation'] }))
}

function fireHistoryMouseButton(target: HTMLElement, button: 3 | 4) {
  const eventName = typeof PointerEvent === 'undefined' ? 'mouseup' : 'pointerup'
  fireEvent(target, new MouseEvent(eventName, { bubbles: true, button }))
}

describe('WorkbenchExperience shell navigation', () => {
  beforeEach(() => {
    useCpMakerState.activeDraft = null
    useCpMakerState.drafts = []
    modPreviewState.dirty = false
    modPreviewState.pending = false
    modPreviewState.requested = false
    modPreviewState.pendingAction = null
    modPreviewState.registered = false
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
    applyAppUiStatePatchSpy.mockClear()
    getAppUiStateSnapshotSpy.mockReset()
    getAppUiStateSnapshotSpy.mockReturnValue({
      workspace: {
        location: { kind: 'home' },
        navigation: { collapsed: true, expandedSections: ['browse'] },
        modules: {},
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
    const restoredView = {
      ...viewRegistration('restored-tool'),
      navigation: { section: 'tools' as const, order: 100, icon: 'beaker' as const, labelKey: 'i18n-generator' as const },
    }
    const { rerender } = renderExperience({ appUiStateReady: false, workbenchModules: [restoredView] })

    expect(getSideNav()).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()

    getAppUiStateSnapshotSpy.mockReturnValue({
      workspace: {
        location: { kind: 'module', moduleId: restoredView.id },
        navigation: { collapsed: false, expandedSections: ['tools'] },
        modules: {},
      },
      appearance: {
        recentGameDirectories: [],
        playerAppearance: { profiles: [], activeProfileId: null },
      },
    })
    applyAppUiStatePatchSpy.mockClear()

    rerender(
      <LocaleProvider locale="en-US">
        {renderExperienceElement({ appUiStateReady: true, workbenchModules: [restoredView] })}
      </LocaleProvider>,
    )

    await waitFor(() => {
      expect(getSideNav()).toHaveAttribute('data-collapsed', 'false')
      expect(screen.getAllByText('restored-tool')).toHaveLength(1)
    })
    expect(within(getSideNav()).getByRole('button', { name: navCopy.shellNavBrowseGroup })).toHaveAttribute('aria-expanded', 'false')
    expect(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup })).toHaveAttribute('aria-expanded', 'true')
    expect(
      applyAppUiStatePatchSpy.mock.calls.some(([patch]) => {
        const workspace = (patch as { workspace?: Record<string, unknown> }).workspace
        return Boolean(workspace?.navigation || workspace?.location)
      }),
    ).toBe(false)

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavBrowseGroup }))
    await waitFor(() => {
      expect(
        applyAppUiStatePatchSpy.mock.calls.some(
          ([patch]) =>
            (patch as { workspace?: { navigation?: { expandedSections?: string[] } } }).workspace?.navigation?.expandedSections?.includes(
              'browse',
            ) === true,
        ),
      ).toBe(true)
    })

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.home }))
    await waitFor(() => {
      expect(
        applyAppUiStatePatchSpy.mock.calls.some(
          ([patch]) => (patch as { workspace?: { location?: { kind?: string } } }).workspace?.location?.kind === 'home',
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

  it('does not mount the map module before its registered location is active', () => {
    renderExperience()

    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('keeps home active in the side navigation while the home page is open', () => {
    renderExperience()

    const sideNav = getSideNav()
    const home = within(sideNav).getByRole('button', { name: navCopy.home })

    expect(home).toHaveAttribute('aria-current', 'page')
    expect(home.className).toContain('is-current')
    expect(screen.getByRole('region', { name: 'Workbench Home' }).getAttribute('data-content')).toBe('home')
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

  it('keeps browse navigation in the side bar and locks authoring until a project is selected', async () => {
    const authoringModule: WorkbenchModuleRegistration = {
      ...viewRegistration('map-authoring'),
      navigation: { section: 'authoring', order: 10, icon: 'map', labelKey: 'map-authoring' },
      presentation: 'authoring',
      projectAccess: 'write',
      layout: 'dockable',
    }
    renderExperience({ workbenchModules: [authoringModule] })

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    expect(within(home).queryByRole('button', { name: navCopy.rootModeLabels.map })).toBeNull()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavExpand }))
    const authoringHeader = within(getSideNav()).getByRole('button', { name: navCopy.shellNavAuthoringGroup })
    expect(authoringHeader).not.toHaveAttribute('aria-disabled')
    expect(authoringHeader).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(authoringHeader)
    expect(authoringHeader).toHaveAttribute('aria-expanded', 'true')
    const mapAuthoring = within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['map-authoring'] })
    expect(mapAuthoring).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(mapAuthoring)
    expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy()
    fireEvent.click(authoringHeader)
    expect(authoringHeader).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens root browse pages from the side navigation and enables history back', async () => {
    renderExperience()
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavExpand }))
    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['map-browser'] }))

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

  it('delegates launcher switching to the app shell', () => {
    const onSwitchToLauncher = vi.fn()

    renderWithLocale(
      <WorkbenchExperience
        pendingWorkbenchIntent={null}
        onClearPendingIntent={vi.fn()}
        active
        appUiStateReady
        desktopHost={false}
        onToggleTheme={vi.fn()}
        onSwitchToLauncher={onSwitchToLauncher}
        onOpenSettings={vi.fn()}
        onMinimizeWindow={vi.fn()}
        onToggleMaximizeWindow={vi.fn()}
        onCloseWindow={vi.fn()}
        onWorkbenchEvent={vi.fn()}
        getWorkbenchModuleRegistration={(moduleId) => viewRegistration(moduleId)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Launcher' }))

    expect(onSwitchToLauncher).toHaveBeenCalledTimes(1)
  })

  it('guards root navigation while disk translations have unsaved edits', async () => {
    modPreviewState.dirty = true
    renderExperience({ workbenchModules: [toolWorkspaceRegistration('mod-translation', 'Translations', 110)] })
    openModTranslationTool()
    await waitFor(() => expect(screen.getByText('Translations')).toBeTruthy())
    await waitFor(() => expect(modPreviewState.registered).toBe(true))

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['map-browser'] }))

    await waitFor(() => {
      expect(modPreviewState.requested).toBe(true)
    })
    expect(validateGameDirectoryMock).not.toHaveBeenCalled()
  })

  it('commits history back only after the disk translation guard continues', async () => {
    modPreviewState.dirty = true
    renderExperience({ workbenchModules: [toolWorkspaceRegistration('mod-translation', 'Translations', 110)] })
    openModTranslationTool()
    await waitFor(() => expect(screen.getByText('Translations')).toBeTruthy())
    await waitFor(() => expect(modPreviewState.registered).toBe(true))
    const shellRoot = screen.getByText('Translations').closest('[aria-busy]') as HTMLElement

    fireHistoryMouseButton(shellRoot, 3)
    await waitFor(() => expect(modPreviewState.pendingAction).toBeTypeOf('function'))
    expect(screen.getByText('Translations')).toBeTruthy()

    await modPreviewState.pendingAction?.()
    await waitFor(() => expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy())
    fireHistoryMouseButton(shellRoot, 4)
    await waitFor(() => expect(screen.getByText('Translations')).toBeTruthy())
  })

  it('keeps native close requests blocked while an unsaved guard decision is pending', async () => {
    modPreviewState.dirty = true
    const onCloseWindow = vi.fn(async () => true)
    let closeHandler: () => boolean | Promise<boolean> = () => {
      throw new Error('Window close handler was not registered.')
    }

    const toolViews = [toolWorkspaceRegistration('mod-translation', 'Translations', 110)]
    renderWithLocale(
      <WorkbenchExperience
        pendingWorkbenchIntent={null}
        onClearPendingIntent={vi.fn()}
        active
        appUiStateReady
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
        getWorkbenchModuleRegistration={(moduleId) => toolViews.find((view) => view.id === moduleId) ?? viewRegistration(moduleId)}
        workbenchModules={toolViews}
      />,
    )
    openModTranslationTool()
    await waitFor(() => expect(screen.getByText('Translations')).toBeTruthy())

    await waitFor(() => {
      expect(closeHandler).toBeTypeOf('function')
      expect(modPreviewState.registered).toBe(true)
      const unloadEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unloadEvent)
      expect(unloadEvent.defaultPrevented).toBe(true)
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

    const toolViews = [toolWorkspaceRegistration('mod-translation', 'Translations', 110)]
    renderWithLocale(
      <WorkbenchExperience
        pendingWorkbenchIntent={null}
        onClearPendingIntent={vi.fn()}
        active
        appUiStateReady
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
        getWorkbenchModuleRegistration={(moduleId) => toolViews.find((view) => view.id === moduleId) ?? viewRegistration(moduleId)}
        workbenchModules={toolViews}
      />,
    )
    openModTranslationTool()
    await waitFor(() => expect(screen.getByText('Translations')).toBeTruthy())

    await waitFor(() => {
      expect(closeHandler).toBeTypeOf('function')
      expect(modPreviewState.registered).toBe(true)
      const unloadEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unloadEvent)
      expect(unloadEvent.defaultPrevented).toBe(true)
    })

    await expect(closeHandler()).resolves.toBe(false)
    await waitFor(() => {
      expect(modPreviewState.pendingAction).toBeTypeOf('function')
    })

    await modPreviewState.pendingAction?.()

    expect(onCloseWindow).toHaveBeenCalledTimes(1)
  })

  it('opens the separate project dashboard from the global home', async () => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    const projectDashboard: WorkbenchModuleRegistration = {
      ...viewRegistration('project-dashboard'),
      navigation: { section: 'authoring', order: 190, icon: 'files', labelKey: 'project-dashboard' },
      presentation: 'authoring',
      projectAccess: 'write',
      layout: 'fixed',
    }
    renderExperience({ workbenchModules: [projectDashboard] })

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    expect(home.getAttribute('data-content')).toBe('home')
    fireEvent.click(within(home).getByRole('button', { name: navCopy.shellOpenProjectHome }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
      expect(screen.getByText('project-dashboard')).toBeTruthy()
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
          desktopHost={false}
          onToggleTheme={vi.fn()}
          onSwitchToLauncher={vi.fn()}
          onOpenSettings={vi.fn()}
          onMinimizeWindow={vi.fn()}
          onToggleMaximizeWindow={vi.fn()}
          onCloseWindow={vi.fn()}
          onWorkbenchEvent={onWorkbenchEvent}
          getWorkbenchModuleRegistration={(moduleId) => viewRegistration(moduleId)}
        />
      </LocaleProvider>,
    )

    expect(onWorkbenchEvent).toHaveBeenCalledTimes(1)
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

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['map-browser'] }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
  })

  it('does not reopen the home page when a late workbench activation arrives after opening a workspace', async () => {
    const { rerender } = renderExperience({ workbenchActivationKey: 0 })
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['map-browser'] }))

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

    fireEvent.click(document.querySelector<HTMLButtonElement>('.top-menu-project-title')!)
    fireEvent.click(screen.getByRole('menuitem', { name: navCopy.shellProjectMenuClose }))

    await waitFor(() => {
      expect(clearActiveDraftSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps browser modules read-only without an edit gate', async () => {
    renderExperience()
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['map-browser'] }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
    })

    expect(screen.queryByText(navCopy.shellEditLockedTitle)).toBeNull()
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
  })

  it('omits the workspace toolbar for standalone registered tools', async () => {
    renderExperience({ workbenchModules: [i18nGeneratorRegistration()] })
    await configureGameDirectory()

    fireEvent.click(within(getSideNav()).getByRole('button', { name: 'Tools' }))
    const generatorButton = within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['i18n-generator'] })
    fireEvent.click(generatorButton)

    await waitFor(() => {
      expect(generatorButton).toHaveAttribute('aria-current', 'page')
    })
    expect(screen.queryByRole('group', { name: `${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}` })).toBeNull()
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
  })

  it('lists the Mods browser first in Tools and opens it as a tool workspace', async () => {
    renderExperience({
      workbenchModules: [
        toolWorkspaceRegistration('mod-browser', 'Mods', 100),
        toolWorkspaceRegistration('mod-translation', 'Translations', 110),
        i18nGeneratorRegistration(),
      ],
    })

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup }))
    const toolsSection = getSideNav().querySelector<HTMLElement>('[data-section="tools"]')
    const toolItems = toolsSection?.querySelectorAll<HTMLElement>('.workbench-side-nav-item')
    expect(toolItems?.[0]).toHaveTextContent(navCopy.moduleLabels['mod-browser'])
    expect(toolItems?.[1]).toHaveTextContent(navCopy.moduleLabels['mod-translation'])

    fireEvent.click(toolItems![0])

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
      expect(screen.getByText('Mods')).toBeTruthy()
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

  it('resolves authoring modules back home when no project is active', async () => {
    renderExperience({ workbenchModules: [toolWorkspaceRegistration('mod-browser', 'Mods', 100, 'authoring')] })

    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavToolsGroup }))
    fireEvent.click(within(getSideNav()).getByRole('button', { name: /Mods/i }))

    await waitFor(() => expect(screen.getByRole('region', { name: 'Workbench Home' })).toBeTruthy())
  })

  it('marks a restored workspace tool as selected in the side navigation', async () => {
    getAppUiStateSnapshotSpy.mockReturnValue({
      workspace: {
        location: { kind: 'module', moduleId: 'mod-browser' },
        navigation: { collapsed: false, expandedSections: ['browse', 'tools'] },
        modules: {},
      },
      appearance: {
        recentGameDirectories: [],
        playerAppearance: { profiles: [], activeProfileId: null },
      },
    })

    renderExperience({ workbenchModules: [toolWorkspaceRegistration('mod-browser', 'Mods', 100)] })

    const modsButton = within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels['mod-browser'] })
    await waitFor(() => expect(modsButton).toHaveAttribute('aria-current', 'page'))
    expect(document.querySelector('.workbench-ws-toolbar')).toBeNull()
    expect(screen.queryByText(navCopy.shellEditLockedTitle)).toBeNull()
  })

  it.each([
    ['project-content', 'files'],
    ['map-authoring', 'map'],
    ['event-authoring', 'events'],
    ['character-authoring', 'characters'],
    ['building-authoring', 'buildings'],
    ['item-authoring', 'items'],
    ['project-translation', 'languages'],
  ] as const)('opens %s with an active project and keeps project export available', async (moduleId, icon) => {
    useCpMakerState.activeDraft = draft('festival-dialogue')
    const authoringModule: WorkbenchModuleRegistration = {
      ...viewRegistration(moduleId),
      navigation: { section: 'authoring', order: 100, icon, labelKey: moduleId },
      presentation: 'authoring',
      projectAccess: 'write',
      layout: 'dockable',
      runtime: lazy(async () => ({ default: () => <div>{`Authoring body: ${moduleId}`}</div> })),
    }
    renderExperience({ workbenchModules: [authoringModule] })
    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.shellNavAuthoringGroup }))
    fireEvent.click(within(getSideNav()).getByRole('button', { name: navCopy.moduleLabels[moduleId] }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Workbench Home' })).toBeNull()
      expect(screen.getByText(`Authoring body: ${moduleId}`)).toBeTruthy()
    })
    expect(screen.queryByText(navCopy.shellEditLockedTitle)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Festival Dialogue Pack/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: navCopy.shellProjectMenuExport }))
    expect(screen.getByRole('dialog', { name: editorCopy['en-US'].studioDesk.exportDialog.title })).toBeTruthy()
  })
})
