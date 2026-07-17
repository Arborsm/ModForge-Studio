import { useEffect, useRef, useState } from 'react'
import { BUILTIN_SEMANTIC_MODEL_ID, useLocalization } from '@entities/localization'
import { useTranslationEditorCopy } from '@locales/provider'
import type {
  AiOfficialCorpusStatus,
  AiOfficialIndexProgress,
  AiSemanticModelStatus,
  AiSemanticProgress,
  AiSemanticSearchMode,
} from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'

const NOTIFICATION_ID = 'translation-editor-corpus-readiness'

/**
 * Tracks official corpus index and semantic model readiness for the active game
 * directory and runs the banner's build/download actions. Readiness is
 * re-inspected after each action; action failures surface as notifications.
 */
export function useCorpusReadiness(gameDirectory: string | null | undefined) {
  const localization = useLocalization()
  const copy = useTranslationEditorCopy()
  const publish = useNotificationPublisher()
  const [corpusStatus, setCorpusStatus] = useState<AiOfficialCorpusStatus | null>(null)
  const [modelStatus, setModelStatus] = useState<AiSemanticModelStatus | null>(null)
  const [semanticMode, setSemanticMode] = useState<AiSemanticSearchMode | null>(null)
  const [corpusInspected, setCorpusInspected] = useState(false)
  const [semanticInspected, setSemanticInspected] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState<AiOfficialIndexProgress | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<AiSemanticProgress | null>(null)
  const [inspectionRevision, setInspectionRevision] = useState(0)
  const activeBuildJob = useRef<string | null>(null)
  const activeDownloadJob = useRef<string | null>(null)
  const retryRef = useRef<() => void>(() => {})
  const runInspect = useLatestTask('translation-editor-corpus-inspect')

  // A stale generation remains queryable and safe to use. It only means the
  // current game files have changes that are not reflected in the index yet.
  const corpusReady = Boolean(corpusStatus?.indexed)
  const modelDownloaded = Boolean(modelStatus?.downloaded)
  const semanticReady = semanticMode === 'lexical' || Boolean(modelStatus?.available)

  const fail = (retry: () => void) => {
    retryRef.current = retry
    publish({
      id: NOTIFICATION_ID,
      level: 'error',
      title: copy.corpusReminderFailed,
      description: copy.corpusReminderFailed,
      action: { label: copy.retry, callback: () => retryRef.current(), tone: 'primary' },
    })
  }

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void localization
      .listenOfficialIndexProgress((progress) => {
        if (active && progress.jobId === activeBuildJob.current) setBuildProgress(progress)
      })
      .then((dispose) => {
        if (active) unlisten = dispose
        else dispose()
      })
      .catch(() => undefined)
    return () => {
      active = false
      unlisten?.()
    }
  }, [localization])

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void localization
      .listenSemanticProgress((progress) => {
        if (active && progress.jobId === activeDownloadJob.current) setDownloadProgress(progress)
      })
      .then((dispose) => {
        if (active) unlisten = dispose
        else dispose()
      })
      .catch(() => undefined)
    return () => {
      active = false
      unlisten?.()
    }
  }, [localization])

  useEffect(() => {
    if (!gameDirectory) {
      setCorpusStatus(null)
      setModelStatus(null)
      setSemanticMode(null)
      setCorpusInspected(false)
      setSemanticInspected(false)
      return
    }
    void runInspect(async (task) => {
      setCorpusInspected(false)
      setSemanticInspected(false)
      const [corpusResult, semanticResult] = await Promise.allSettled([
        localization.inspectOfficialIndex(gameDirectory),
        localization.loadSemanticSettings().then(async (settings) => ({
          settings,
          model: settings.mode === 'lexical' ? null : await localization.inspectSemanticModel(),
        })),
      ])
      if (!task.isCurrent()) return
      if (corpusResult.status === 'fulfilled') {
        setCorpusStatus(corpusResult.value)
        setCorpusInspected(true)
      }
      if (semanticResult.status === 'fulfilled') {
        setSemanticMode(semanticResult.value.settings.mode)
        setModelStatus(semanticResult.value.model)
        setSemanticInspected(true)
      }
      const complete = corpusResult.status === 'fulfilled' && semanticResult.status === 'fulfilled'
      if (!complete) fail(() => setInspectionRevision((value) => value + 1))
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        setCorpusInspected(false)
        setSemanticInspected(false)
        fail(() => setInspectionRevision((value) => value + 1))
      }
    })
  }, [gameDirectory, inspectionRevision, localization, runInspect])

  useEffect(() => () => dismissNotification(NOTIFICATION_ID), [])

  const buildIndex = async () => {
    if (!gameDirectory || building) return
    const jobId = crypto.randomUUID()
    activeBuildJob.current = jobId
    setBuilding(true)
    setBuildProgress(null)
    dismissNotification(NOTIFICATION_ID)
    try {
      setCorpusStatus(await localization.rebuildOfficialIndex({ jobId, gameDirectory }))
    } catch {
      fail(() => void buildIndex())
    } finally {
      activeBuildJob.current = null
      setBuilding(false)
      setBuildProgress(null)
    }
  }

  const downloadModel = async () => {
    if (downloading) return
    const jobId = crypto.randomUUID()
    activeDownloadJob.current = jobId
    setDownloading(true)
    setDownloadProgress(null)
    dismissNotification(NOTIFICATION_ID)
    try {
      setModelStatus(await localization.downloadSemanticModel({ jobId, modelId: BUILTIN_SEMANTIC_MODEL_ID }))
    } catch {
      fail(() => void downloadModel())
    } finally {
      activeDownloadJob.current = null
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  return {
    visible: Boolean(gameDirectory) && !dismissed && ((corpusInspected && !corpusReady) || (semanticInspected && !semanticReady)),
    corpusInspected,
    semanticInspected,
    corpusReady,
    corpusStale: Boolean(corpusStatus?.stale),
    modelDownloaded,
    semanticMode,
    semanticReady,
    dismissed,
    dismiss: () => setDismissed(true),
    building,
    buildProgress,
    downloading,
    downloadProgress,
    buildIndex,
    downloadModel,
  }
}

export type CorpusReadiness = ReturnType<typeof useCorpusReadiness>
