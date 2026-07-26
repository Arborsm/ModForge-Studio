import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAiTranslationBatches, parseAiFailure, type AiFailure } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useTranslationEditorCopy } from '@locales/provider'
import type { AiTranslationItem, AiTranslationResultItem, KnowledgePolicy, LocalizationEngineRef } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import type { TranslationEntry } from './translationEditor'
import { planStardewTranslationItems } from './stardewTranslationBatch'

const WORKBENCH_AI_NOTIFICATION_ID = 'workbench-ai-translation'
const WORKBENCH_AI_USAGE_NOTIFICATION_ID = 'workbench-ai-translation-usage'

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
  warning: string | null
  warningKeys: string[]
}

type UseLocalizationTranslationOptions = {
  activeEntry: TranslationEntry | null
  allEntries: TranslationEntry[]
  sourceLocale: string
  targetLocale: string
  contextKey: string
  knowledgePolicy?: KnowledgePolicy
  scopeId?: string | null
  engineRef: LocalizationEngineRef | null
  applyResults: (values: ReadonlyMap<string, string>, baselines: ReadonlyMap<string, TranslationAiBaseline>) => string[]
}

/** Owns one workbench AI batch and applies only results whose source and draft baseline are still current. */
export function useLocalizationTranslation({
  activeEntry,
  allEntries,
  sourceLocale,
  targetLocale,
  contextKey,
  knowledgePolicy = { enabled: false, useOfficialCorpus: false, useGlobalKnowledge: false, useProfileKnowledge: false },
  scopeId = null,
  engineRef,
  applyResults,
}: UseLocalizationTranslationOptions) {
  const localization = useLocalization()
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
    warning: null,
    warningKeys: [],
  })

  applyResultsRef.current = applyResults

  const cancel = useCallback(() => {
    operationRef.current += 1
    ownerRef.current = null
    dismissNotification(WORKBENCH_AI_NOTIFICATION_ID)
    dismissNotification(WORKBENCH_AI_USAGE_NOTIFICATION_ID)
    for (const jobId of activeJobs.current) {
      void localization.cancelJob(jobId).catch(() => undefined)
    }
    activeJobs.current.clear()
    setProgress((current) => ({ ...current, running: false }))
  }, [localization])

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
      setProgress({ running: true, completed: 0, total: selected.length, error: null, failedKeys: [], warning: null, warningKeys: [] })
      const publishRunning = (completed: number) => {
        publishNotification({
          id: WORKBENCH_AI_NOTIFICATION_ID,
          level: 'info',
          title: copy.aiTranslating(completed, selected.length),
          description: copy.aiTranslating(completed, selected.length),
          autoDismissMs: null,
          loading: true,
          progress: selected.length > 0 ? (completed / selected.length) * 100 : 0,
          action: { label: copy.aiCancel, callback: cancel, tone: 'primary' },
        })
      }
      publishRunning(0)
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
        let selectedEngine = engineRef
        if (!selectedEngine) selectedEngine = await guarded(localization.loadDefaultEngine())
        if (!selectedEngine) throw new Error('AI_ERROR::not-configured::No translation engine is configured.')
        const originalSourceItems: AiTranslationItem[] = selected.map((entry) => ({
          id: entry.key,
          text: entry.sourceText,
          format: 'stardewI18n',
          context: entry.key,
        }))
        const stardewPlan = planStardewTranslationItems(originalSourceItems)
        const sourceItems = stardewPlan.items
        const rootJobId = `workbench-localization:${crypto.randomUUID()}`
        let batches: (typeof sourceItems)[] = []
        let mergeBatchResults = (items: AiTranslationResultItem[]) => items
        if (selectedEngine.kind === 'generative-ai') {
          const plan = buildAiTranslationBatches(
            {
              profileId: selectedEngine.profileId,
              sourceLocale,
              targetLocale,
              usageContext: { pageSource: 'workbench-translation', operation: 'translate', ...(scopeId ? { scopeId } : {}) },
              knowledgePolicy,
            },
            sourceItems,
            rootJobId,
          )
          batches = plan.batches.map((batch) => batch.items)
          mergeBatchResults = plan.mergeResults
        } else {
          const settings = await guarded(localization.loadMachineTranslationSettings())
          const profile = settings.profiles.find((value) => value.id === selectedEngine.profileId)
          const preset = settings.presets.find((value) => value.id === profile?.presetId)
          if (!profile || !preset) throw new Error('AI_ERROR::not-configured::The selected machine translation profile does not exist.')
          let current: typeof sourceItems = []
          let characters = 0
          for (const item of sourceItems) {
            const count = Array.from(item.text).length
            if (current.length && characters + count > preset.capability.maxBatchCharacters) {
              batches.push(current)
              current = []
              characters = 0
            }
            current.push(item)
            characters += count
          }
          if (current.length) batches.push(current)
        }
        const baselines = new Map(selected.map((entry) => [entry.key, { sourceText: entry.sourceText, targetText: entry.targetText }]))
        const results: AiTranslationResultItem[] = []
        const failedKeys = new Set<string>()
        const warningKeys = new Set<string>()
        let lastFailure: AiFailure | null = null
        let usageRecordFailed = false
        const originalId = (id: string) => stardewPlan.originalId(id.split('\u0000', 1)[0] ?? id)
        const execute = async (items: typeof sourceItems, jobId: string) => {
          activeJobs.current.add(jobId)
          try {
            const result = await guarded(
              localization.translateBatch({
                jobId,
                engine: selectedEngine,
                sourceLocale,
                targetLocale,
                items,
                usageContext: { pageSource: 'workbench-translation', operation: 'translate', ...(scopeId ? { scopeId } : {}) },
                knowledgePolicy,
              }),
            )
            usageRecordFailed ||= result.usageRecordState === 'failed'
            results.push(...result.items)
            for (const issue of result.validationIssues) warningKeys.add(originalId(issue.itemId))
          } finally {
            activeJobs.current.delete(jobId)
          }
        }

        for (const [batchIndex, batch] of batches.entries()) {
          const batchJobId = `${rootJobId}:${batchIndex}`
          ensureCurrent()
          try {
            await execute(batch, batchJobId)
          } catch (cause) {
            const batchFailure = parseAiFailure(cause)
            if (batchFailure.code === 'cancelled') throw cause
            for (const [index, item] of batch.entries()) {
              ensureCurrent()
              try {
                await execute([item], `${batchJobId}:retry:${index}`)
              } catch (itemCause) {
                lastFailure = parseAiFailure(itemCause)
                if (lastFailure.code === 'cancelled') throw itemCause
                failedKeys.add(originalId(item.id))
              }
            }
          }
          const completed = stardewPlan.mergeResults(mergeBatchResults(results)).length + failedKeys.size
          publishRunning(Math.min(selected.length, completed))
          setProgress((current) => ({
            ...current,
            completed: Math.min(current.total, completed),
            error: failedKeys.size ? copy.aiPartialFailed(failedKeys.size) : null,
            failedKeys: [...failedKeys],
            warning: warningKeys.size ? copy.aiValidationWarnings(warningKeys.size) : null,
            warningKeys: [...warningKeys],
          }))
        }

        ensureCurrent()
        const values = new Map(stardewPlan.mergeResults(mergeBatchResults(results)).map((item) => [item.id, item.translatedText]))
        for (const key of applyResultsRef.current(values, baselines)) failedKeys.add(key)
        const completed = Math.min(selected.length, values.size + failedKeys.size)
        setProgress((current) => ({
          ...current,
          completed,
          error: failedKeys.size ? copy.aiPartialFailed(failedKeys.size) : null,
          failedKeys: [...failedKeys],
          warning: warningKeys.size ? copy.aiValidationWarnings(warningKeys.size) : null,
          warningKeys: [...warningKeys],
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
        } else if (warningKeys.size) {
          publishNotification({
            id: WORKBENCH_AI_NOTIFICATION_ID,
            level: 'warning',
            title: copy.aiValidationWarningTitle,
            description: copy.aiValidationWarnings(warningKeys.size),
          })
        } else {
          dismissNotification(WORKBENCH_AI_NOTIFICATION_ID)
        }
        if (usageRecordFailed) {
          publishNotification({
            id: WORKBENCH_AI_USAGE_NOTIFICATION_ID,
            level: 'warning',
            title: notificationCopy.usageRecordFailedTitle,
            description: notificationCopy.usageRecordFailedDescription,
          })
        }
      } catch (cause) {
        const failure = parseAiFailure(cause)
        if (failure.code !== 'cancelled') {
          setProgress((current) => ({
            ...current,
            error: failure.code === 'not-configured' ? copy.aiNotConfigured : copy.aiFailed,
            failedKeys: [],
            warning: null,
            warningKeys: [],
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
      allEntries,
      engineRef,
      knowledgePolicy,
      localization,
      copy.aiFailed,
      copy.aiCancel,
      copy.aiNotConfigured,
      copy.aiPartialFailed,
      copy.aiTranslating,
      copy.aiTranslateAllConfirm,
      copy.aiValidationWarningTitle,
      copy.aiValidationWarnings,
      notificationCopy,
      publishNotification,
      scopeId,
      sourceLocale,
      targetLocale,
      cancel,
    ],
  )

  runRef.current = run
  return { progress, run, cancel }
}
