import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  chooseDirectory,
  loadContentPatcherProject,
  loadModProject,
  saveModProject,
  scanModProjects,
  simulateContentPatcher,
  type ContentPatcherPatchSummary,
  type ContentPatcherProjectSnapshot,
  type ContentPatcherSimulationResult,
  type ModProjectDetail,
  type ModProjectSummary,
  type SaveModProjectResult,
  type GameDirectoryInfo,
} from '../desktop'
import type { LocaleCode } from '../editor-shell'
import { getModWorkspaceCopy } from '../plugins/copy'
import {
  addPatch,
  buildContentPatcherSimulationRequest,
  type ContentPatcherBackendSimulationContext,
  getPatchObject,
  parseJsonText,
  removePatch,
  stringifyPrettyJson,
  summarizeContentPatcherContent,
  updateManifestField,
  updatePatchField,
  updatePatchWhen,
} from '../plugins/contentPatcher'
import { getWorkspacePluginDefinition } from '../plugins/registry'
import type { JsonEditorState } from '../plugins/types'
import { scheduleDeferred } from '../react/defer'

type UseModWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
}

function normalizeEditorState(text: string): JsonEditorState {
  const parsed = parseJsonText(text)
  return {
    text,
    value: parsed.value,
    error: parsed.error,
  }
}

function upsertProject(projects: ModProjectSummary[], nextProject: ModProjectSummary) {
  const existingIndex = projects.findIndex((project) => project.absolutePath === nextProject.absolutePath)
  if (existingIndex === -1) {
    return [...projects, nextProject].sort((left, right) => left.name.localeCompare(right.name))
  }

  return projects.map((project, index) => (index === existingIndex ? nextProject : project))
}

function createDefaultSimulationContext(): ContentPatcherBackendSimulationContext {
  return {
    season: '',
    weather: '',
    relationship: '',
    config: {},
    installedMods: [],
    customTokens: {},
  }
}

export function useModWorkspace({ directoryInfo, locale }: UseModWorkspaceOptions) {
  const copy = getModWorkspaceCopy(locale)
  const pluginDefinition = getWorkspacePluginDefinition('content-patcher')
  const [modProjects, setModProjects] = useState<ModProjectSummary[]>([])
  const [modFilter, setModFilter] = useState('')
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null)
  const [projectDetail, setProjectDetail] = useState<ModProjectDetail | null>(null)
  const [manifestEditor, setManifestEditor] = useState<JsonEditorState>({ text: '', value: null, error: null })
  const [contentEditor, setContentEditor] = useState<JsonEditorState>({ text: '', value: null, error: null })
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(null)
  const [patchWhenError, setPatchWhenError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [lastSaveResult, setLastSaveResult] = useState<SaveModProjectResult | null>(null)
  const [contentPatcherSnapshot, setContentPatcherSnapshot] = useState<ContentPatcherProjectSnapshot | null>(null)
  const [contentPatcherSimulation, setContentPatcherSimulation] = useState<ContentPatcherSimulationResult | null>(null)
  const [simulationContext, setSimulationContext] = useState<ContentPatcherBackendSimulationContext>(
    createDefaultSimulationContext,
  )
  const deferredFilter = useDeferredValue(modFilter.trim().toLowerCase())

  const filteredModProjects = useMemo(
    () =>
      modProjects.filter((project) => {
        if (!deferredFilter) {
          return true
        }

        const haystack = [
          project.name,
          project.author ?? '',
          project.uniqueId ?? '',
          project.absolutePath,
          project.folderName,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(deferredFilter)
      }),
    [deferredFilter, modProjects],
  )

  const contentSummary = useMemo(() => summarizeContentPatcherContent(contentEditor.value), [contentEditor.value])
  const selectedPatch = useMemo(() => {
    if (!selectedPatchId) {
      return null
    }

    return getPatchObject(contentEditor.value, selectedPatchId)
  }, [contentEditor.value, selectedPatchId])
  const activeProject = projectDetail?.summary ?? modProjects.find((project) => project.absolutePath === activeProjectPath) ?? null
  const diagnostics = useMemo(() => {
    const messages = [
      ...(projectDetail?.diagnostics ?? []),
      ...(contentPatcherSnapshot?.diagnostics ?? []),
      ...(contentPatcherSimulation?.diagnostics ?? []),
    ]
    if (manifestEditor.error) {
      messages.push({ severity: 'error', message: `manifest.json: ${manifestEditor.error}`, field: 'manifest' })
    }
    if (contentEditor.error) {
      messages.push({ severity: 'error', message: `content.json: ${contentEditor.error}`, field: 'content' })
    }
    if (patchWhenError) {
      messages.push({ severity: 'error', message: `When: ${patchWhenError}`, field: 'patch.When' })
    }
    return messages
  }, [
    contentEditor.error,
    contentPatcherSimulation?.diagnostics,
    contentPatcherSnapshot?.diagnostics,
    manifestEditor.error,
    patchWhenError,
    projectDetail?.diagnostics,
  ])

  const hasUnsavedChanges = useMemo(() => {
    const source = projectDetail?.contentPatcher
    if (!source) {
      return false
    }

    return manifestEditor.text.trimEnd() !== source.manifestJson.trimEnd() || contentEditor.text.trimEnd() !== source.contentJson.trimEnd()
  }, [contentEditor.text, manifestEditor.text, projectDetail?.contentPatcher])

  const canPersist = Boolean(projectDetail?.contentPatcher && !manifestEditor.error && !contentEditor.error && !patchWhenError)

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      const cancel = scheduleDeferred(() => {
        setModProjects([])
        setActiveProjectPath(null)
        setProjectDetail(null)
        setManifestEditor({ text: '', value: null, error: null })
        setContentEditor({ text: '', value: null, error: null })
        setSelectedPatchId(null)
        setPatchWhenError(null)
        setStatusMessage('')
        setLastSaveResult(null)
        setContentPatcherSnapshot(null)
        setContentPatcherSimulation(null)
        setSimulationContext(createDefaultSimulationContext())
      })

      return cancel
    }

    let cancelled = false

    void scanModProjects(directoryInfo.rootPath)
      .then((projects) => {
        if (cancelled) {
          return
        }

        setModProjects(projects)
        setStatusMessage(copy.scanStatus(projects.length))
        setActiveProjectPath((current) => current && projects.some((project) => project.absolutePath === current) ? current : projects[0]?.absolutePath ?? null)
      })
      .catch((error) => {
        if (!cancelled) {
          setModProjects([])
          setStatusMessage(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [copy, directoryInfo?.rootPath])

  useEffect(() => {
    if (!activeProjectPath) {
      const cancel = scheduleDeferred(() => {
        setProjectDetail(null)
        setManifestEditor({ text: '', value: null, error: null })
        setContentEditor({ text: '', value: null, error: null })
        setSelectedPatchId(null)
        setPatchWhenError(null)
        setContentPatcherSnapshot(null)
        setContentPatcherSimulation(null)
        setSimulationContext(createDefaultSimulationContext())
      })

      return cancel
    }

    let cancelled = false

    void loadModProject(activeProjectPath)
      .then((detail) => {
        if (cancelled) {
          return
        }

        setProjectDetail(detail)
        setModProjects((current) => upsertProject(current, detail.summary))
        const manifestJson = detail.contentPatcher?.manifestJson ?? '{}\n'
        const contentJson = detail.contentPatcher?.contentJson ?? '{\n  "Changes": []\n}\n'
        setManifestEditor(normalizeEditorState(manifestJson))
        setContentEditor(normalizeEditorState(contentJson))
        setPatchWhenError(null)
        setSelectedPatchId(detail.contentPatcher?.patches[0]?.id ?? null)
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectDetail(null)
          setManifestEditor({ text: '', value: null, error: null })
          setContentEditor({ text: '', value: null, error: null })
          setSelectedPatchId(null)
          setPatchWhenError(null)
          setContentPatcherSnapshot(null)
          setContentPatcherSimulation(null)
          setStatusMessage(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeProjectPath])

  useEffect(() => {
    if (projectDetail?.pluginKind !== 'content-patcher' || !projectDetail.contentPatcher || !projectDetail.summary.absolutePath) {
      setContentPatcherSnapshot(null)
      setContentPatcherSimulation(null)
      return
    }

    let cancelled = false

    void loadContentPatcherProject(projectDetail.summary.absolutePath)
      .then((snapshot) => {
        if (!cancelled) {
          setContentPatcherSnapshot(snapshot)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setContentPatcherSnapshot(null)
          setContentPatcherSimulation(null)
          setStatusMessage(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    projectDetail?.contentPatcher,
    projectDetail?.pluginKind,
    projectDetail?.summary.absolutePath,
  ])

  useEffect(() => {
    if (!contentPatcherSnapshot) {
      setContentPatcherSimulation(null)
      return
    }

    if (manifestEditor.error || contentEditor.error) {
      setContentPatcherSimulation(null)
      return
    }

    let cancelled = false

    void simulateContentPatcher(
      buildContentPatcherSimulationRequest(contentPatcherSnapshot, simulationContext, {
        path: projectDetail?.summary.absolutePath ?? null,
        manifestJson: manifestEditor.text,
        contentJson: contentEditor.text,
      }),
    )
      .then((result) => {
        if (!cancelled) {
          setContentPatcherSimulation(result)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setContentPatcherSimulation(null)
          setStatusMessage(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    contentEditor.error,
    contentEditor.text,
    contentPatcherSnapshot,
    manifestEditor.error,
    manifestEditor.text,
    projectDetail?.summary.absolutePath,
    simulationContext,
  ])

  useEffect(() => {
    const cancel = scheduleDeferred(() => {
      if (!contentSummary.patches.length) {
        setSelectedPatchId(null)
        return
      }

      setSelectedPatchId((current) =>
        current && contentSummary.patches.some((patch) => patch.id === current) ? current : contentSummary.patches[0]?.id ?? null,
      )
    })

    return cancel
  }, [contentSummary.patches])

  function updateManifestValue(nextValue: unknown) {
    setManifestEditor(normalizeEditorState(stringifyPrettyJson(nextValue)))
  }

  function updateContentValue(nextValue: unknown) {
    setContentEditor(normalizeEditorState(stringifyPrettyJson(nextValue)))
  }

  function handleSelectProject(path: string) {
    setActiveProjectPath(path)
    setLastSaveResult(null)
    setContentPatcherSnapshot(null)
    setContentPatcherSimulation(null)
    setSimulationContext(createDefaultSimulationContext())
  }

  async function handleImportProject() {
    const selected = await chooseDirectory(copy.selectProjectFolder)
    if (!selected) {
      return
    }

    setActiveProjectPath(selected)
    setStatusMessage(copy.importedFrom(selected))
  }

  async function handleRefreshProjects() {
    if (!directoryInfo?.rootPath) {
      return
    }

    const projects = await scanModProjects(directoryInfo.rootPath)
    setModProjects(projects)
    setStatusMessage(copy.scanStatus(projects.length))
  }

  function handleManifestFieldChange(field: string, value: string) {
    if (field === 'ContentPackFor') {
      const manifest = typeof manifestEditor.value === 'object' && manifestEditor.value && !Array.isArray(manifestEditor.value)
        ? { ...(manifestEditor.value as Record<string, unknown>) }
        : {}
      const trimmed = value.trim()
      if (trimmed) {
        manifest.ContentPackFor = { UniqueID: trimmed }
      } else {
        delete manifest.ContentPackFor
      }
      updateManifestValue(manifest)
      return
    }

    updateManifestValue(updateManifestField(manifestEditor.value, field, value))
  }

  function handleManifestTextChange(value: string) {
    setManifestEditor(normalizeEditorState(value))
  }

  function handleContentTextChange(value: string) {
    setContentEditor(normalizeEditorState(value))
    setPatchWhenError(null)
  }

  function handleAddPatch() {
    const nextValue = addPatch(contentEditor.value)
    updateContentValue(nextValue)
    const nextSummary = summarizeContentPatcherContent(nextValue)
    setSelectedPatchId(nextSummary.patches[nextSummary.patches.length - 1]?.id ?? null)
  }

  function handleRemoveSelectedPatch() {
    if (!selectedPatchId) {
      return
    }

    updateContentValue(removePatch(contentEditor.value, selectedPatchId))
    setPatchWhenError(null)
  }

  function handlePatchFieldChange(field: string, value: string) {
    if (!selectedPatchId) {
      return
    }

    updateContentValue(updatePatchField(contentEditor.value, selectedPatchId, field, value))
  }

  function handlePatchWhenChange(value: string) {
    if (!selectedPatchId) {
      return
    }

    const result = updatePatchWhen(contentEditor.value, selectedPatchId, value)
    setPatchWhenError(result.error)
    if (!result.error) {
      updateContentValue(result.value)
    }
  }

  async function persistProject(outputPath?: string | null) {
    const sourcePath = projectDetail?.summary.absolutePath
    if (!sourcePath || !canPersist) {
      return null
    }

    const result = await saveModProject({
      sourcePath,
      outputPath,
      manifestJson: manifestEditor.text,
      contentJson: contentEditor.text,
    })
    setLastSaveResult(result)

    if (!outputPath) {
      const refreshed = await loadModProject(sourcePath)
      setProjectDetail(refreshed)
      setModProjects((current) => upsertProject(current, refreshed.summary))
      setManifestEditor(normalizeEditorState(refreshed.contentPatcher?.manifestJson ?? '{}\n'))
      setContentEditor(normalizeEditorState(refreshed.contentPatcher?.contentJson ?? '{\n  "Changes": []\n}\n'))
      setStatusMessage(copy.saveSuccess(result.targetPath))
    } else {
      setStatusMessage(copy.exportSuccess(result.targetPath))
    }

    return result
  }

  async function handleSaveProject() {
    return persistProject()
  }

  async function handleExportProject() {
    const selected = await chooseDirectory(copy.selectExportFolder)
    if (!selected) {
      return null
    }

    return persistProject(selected)
  }

  function handleSimulationContextChange(nextContext: ContentPatcherBackendSimulationContext) {
    setSimulationContext({
      season: nextContext.season,
      weather: nextContext.weather,
      relationship: nextContext.relationship,
      config: { ...nextContext.config },
      installedMods: [...nextContext.installedMods],
      customTokens: { ...nextContext.customTokens },
    })
  }

  return {
    copy,
    pluginDefinition,
    modProjects,
    filteredModProjects,
    modFilter,
    setModFilter,
    activeProjectPath,
    activeProject,
    projectDetail,
    manifestEditor,
    contentEditor,
    contentSummary,
    diagnostics,
    selectedPatchId,
    setSelectedPatchId,
    selectedPatch,
    patchWhenError,
    statusMessage,
    hasUnsavedChanges,
    canPersist,
    lastSaveResult,
    contentPatcherSnapshot,
    contentPatcherSimulation,
    simulationContext,
    handleSelectProject,
    handleImportProject,
    handleRefreshProjects,
    handleManifestFieldChange,
    handleManifestTextChange,
    handleContentTextChange,
    handleAddPatch,
    handleRemoveSelectedPatch,
    handlePatchFieldChange,
    handlePatchWhenChange,
    handleSaveProject,
    handleExportProject,
    handleSimulationContextChange,
  }
}

export type ModWorkspaceState = ReturnType<typeof useModWorkspace>
export type SelectedPatchSummary = ContentPatcherPatchSummary

