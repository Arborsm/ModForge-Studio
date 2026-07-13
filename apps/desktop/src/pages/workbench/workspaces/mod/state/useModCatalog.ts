import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { GameDirectoryInfo } from '@entities/game/api'
import { inspectModArchive, loadModProject, scanModProjects, type ModProjectDetail, type ModProjectSummary } from '@entities/mod/api'
import { chooseDirectory, chooseModArchiveFile } from '@platform/host'
import { useModCopy } from '@locales/provider'
import { TaskCancelledError, useLatestTask } from '@platform/task-runtime'

type ModCatalogMode = 'browse' | 'translation'

type UseModCatalogOptions = {
  directoryInfo: GameDirectoryInfo | null
  mode: ModCatalogMode
}

function defaultProjectPath(projects: ModProjectSummary[], mode: ModCatalogMode) {
  if (mode === 'translation') return projects.find((project) => project.i18nEntryCount > 0)?.absolutePath ?? null
  return projects[0]?.absolutePath ?? null
}

/** Scans and filters disk mod projects without constructing editor or mutation state. */
export function useModCatalog({ directoryInfo, mode }: UseModCatalogOptions) {
  const copy = useModCopy()
  const [projects, setProjects] = useState<ModProjectSummary[]>([])
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [contentPatcherOnly, setContentPatcherOnly] = useState(false)
  const [compatibleOnly, setCompatibleOnly] = useState(false)
  const [i18nOnly, setI18nOnly] = useState(mode === 'translation')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [externalProject, setExternalProject] = useState<ModProjectDetail | null>(null)
  const scanGenerationRef = useRef(0)
  const runLatestScan = useLatestTask('mod-catalog-scan')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  const refresh = async () => {
    const generation = ++scanGenerationRef.current
    const rootPath = directoryInfo?.rootPath
    if (!rootPath) {
      setLoading(false)
      await runLatestScan(async () => [])
      setProjects([])
      setActiveProjectPath(null)
      setStatusMessage('')
      return []
    }
    setLoading(true)
    try {
      return await runLatestScan(async (scope) => {
        const next = await scanModProjects(rootPath)
        if (scope.isCurrent() && scanGenerationRef.current === generation) {
          setProjects(next)
          setActiveProjectPath((current) =>
            current && next.some((project) => project.absolutePath === current) ? current : defaultProjectPath(next, mode),
          )
          setStatusMessage(copy.scanStatus(next.length))
          if (scanGenerationRef.current === generation) setLoading(false)
        }
        return next
      })
    } catch (error) {
      if (error instanceof TaskCancelledError) {
        if (scanGenerationRef.current === generation) setLoading(false)
        return []
      }
      if (scanGenerationRef.current !== generation) return []
      setProjects([])
      setActiveProjectPath(null)
      setStatusMessage(error instanceof Error ? error.message : String(error))
      if (scanGenerationRef.current === generation) setLoading(false)
      return []
    }
  }

  useEffect(() => {
    const generation = ++scanGenerationRef.current
    const rootPath = directoryInfo?.rootPath
    if (!rootPath) {
      setLoading(false)
      void runLatestScan(async () => [])
      setProjects([])
      setActiveProjectPath(null)
      setStatusMessage('')
      return
    }
    setLoading(true)
    void runLatestScan(async (scope) => {
      const next = await scanModProjects(rootPath)
      if (scope.isCurrent() && scanGenerationRef.current === generation) {
        setProjects(next)
        setActiveProjectPath((current) =>
          current && next.some((project) => project.absolutePath === current) ? current : defaultProjectPath(next, mode),
        )
        setStatusMessage(copy.scanStatus(next.length))
        if (scanGenerationRef.current === generation) setLoading(false)
      }
      return next
    }).catch((error) => {
      if (error instanceof TaskCancelledError) {
        if (scanGenerationRef.current === generation) setLoading(false)
      } else if (scanGenerationRef.current === generation) {
        setProjects([])
        setActiveProjectPath(null)
        setStatusMessage(error instanceof Error ? error.message : String(error))
        if (scanGenerationRef.current === generation) setLoading(false)
      }
    })
  }, [copy, directoryInfo?.rootPath, mode, runLatestScan])

  const allProjects = useMemo(
    () =>
      externalProject && !projects.some((project) => project.absolutePath === externalProject.summary.absolutePath)
        ? [externalProject.summary, ...projects]
        : projects,
    [externalProject, projects],
  )

  const filteredProjects = useMemo(
    () =>
      allProjects.filter((project) => {
        if (mode === 'translation' && project.i18nEntryCount === 0) return false
        if (contentPatcherOnly && project.pluginKind !== 'content-patcher') return false
        if (compatibleOnly && project.status === 'incompatible') return false
        if (i18nOnly && project.i18nEntryCount === 0) return false
        if (!deferredQuery) return true
        return [project.name, project.author ?? '', project.uniqueId ?? '', project.folderName, project.absolutePath]
          .join(' ')
          .toLowerCase()
          .includes(deferredQuery)
      }),
    [allProjects, compatibleOnly, contentPatcherOnly, deferredQuery, i18nOnly, mode],
  )

  const openProjectDirectory = async () => {
    const selected = await chooseDirectory(copy.selectProjectFolder)
    if (selected) {
      setLoading(true)
      try {
        const detail = await loadModProject(selected)
        setExternalProject(detail)
        setActiveProjectPath(detail.summary.absolutePath)
        setStatusMessage(copy.externalProjectLoaded(detail.summary.name))
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setLoading(false)
      }
    }
    return selected
  }

  const openProjectArchive = async () => {
    const selected = await chooseModArchiveFile(copy.selectModArchive)
    if (!selected) return null
    setLoading(true)
    try {
      const detail = await inspectModArchive(selected)
      setExternalProject(detail)
      setActiveProjectPath(detail.summary.absolutePath)
      setStatusMessage(copy.externalProjectLoaded(detail.summary.name))
      return selected
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    projects: allProjects,
    filteredProjects,
    activeProjectPath,
    activeProject: allProjects.find((project) => project.absolutePath === activeProjectPath) ?? null,
    externalProject: externalProject?.summary.absolutePath === activeProjectPath ? externalProject : null,
    setActiveProjectPath,
    query,
    setQuery,
    contentPatcherOnly,
    setContentPatcherOnly,
    compatibleOnly,
    setCompatibleOnly,
    i18nOnly,
    setI18nOnly,
    statusMessage,
    loading,
    refresh,
    openProjectDirectory,
    openProjectArchive,
  }
}

export type ModCatalogState = ReturnType<typeof useModCatalog>
