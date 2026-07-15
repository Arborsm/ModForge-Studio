import { useEffect, useRef, useState } from 'react'
import { detectDefaultGameDirectory, listKnownGameDirectories } from '@entities/game/api'
import { useLocalization } from '@entities/localization'
import { useAiLocalizationCopy } from '@locales/provider'
import type { AiOfficialCorpusStatus, AiOfficialIndexProgress, AiOfficialUnit } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { useAiLocalizationPersistentState } from './localizationPageState'

const NOTICE_ID = 'ai-localization-official-error'

export function useAiLocalizationPage() {
  const localization = useLocalization()
  const copy = useAiLocalizationCopy()
  const publish = useNotificationPublisher()
  const [directories, setDirectories] = useState<string[]>([])
  const [gameDirectory, setGameDirectory] = useState('')
  const [status, setStatus] = useState<AiOfficialCorpusStatus | null>(null)
  const [official, setOfficial] = useAiLocalizationPersistentState(
    'official',
    {
      sourceLocale: 'en-US',
      targetLocale: 'zh-CN',
      query: '',
      assetCategory: null as string | null,
      unitKind: null as string | null,
      promptOnly: false,
    },
    (
      value,
    ): value is {
      sourceLocale: string
      targetLocale: string
      query: string
      assetCategory: string | null
      unitKind: string | null
      promptOnly: boolean
    } =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).sourceLocale === 'string' &&
      typeof (value as Record<string, unknown>).targetLocale === 'string' &&
      typeof (value as Record<string, unknown>).query === 'string' &&
      ((value as Record<string, unknown>).assetCategory === null || typeof (value as Record<string, unknown>).assetCategory === 'string') &&
      ((value as Record<string, unknown>).unitKind === null || typeof (value as Record<string, unknown>).unitKind === 'string') &&
      typeof (value as Record<string, unknown>).promptOnly === 'boolean',
  )
  const { sourceLocale, targetLocale, query, assetCategory, unitKind, promptOnly } = official
  const [records, setRecords] = useState<AiOfficialUnit[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [selected, setSelected] = useState<AiOfficialUnit | null>(null)
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState<AiOfficialIndexProgress | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeJobId = useRef<string | null>(null)
  const cancelledJobId = useRef<string | null>(null)
  const retryRef = useRef<() => void>(() => {})
  const runDirectoryLoad = useLatestTask('ai-localization-game-directories')
  const runInspect = useLatestTask('ai-localization-official-inspect')
  const runSearch = useLatestTask('ai-localization-official-search')
  const fail = (title: string, retry: () => void) => {
    setError(title)
    retryRef.current = retry
    publish({
      id: NOTICE_ID,
      level: 'error',
      title,
      description: title,
      action: { label: copy.retry, callback: () => retryRef.current(), tone: 'primary' },
    })
  }
  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void localization
      .listenOfficialIndexProgress((progress) => {
        if (active && progress.jobId === activeJobId.current) setIndexProgress(progress)
      })
      .then((dispose) => {
        if (active) unlisten = dispose
        else dispose()
      })
      .catch(() => {
        if (active) fail(copy.loadError, () => window.location.reload())
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [localization])
  const inspect = async (path = gameDirectory) => {
    if (!path) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      await runInspect(async (task) => {
        const next = await localization.inspectOfficialIndex(path)
        if (task.isCurrent()) {
          setStatus(next)
          setError(null)
          setLoading(false)
        }
      })
    } catch (error) {
      if (!(error instanceof TaskCancelledError)) {
        setLoading(false)
        fail(copy.loadError, () => void inspect(path))
      }
    }
  }
  useEffect(() => {
    void runDirectoryLoad(async (task) => {
      const [known, detected] = await Promise.all([listKnownGameDirectories(), detectDefaultGameDirectory()])
      if (task.isCurrent()) {
        const values = [...new Set([...(detected ? [detected] : []), ...known])]
        setDirectories(values)
        const path = values[0] ?? ''
        setGameDirectory(path)
        await inspect(path)
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        setLoading(false)
        fail(copy.loadError, () => window.location.reload())
      }
    })
    return () => {
      const jobId = activeJobId.current
      if (jobId) void localization.cancelJob(jobId).catch(() => undefined)
      dismissNotification(NOTICE_ID)
    }
  }, [])
  const rebuild = async () => {
    if (!gameDirectory) return
    const jobId = `official-index:${crypto.randomUUID()}`
    activeJobId.current = jobId
    cancelledJobId.current = null
    setIndexing(true)
    setIndexProgress(null)
    setError(null)
    try {
      const next = await localization.rebuildOfficialIndex({ jobId, gameDirectory })
      setStatus(next)
    } catch {
      if (cancelledJobId.current !== jobId) fail(copy.indexError, () => void rebuild())
    } finally {
      activeJobId.current = null
      setIndexing(false)
      setIndexProgress(null)
    }
  }
  const chooseGameDirectory = async () => {
    try {
      const path = await localization.chooseGameDirectory()
      if (!path) return
      setDirectories((current) => [...new Set([path, ...current])])
      setGameDirectory(path)
      await inspect(path)
    } catch {
      fail(copy.loadError, () => void chooseGameDirectory())
    }
  }
  const cancel = async () => {
    if (activeJobId.current) {
      cancelledJobId.current = activeJobId.current
      await localization.cancelJob(activeJobId.current)
    }
  }
  const search = async () => {
    if (!status?.indexed || status.stale || !query.trim()) {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      await runSearch(async (task) => {
        const page = await localization.searchOfficial({
          sourceLocale,
          targetLocale,
          query: query.trim(),
          assetCategory,
          unitKind,
          promptEligibleOnly: promptOnly,
          offset: 0,
          limit: 100,
        })
        if (task.isCurrent()) {
          setRecords(page.records)
          setHasSearched(true)
          setSelected((current) => page.records.find((row) => row.id === current?.id) ?? page.records[0] ?? null)
          setError(null)
          setSearching(false)
        }
      })
    } catch (error) {
      if (!(error instanceof TaskCancelledError)) {
        setSearching(false)
        fail(copy.searchError, () => void search())
      }
    }
  }
  return {
    copy,
    directories,
    gameDirectory,
    setGameDirectory: (path: string) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setGameDirectory(path)
      void inspect(path)
    },
    chooseGameDirectory,
    status,
    sourceLocale,
    setSourceLocale: (value: string) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setOfficial((current) => ({ ...current, sourceLocale: value }))
    },
    targetLocale,
    setTargetLocale: (value: string) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setOfficial((current) => ({ ...current, targetLocale: value }))
    },
    query,
    setQuery: (value: string) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setOfficial((current) => ({ ...current, query: value }))
    },
    unitKind,
    setUnitKind: (value: string | null) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setOfficial((current) => ({ ...current, unitKind: value }))
    },
    assetCategory,
    setAssetCategory: (value: string | null) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setOfficial((current) => ({ ...current, assetCategory: value }))
    },
    promptOnly,
    setPromptOnly: (value: boolean) => {
      setRecords([])
      setSelected(null)
      setHasSearched(false)
      setOfficial((current) => ({ ...current, promptOnly: value }))
    },
    hasSearched,
    records,
    selected,
    setSelected,
    loading,
    indexing,
    indexProgress,
    searching,
    error,
    rebuild,
    cancel,
    search,
  }
}
