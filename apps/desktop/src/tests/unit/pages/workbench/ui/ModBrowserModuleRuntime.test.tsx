import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { WorkspaceLayoutHandle } from '@shared/contracts'
import { LocaleProvider } from '@locales/provider'
import { WorkbenchEnvironmentProvider, WorkbenchModuleStateProvider } from '@pages/workbench/model/workbenchModuleContexts'
import ModBrowserModuleRuntime from '@pages/workbench/ui/module-runtimes/ModBrowserModuleRuntime'

const chooseDirectorySpy = vi.hoisted(() => vi.fn())
const invokeDesktopSpy = vi.hoisted(() => vi.fn())

vi.mock('@platform/host/runtime', () => ({ invokeDesktop: invokeDesktopSpy }))
vi.mock('@platform/host', () => ({ chooseDirectory: chooseDirectorySpy }))

vi.mock('@pages/workbench/workspaces/mod', () => ({
  useModCatalog: () => ({
    projects: [{ absolutePath: '/mods/Example', name: 'Example' }],
    filteredProjects: [{ absolutePath: '/mods/Example', name: 'Example' }],
    activeProjectPath: '/mods/Example',
    activeProject: { absolutePath: '/mods/Example', name: 'Example' },
    statusMessage: '',
    query: '',
    contentPatcherOnly: false,
    compatibleOnly: false,
    i18nOnly: false,
    setQuery: vi.fn(),
    setContentPatcherOnly: vi.fn(),
    setCompatibleOnly: vi.fn(),
    setI18nOnly: vi.fn(),
    setActiveProjectPath: vi.fn(),
    refresh: vi.fn(),
  }),
  useModProjectInspection: () => ({ detail: null, diagnostics: [], contentSummary: null, error: null }),
  useModTranslationWorkspace: () => {
    throw new Error('mod-browser must not construct translation editor state')
  },
  ModBrowserPanel: ({ onImportProject }: { onImportProject?: () => void }) => (
    <button type="button" onClick={onImportProject}>
      Import active project
    </button>
  ),
  ModDiagnosticsPanel: () => null,
  ModWorkspaceDecisionDialogs: () => null,
}))

vi.mock('@pages/workbench/ui/WorkbenchLayoutHost', () => ({
  WorkbenchLayoutHost: ({ workspacePanels }: { workspacePanels: Array<{ content: React.ReactNode }> }) => (
    <>
      {workspacePanels.map((panel, index) => (
        <div key={index}>{panel.content}</div>
      ))}
    </>
  ),
}))

describe('ModBrowserModuleRuntime', () => {
  it('stays read-only and imports the active path without another directory picker', () => {
    const onImportModProject = vi.fn(async () => undefined)
    render(
      <LocaleProvider locale="en-US">
        <WorkbenchEnvironmentProvider
          value={{
            active: true,
            desktopHost: true,
            accentColor: 'blue',
            directoryInfo: null,
            directoryStatus: { tone: 'idle', message: '' },
            heavyWorkspaceReady: true,
            onDirectoryInvalid: vi.fn(),
            playerAppearanceProfile: null,
            onOpenPlayerAppearanceWindow: vi.fn(),
            onImportModProject,
            onReloadProject: vi.fn(),
            onOpenModule: vi.fn(),
            onOpenProjectProperties: vi.fn(),
            onOpenCreateProject: vi.fn(),
            onExportProject: vi.fn(),
            onCloseProject: vi.fn(),
            onOpenGameDirectory: vi.fn(),
          }}
        >
          <WorkbenchModuleStateProvider
            value={{
              moduleId: 'mod-browser',
              persistenceKey: 'mod-browser',
              layoutRef: createRef<WorkspaceLayoutHandle>(),
              layouts: {},
              onPersistStateChange: vi.fn(),
              onUnsavedGuardChange: vi.fn(),
            }}
          >
            <ModBrowserModuleRuntime />
          </WorkbenchModuleStateProvider>
        </WorkbenchEnvironmentProvider>
      </LocaleProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Import active project' }))

    expect(onImportModProject).toHaveBeenCalledWith('/mods/Example')
    expect(chooseDirectorySpy).not.toHaveBeenCalled()
    expect(invokeDesktopSpy).not.toHaveBeenCalled()
  })
})
