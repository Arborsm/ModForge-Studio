import { useCallback, useEffect, useRef, useState } from 'react'
import { loadModProject, saveModI18nFiles, type ContentPatcherI18nFile, type ModProjectDetail } from '@entities/mod/api'
import { defaultTargetLocaleForAppLocale, type TranslationStatusFilter } from '@features/translation-editor'
import { useLocale, useModCopy } from '@locales/provider'
import { reportAppEvent } from '@platform/observability'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'

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
  const editVersionRef = useRef(0)
  const projectPathRef = useRef(projectPath)
  const loadGenerationRef = useRef(0)
  const runLatestLoad = useLatestTask('mod-translation-load')
  projectPathRef.current = projectPath

  const reload = useCallback(async () => {
    const generation = ++loadGenerationRef.current
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
        if (scope.isCurrent() && loadGenerationRef.current === generation) {
          setDetail(next)
          setFilesState(next.i18nFiles ?? [])
          editVersionRef.current = 0
          setStatusMessage('')
          if (loadGenerationRef.current === generation) setLoading(false)
        }
        return next
      })
    } catch (error) {
      if (error instanceof TaskCancelledError) {
        if (loadGenerationRef.current === generation) setLoading(false)
        return
      }
      setStatusMessage(error instanceof Error ? error.message : String(error))
      if (loadGenerationRef.current === generation) setLoading(false)
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
    editVersionRef.current += 1
    setFilesState(next)
  }

  const save = async () => {
    if (!projectPath || !detail) return null
    const original = new Map((detail.i18nFiles ?? []).map((file) => [file.locale, file.rawJson.trimEnd()]))
    const changed = files.filter((file) => original.get(file.locale) !== file.rawJson.trimEnd())
    const version = editVersionRef.current
    const loadGeneration = loadGenerationRef.current
    try {
      const result = await saveModI18nFiles({
        sourcePath: projectPath,
        i18nFiles: changed.map(({ locale, rawJson }) => ({ locale, rawJson })),
      })
      const refreshed = await loadModProject(projectPath)
      if (projectPathRef.current === projectPath && loadGenerationRef.current === loadGeneration && editVersionRef.current === version) {
        setDetail(refreshed)
        setFilesState(refreshed.i18nFiles ?? [])
        editVersionRef.current = 0
        setStatusMessage(copy.saveSuccess(result.sourcePath))
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (projectPathRef.current === projectPath && loadGenerationRef.current === loadGeneration) setStatusMessage(message)
      reportAppEvent({
        level: 'error',
        title: copy.saveFailed,
        description: message,
        keyValues: { source: 'mod-translation', operation: 'save-i18n', sourcePath: projectPath },
      })
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
