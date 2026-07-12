import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import ProjectContentModuleRuntime from '@pages/workbench/ui/module-runtimes/ProjectContentModuleRuntime'
import MapAuthoringModuleRuntime from '@pages/workbench/ui/module-runtimes/MapAuthoringModuleRuntime'
import EventAuthoringModuleRuntime from '@pages/workbench/ui/module-runtimes/EventAuthoringModuleRuntime'
import CharacterAuthoringModuleRuntime from '@pages/workbench/ui/module-runtimes/CharacterAuthoringModuleRuntime'
import BuildingAuthoringModuleRuntime from '@pages/workbench/ui/module-runtimes/BuildingAuthoringModuleRuntime'
import ItemAuthoringModuleRuntime from '@pages/workbench/ui/module-runtimes/ItemAuthoringModuleRuntime'
import ProjectTranslationModuleRuntime from '@pages/workbench/ui/module-runtimes/ProjectTranslationModuleRuntime'

const state = vi.hoisted(() => ({
  shellProps: null as Record<string, unknown> | null,
  translationProps: null as Record<string, unknown> | null,
  environment: {
    directoryInfo: null,
    playerAppearanceProfile: null,
    onOpenPlayerAppearanceWindow: vi.fn(),
    onReloadProject: vi.fn(),
    accentColor: 'orange',
  },
  project: {
    activeDraft: { draftStorageKey: 'draft-1', projectMetadata: { projectName: 'Draft' } },
    isDirty: true,
    configSchema: [],
    i18nFiles: [{ locale: 'default', rawJson: '{"hello":"Hello"}' }],
    getPatchesForWorkspace: vi.fn(() => [{ id: 'patch-1' }]),
    addPatch: vi.fn(() => 'patch-2'),
    removePatch: vi.fn(),
    updatePatch: vi.fn(),
    removeConfigEntry: vi.fn(),
    addConfigEntry: vi.fn(),
    saveDraft: vi.fn(),
    addVirtualAsset: vi.fn(),
    removeVirtualAsset: vi.fn(),
    setI18nFiles: vi.fn(),
  },
}))

vi.mock('@features/cp-maker', () => ({
  EditModeShell: (props: Record<string, unknown>) => {
    state.shellProps = props
    return <div data-testid="authoring-shell" />
  },
}))

vi.mock('@features/translation-editor', () => ({
  TranslationEditor: (props: Record<string, unknown>) => {
    state.translationProps = props
    return <div data-testid="translation-editor" />
  },
}))

vi.mock('@pages/workbench/model/workbenchModuleContexts', () => ({
  useWorkbenchEnvironment: () => state.environment,
  useWorkbenchProject: () => state.project,
}))

vi.mock('@pages/workbench/ui/module-runtimes/runtimeInputs', () => ({
  useWorkbenchRuntimeInputs: () => ({
    locale: 'en-US',
    theme: 'dark',
    copy: { viewportLabels: {} },
    environment: state.environment,
    moduleState: {},
  }),
}))

vi.mock('@pages/workbench/model/useEditModeNavigation', () => ({
  useEditModeNavigation: () => ({
    activeEditPatchId: null,
    navigateToPatch: vi.fn(),
    canGoBack: false,
    canGoForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  state.shellProps = null
  state.translationProps = null
  vi.clearAllMocks()
})

describe('authoring module runtimes', () => {
  const cases = [
    ['project-content', 'mods', ProjectContentModuleRuntime],
    ['map-authoring', 'map', MapAuthoringModuleRuntime],
    ['event-authoring', 'events', EventAuthoringModuleRuntime],
    ['character-authoring', 'characters', CharacterAuthoringModuleRuntime],
    ['building-authoring', 'buildings', BuildingAuthoringModuleRuntime],
    ['item-authoring', 'items', ItemAuthoringModuleRuntime],
  ] as const

  it.each(cases)('%s owns a complete %s patch lifecycle', (_moduleId, workspaceId, Runtime) => {
    render(<Runtime />)
    const props = state.shellProps as {
      workspaceId: string
      isDirty: boolean
      onPatchAdd: (action: string, target: string, fromFile?: string) => void
      onPatchUpdate: (id: string, patch: object) => void
      onPatchRemove: (id: string) => void
      onSaveDraft: () => void
      onReloadDraft: () => void
    }
    expect(props.workspaceId).toBe(workspaceId)
    expect(props.isDirty).toBe(true)
    expect(state.project.getPatchesForWorkspace).toHaveBeenCalledWith(workspaceId)
    act(() => {
      props.onPatchAdd('EditData', 'Data/Test')
      props.onPatchUpdate('patch-1', { enabled: false })
      props.onPatchRemove('patch-1')
      props.onSaveDraft()
      props.onReloadDraft()
    })
    expect(state.project.addPatch).toHaveBeenCalledWith(workspaceId, 'Data/Test', 'EditData', undefined)
    expect(state.project.updatePatch).toHaveBeenCalledWith('patch-1', { enabled: false })
    expect(state.project.removePatch).toHaveBeenCalledWith('patch-1')
    expect(state.project.saveDraft).toHaveBeenCalled()
    expect(state.environment.onReloadProject).toHaveBeenCalled()
  })

  it('project-translation edits managed draft i18n data and saves through cp-maker', () => {
    render(<ProjectTranslationModuleRuntime />)
    const props = state.translationProps as {
      canPersist: boolean
      onI18nFilesChange: (files: Array<{ locale: string; rawJson: string }>) => void
      onSave: () => void
      onReload: () => void
    }
    expect(props.canPersist).toBe(true)
    act(() => {
      props.onI18nFilesChange([{ locale: 'zh-CN', rawJson: '{"hello":"你好"}' }])
      props.onSave()
      props.onReload()
    })
    expect(state.project.setI18nFiles).toHaveBeenCalledWith([{ locale: 'zh-CN', rawJson: '{"hello":"你好"}' }])
    expect(state.project.saveDraft).toHaveBeenCalled()
    expect(state.environment.onReloadProject).toHaveBeenCalled()
  })
})
