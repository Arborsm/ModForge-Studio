import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAiTranslationBatches, parseAiFailure, useAi, type AiFailure } from '@entities/ai'
import { useNotificationCopy, useTranslationEditorCopy } from '@locales/provider'
import type { AiTranslationResultItem } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import type { TranslationEntry } from '../model/translationEditor'

const WORKBENCH_AI_NOTIFICATION_ID = 'workbench-ai-translation'

export type TranslationAiMode = 'current' | 'missing' | 'all'
export type TranslationAiBaseline = Pick<TranslationEntry, 'sourceText' | 'targetText'>

/** Separates safe AI results from entries edited or replaced while the request was running. */
export function partitionTranslationAiResults(
  values: ReadonlyMap<string, string>,
  baselines: ReadonlyMap<string, TranslationAiBaseline>,
  currentEntries: readonly TranslationEntry[],
) {
  const currentByKey = new Map(currentEntries.map((entry) => [entry.key, entry]))
  const applicable = new Map<string, string>()
  const conflicts: string[] = []
  for (const [key, value] of values) {
    const baseline = baselines.get(key)
    const current = currentByKey.get(key)
    if (!baseline || !current || current.sourceText !== baseline.sourceText || current.targetText !== baseline.targetText) {
      conflicts.push(key)
    } else {
      applicable.set(key, value)
    }
  }
  return { applicable, conflicts }
}

type TranslationAiProgress = {
  running: boolean
  completed: number
  total: number
  error: string | null
  failedKeys: string[]
}

type UseTranslationAiOptions = {
  activeEntry: TranslationEntry | null
  allEntries: TranslationEntry[]
  sourceLocale: string
  targetLocale: string
  contextKey: string
  applyResults: (values: ReadonlyMap<string, string>, baselines: ReadonlyMap<string, TranslationAiBaseline>) => string[]
}

/** Owns one workbench AI batch and applies only results whose source and draft baseline are still current. */
export function useTranslationAi({
  activeEntry,
  allEntries,
  sourceLocale,
  targetLocale,
  contextKey,
  applyResults,
}: UseTranslationAiOptions) {
  const ai = useAi()
  const copy = useTranslationEditorCopy()
  const notificationCopy = useNotificationCopy().ai
  const publishNotification = useNotificationPublisher()
  const activeJobs = useRef(new Set<string>())
  const operationRef = useRef(0)
  const ownerRef = useRef<number | null>(null)
  const applyResultsRef = useRef(applyResults)
  const runRef = useRef<(mode: TranslationAiMode) => Promise<void>>(async () => undefined)
  const [progress, setProgress] = useState<TranslationAiProgress>({
    running: false,
    completed: 0,
    total: 0,
    error: null,
    failedKeys: [],
  })

  applyResultsRef.current = applyResults

  const cancel = useCallback(() => {
    operationRef.current += 1
    ownerRef.current = null
    dismissNotification(WORKBENCH_AI_NOTIFICATION_ID)
    for (const jobId of activeJobs.current) void ai.cancelJob(jobId).catch(() => undefined)
    activeJobs.current.clear()
    setProgress((current) => ({ ...current, running: false }))
  }, [ai])

  useEffect(() => () => cancel(), [cancel, contextKey])

  const run = useCallback(
    async (mode: TranslationAiMode) => {
      if (ownerRef.current !== null) return
      if (mode === 'all' && !window.confirm(copy.aiTranslateAllConfirm)) return
      const selected =
        mode === 'current'
          ? activeEntry
            ? [activeEntry]
            : []
          : mode === 'missing'
            ? allEntries.filter((entry) => entry.status === 'missing')
            : allEntries
      if (!selected.length) return

      const operation = ++operationRef.current
      ownerRef.current = operation
      dismissNotification(WORKBENCH_AI_NOTIFICATION_ID)
      setProgress({ running: true, completed: 0, total: selected.length, error: null, failedKeys: [] })
      const ensureCurrent = () => {
        if (operation !== operationRef.current || ownerRef.current !== operation) {
          throw new Error('AI_ERROR::cancelled::AI translation context changed.')
        }
      }
      const guarded = async <T>(promise: Promise<T>) => {
        try {
          const result = await promise
          ensureCurrent()
          return result
        } catch (cause) {
          ensureCurrent()
          throw cause
        }
      }

      try {
        const settings = await guarded(ai.loadSettings())
        if (!settings.defaultProfileId) throw new Error('AI_ERROR::not-configured::No default AI profile is configured.')
        const plan = buildAiTranslationBatches(
          { profileId: settings.defaultProfileId, sourceLocale, targetLocale },
          selected.map((entry) => ({ id: entry.key, text: entry.sourceText, format: 'stardewI18n', context: entry.key })),
          `workbench-ai:${crypto.randomUUID()}`,
        )
        const baselines = new Map(selected.map((entry) => [entry.key, { sourceText: entry.sourceText, targetText: entry.targetText }]))
        const results: AiTranslationResultItem[] = []
        const failedKeys = new Set<string>()
        let lastFailure: AiFailure | null = null
        const originalId = (id: string) => id.split('\u0000', 1)[0]
        const execute = async (batch: (typeof plan.batches)[number]) => {
          activeJobs.current.add(batch.jobId)
          try {
            const result = await guarded(ai.translateBatch(batch))
            results.push(...result.items)
          } finally {
            activeJobs.current.delete(batch.jobId)
          }
        }

        for (const batch of plan.batches) {
          ensureCurrent()
          try {
            await execute(batch)
          } catch (cause) {
            const batchFailure = parseAiFailure(cause)
            if (batchFailure.code === 'cancelled') throw cause
            for (const [index, item] of batch.items.entries()) {
              ensureCurrent()
              try {
                await execute({ ...batch, jobId: `${batch.jobId}:retry:${index}`, items: [item] })
              } catch (itemCause) {
                lastFailure = parseAiFailure(itemCause)
                if (lastFailure.code === 'cancelled') throw itemCause
                failedKeys.add(originalId(item.id))
              }
            }
          }
          const completed = plan.mergeResults(results).length + failedKeys.size
          setProgress((current) => ({
            ...current,
            completed: Math.min(current.total, completed),
            error: failedKeys.size ? copy.aiPartialFailed(failedKeys.size) : null,
            failedKeys: [...failedKeys],
          }))
        }

        ensureCurrent()
        const values = new Map(plan.mergeResults(results).map((item) => [item.id, item.translatedText]))
        for (const key of applyResultsRef.current(values, baselines)) failedKeys.add(key)
        const completed = Math.min(selected.length, values.size + failedKeys.size)
        setProgress((current) => ({
          ...current,
          completed,
          error: failedKeys.size ? copy.aiPartialFailed(failedKeys.size) : null,
          failedKeys: [...failedKeys],
        }))
        if (failedKeys.size) {
          const providerFailure = lastFailure !== null
          const allFailed = failedKeys.size === selected.length && providerFailure
          publishNotification({
            id: WORKBENCH_AI_NOTIFICATION_ID,
            level: allFailed ? 'error' : 'warning',
            title: allFailed ? notificationCopy.translationFailedTitle : notificationCopy.partialTranslationFailedTitle,
            description: allFailed
              ? notificationCopy.failureDescriptions[lastFailure?.code ?? 'unknown']
              : notificationCopy.partialTranslationFailedDescription(failedKeys.size),
            action: { label: notificationCopy.retryAction, callback: () => runRef.current(mode), tone: 'primary' },
          })
        }
      } catch (cause) {
        const failure = parseAiFailure(cause)
        if (failure.code !== 'cancelled') {
          setProgress((current) => ({
            ...current,
            error: failure.code === 'not-configured' ? copy.aiNotConfigured : copy.aiFailed,
            failedKeys: [],
          }))
          publishNotification({
            id: WORKBENCH_AI_NOTIFICATION_ID,
            level: 'error',
            title: notificationCopy.translationFailedTitle,
            description: notificationCopy.failureDescriptions[failure.code],
            action: { label: notificationCopy.retryAction, callback: () => runRef.current(mode), tone: 'primary' },
          })
        }
      } finally {
        if (ownerRef.current === operation) {
          ownerRef.current = null
          setProgress((current) => ({ ...current, running: false }))
        }
      }
    },
    [
      activeEntry,
      ai,
      allEntries,
      copy.aiFailed,
      copy.aiNotConfigured,
      copy.aiPartialFailed,
      copy.aiTranslateAllConfirm,
      notificationCopy,
      publishNotification,
      sourceLocale,
      targetLocale,
    ],
  )

  runRef.current = run
  return { progress, run, cancel }
}
