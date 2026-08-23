import { useCallback, useEffect, useRef, useState } from 'react'
import { loadModProject, saveModI18nFiles, type ContentPatcherI18nFile, type ModProjectDetail } from '@entities/mod/api'
import { defaultTargetLocaleForAppLocale, type TranslationStatusFilter } from '@features/translation-editor'
import { useLocale, useModCopy } from '@locales/provider'
import { appEvent } from '@platform/observability'
import { TaskCancelledError, useLatestTask, useTaskScope } from '@shared/lib/task-runtime'

type GuardedAction = () => void | Promise<void>

/** Owns one disk mod's i18n buffers, translation filters, save, and unsaved decisions. */
export function useModTranslationWorkspace(projectPath: string | null) {
  const copy = useModCopy()
  const appLocale = useLocale()
  const [detail, setDetail] = useState<ModProjectDetail | null>(null)
  const [files, setFilesState] = useState<ContentPatcherI18nFile[]>([])
  const [sourceLocale, setSourceLocale] = useState('default')
  const [targetLocale, setTargetLocale] = useState(() => defaultTargetLocaleForAppLocale(appLocale))
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TranslationStatusFilter>('all')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [pendingDecision, setPendingDecision] = useState<{ saving: boolean; error: string | null } | null>(null)
  const pendingActionRef = useRef<GuardedAction | null>(null)
  const projectPathRef = useRef(projectPath)
  const runLatestLoad = useLatestTask('mod-translation-load')
  const saveTaskScope = useTaskScope('mod-translation-save')
  projectPathRef.current = projectPath

  const reload = useCallback(async () => {
    if (!projectPath) {
      setLoading(false)
      setDetail(null)
      setFilesState([])
      setStatusMessage('')
      try {
        await runLatestLoad(async () => null)
      } catch (error) {
        if (!(error instanceof TaskCancelledError)) throw error
      }
      return
    }
    setLoading(true)
    try {
      await runLatestLoad(async (scope) => {
        const next = await loadModProject(projectPath)
        if (scope.isCurrent()) {
          setDetail(next)
          setFilesState(next.i18nFiles ?? [])
          setStatusMessage('')
          setLoading(false)
        }
        return next
      })
    } catch (error) {
      if (error instanceof TaskCancelledError) return
      setStatusMessage(error instanceof Error ? error.message : String(error))
      setLoading(false)
    }
  }, [projectPath, runLatestLoad])

  useEffect(() => {
    void reload()
  }, [reload])

  const dirty = (() => {
    const original = new Map((detail?.i18nFiles ?? []).map((file) => [file.locale, file.rawJson.trimEnd()]))
    if (original.size !== files.length) return true
    return files.some((file) => original.get(file.locale) !== file.rawJson.trimEnd())
  })()

  const setFiles = (next: ContentPatcherI18nFile[]) => {
    // A user edit discards an in-flight save's post-save state apply so the
    // refreshed disk content cannot clobber the newer edit; the save itself
    // still completes on the host.
    saveTaskScope.cancel()
    setFilesState(next)
  }

  const save = async () => {
    if (!projectPath || !detail) return null
    const original = new Map((detail.i18nFiles ?? []).map((file) => [file.locale, file.rawJson.trimEnd()]))
    const changed = files.filter((file) => original.get(file.locale) !== file.rawJson.trimEnd())
    try {
      return await saveTaskScope.runtime.exclusiveMutation(`mod-translation-save:${projectPath}`, async (scope) => {
        saveTaskScope.capture(scope)
        const result = await saveModI18nFiles({
          sourcePath: projectPath,
          i18nFiles: changed.map(({ locale, rawJson }) => ({ locale, rawJson })),
        })
        const refreshed = await loadModProject(projectPath)
        if (scope.isCurrent() && projectPathRef.current === projectPath) {
          setDetail(refreshed)
          setFilesState(refreshed.i18nFiles ?? [])
          setStatusMessage(copy.saveSuccess(result.sourcePath))
        }
        return result
      })
    } catch (error) {
      if (error instanceof TaskCancelledError) return null
      const message = error instanceof Error ? error.message : String(error)
      if (projectPathRef.current === projectPath) setStatusMessage(message)
      appEvent('error', copy.saveFailed).description(message).emit({ log: false })
      throw error
    }
  }

  const requestUnsavedDecision = async (action: GuardedAction) => {
    if (!dirty) {
      await action()
      return true
    }
    pendingActionRef.current = action
    setPendingDecision({ saving: false, error: null })
    return false
  }

  const confirmSaveAndContinue = async () => {
    const action = pendingActionRef.current
    if (!action) return setPendingDecision(null)
    setPendingDecision({ saving: true, error: null })
    try {
      await save()
      pendingActionRef.current = null
      setPendingDecision(null)
      await action()
    } catch (error) {
      setPendingDecision({ saving: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const confirmDiscardAndContinue = async () => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    setPendingDecision(null)
    if (detail) setFilesState(detail.i18nFiles ?? [])
    if (action) await action()
  }

  const cancelDecision = () => {
    pendingActionRef.current = null
    setPendingDecision(null)
  }

  return {
    detail,
    files,
    setFiles,
    sourceLocale,
    setSourceLocale,
    targetLocale,
    setTargetLocale,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    dirty,
    canPersist: Boolean(detail),
    loading,
    statusMessage,
    save,
    reload,
    pendingDecision,
    requestUnsavedDecision,
    confirmSaveAndContinue,
    confirmDiscardAndContinue,
    cancelDecision,
  }
}
