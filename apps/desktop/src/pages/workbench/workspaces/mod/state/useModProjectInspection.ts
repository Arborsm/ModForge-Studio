import { useEffect, useState } from 'react'
import { loadModProject, type ModProjectDetail } from '@entities/mod/api'
import { summarizeContentPatcherContent } from '../mods/content-patcher/content-model/contentPatcher'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'

/** Loads immutable manifest/content summaries and diagnostics for a selected disk mod. */
export function useModProjectInspection(projectPath: string | null, providedDetail: ModProjectDetail | null = null) {
  const [detail, setDetail] = useState<ModProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runLatestInspection = useLatestTask('mod-project-inspection')

  useEffect(() => {
    if (providedDetail && providedDetail.summary.absolutePath === projectPath) {
      void runLatestInspection(async () => providedDetail)
      setDetail(providedDetail)
      setError(null)
      setLoading(false)
      return
    }
    if (!projectPath) {
      void runLatestInspection(async () => null)
      setDetail(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void runLatestInspection(async (scope) => {
      const next = await loadModProject(projectPath)
      if (scope.isCurrent()) {
        setDetail(next)
        setLoading(false)
      }
      return next
    }).catch((reason) => {
      if (!(reason instanceof TaskCancelledError)) {
        setDetail(null)
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      }
    })
  }, [projectPath, providedDetail, runLatestInspection])

  const contentSummary = (() => {
    const raw = detail?.contentPatcher?.contentJson
    if (!raw) return null
    try {
      return summarizeContentPatcherContent(JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  })()

  return {
    detail,
    loading,
    error,
    diagnostics: detail?.diagnostics ?? [],
    contentSummary,
  }
}
