import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { WorkspaceLayoutHandle } from '@shared/contracts'
import { LocaleProvider } from '@locales/provider'
import { WorkbenchEnvironmentProvider, WorkbenchModuleStateProvider } from '@pages/workbench/model/workbenchModuleContexts'
import ModBrowserModuleRuntime from '@pages/workbench/ui/module-runtimes/ModBrowserModuleRuntime'

const openProjectDirectory = vi.hoisted(() => vi.fn())
const openProjectArchive = vi.hoisted(() => vi.fn())

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
    externalProject: null,
    openProjectDirectory,
    openProjectArchive,
  }),
  useModProjectInspection: () => ({ detail: null, diagnostics: [], contentSummary: null, error: null }),
  useModTranslationWorkspace: () => {
    throw new Error('mod-browser must not construct translation editor state')
  },
  ModBrowserPanel: ({ onOpenFolder, onOpenArchive }: { onOpenFolder?: () => void; onOpenArchive?: () => void }) => (
    <>
      <button type="button" onClick={onOpenFolder}>
        Open folder
      </button>
      <button type="button" onClick={onOpenArchive}>
        Open archive
      </button>
    </>
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
  it('opens external folders and archives through the read-only catalog', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open archive' }))

    expect(openProjectDirectory).toHaveBeenCalledOnce()
    expect(openProjectArchive).toHaveBeenCalledOnce()
    expect(onImportModProject).not.toHaveBeenCalled()
  })
})
