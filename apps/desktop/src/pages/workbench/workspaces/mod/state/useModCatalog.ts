import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { GameDirectoryInfo } from '@entities/game/api'
import { scanModProjects, type ModProjectSummary } from '@entities/mod/api'
import { chooseDirectory } from '@platform/host'
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

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
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
    [compatibleOnly, contentPatcherOnly, deferredQuery, i18nOnly, mode, projects],
  )

  const chooseProjectDirectory = async () => {
    const selected = await chooseDirectory(copy.selectProjectFolder)
    if (selected) setActiveProjectPath(selected)
    return selected
  }

  return {
    projects,
    filteredProjects,
    activeProjectPath,
    activeProject: projects.find((project) => project.absolutePath === activeProjectPath) ?? null,
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
    chooseProjectDirectory,
  }
}

export type ModCatalogState = ReturnType<typeof useModCatalog>
