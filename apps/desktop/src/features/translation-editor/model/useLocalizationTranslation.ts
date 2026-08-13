import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendTranslationStreamDelta,
  buildAiTranslationBatches,
  buildPlaceholderSentinelMap,
  createStreamCommitThrottle,
  extractCompletedTranslationItems,
  parseAiFailure,
  restorePlaceholderSentinels,
  uniqueOriginalItemIds,
  useAi,
  EMPTY_TRANSLATION_STREAM,
  type AiFailure,
  type TranslationStreamAccumulator,
} from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useTranslationEditorCopy } from '@locales/provider'
import type {
  AiTranslationItem,
  AiTranslationResultItem,
  AiTranslationStreamPayload,
  KnowledgePolicy,
  LocalizationEngineRef,
} from '@shared/contracts'
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

export type WorkbenchStreamCommit = {
  /** Per-entry preview values keyed by original entry key; null when no new items completed. */
  preview: ReadonlyMap<string, string> | null
  /** Number of unique original entry ids completed in the accumulated content so far. */
  completedCount: number
}

/**
 * Turns one job's accumulated stream content into a per-entry preview commit.
 *
 * Streaming providers emit the batch result as one JSON document, so completed
 * items are extracted as soon as their objects close (`extractCompletedTranslationItems`).
 * The wire carries sentinel tokens (`⟦N⟧`) instead of placeholders, so each
 * completed item is restored against its source-token map before merging
 * (`sentinelByItemId`, built by `buildPlaceholderSentinelMap` from the same
 * sent items the backend derives its mapping from). Item ids may carry
 * text-node (`\u0000stardew:`) and oversized-chunk (`\u0000N`) suffixes;
 * `mergeResults` reassembles those back into complete entry values (entries
 * whose parts are still streaming simply do not appear), and `originalId` maps
 * any remaining suffixed id back to the entry key. `previousCompletedCount`
 * gates the commit so identical accumulations never re-render.
 */
export function resolveWorkbenchStreamCommit(
  accumulatedContent: string,
  previousCompletedCount: number,
  originalId: (id: string) => string,
  mergeResults: (items: AiTranslationResultItem[]) => AiTranslationResultItem[],
  sentinelByItemId: ReadonlyMap<string, readonly string[]> | null = null,
): WorkbenchStreamCommit {
  const completed = extractCompletedTranslationItems(accumulatedContent)
  const completedCount = uniqueOriginalItemIds(completed.map((item) => item.id)).length
  if (completedCount <= previousCompletedCount) {
    return { preview: null, completedCount: previousCompletedCount }
  }
  const restored = sentinelByItemId
    ? completed.map((item) => {
        const tokens = sentinelByItemId.get(item.id)
        if (!tokens) return item
        return { ...item, translatedText: restorePlaceholderSentinels(item.translatedText, tokens).text }
      })
    : completed
  const preview = new Map<string, string>()
  for (const item of mergeResults(restored)) {
    preview.set(originalId(item.id), item.translatedText)
  }
  return { preview, completedCount }
}

/** Context captured for the currently streaming workbench job so late deltas render partial entries. */
type WorkbenchStreamingContext = {
  jobId: string
  operation: number
  totalEntries: number
  originalId: (id: string) => string
  mergeResults: (items: AiTranslationResultItem[]) => AiTranslationResultItem[]
  /** Per-sent-item placeholder tokens (wire `⟦N⟧` → source placeholder). */
  sentinelByItemId: ReadonlyMap<string, readonly string[]>
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
    warning: null,
    warningKeys: [],
  })
  // Per-entry translations rendered while streaming batches generate; replaced
  // by the fully validated results when the whole operation settles.
  const [streamingValues, setStreamingValues] = useState<ReadonlyMap<string, string> | null>(null)
  // Streaming accumulation for the currently active job; previews accumulate
  // across batches of one operation so earlier entries keep their partial text
  // until the final structured result replaces them.
  const streamingRef = useRef<WorkbenchStreamingContext | null>(null)
  const streamAccumulatorRef = useRef<TranslationStreamAccumulator>(EMPTY_TRANSLATION_STREAM)
  const streamCompletedCountRef = useRef(0)
  const overallCompletedRef = useRef(0)

  applyResultsRef.current = applyResults

  const cancel = useCallback(() => {
    operationRef.current += 1
    ownerRef.current = null
    streamingRef.current = null
    streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
    streamCompletedCountRef.current = 0
    overallCompletedRef.current = 0
    setStreamingValues(null)
    dismissNotification(WORKBENCH_AI_NOTIFICATION_ID)
    dismissNotification(WORKBENCH_AI_USAGE_NOTIFICATION_ID)
    for (const jobId of activeJobs.current) {
      void localization.cancelJob(jobId).catch(() => undefined)
    }
    activeJobs.current.clear()
    setProgress((current) => ({ ...current, running: false }))
  }, [localization])

  useEffect(() => () => cancel(), [cancel, contextKey])

  // 流式订阅：按 jobId + operation 双保险过滤，过期/错位 delta 一律丢弃。
  // 订阅在挂载期建立一次，所有状态通过 ref 读取，避免与 run 的竞态管理冲突。
  // 思考链 delta 只累积不渲染（工作台没有思考链控件），但绝不能报错。
  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    // 高频 content delta 经尾沿节流（80ms）合并后统一提交渲染：提交粒度即
    // 单条目渐入/进度的一个 tick，避免每个 delta 触发一次整段重渲染。
    const throttle = createStreamCommitThrottle(() => {
      if (disposed) return
      const active = streamingRef.current
      if (!active || active.operation !== operationRef.current) return
      const commit = resolveWorkbenchStreamCommit(
        streamAccumulatorRef.current.content,
        streamCompletedCountRef.current,
        active.originalId,
        active.mergeResults,
        active.sentinelByItemId,
      )
      if (commit.preview === null) return
      const { preview } = commit
      streamCompletedCountRef.current = commit.completedCount
      setStreamingValues((current) => new Map([...(current ?? []), ...preview]))
      const completed = Math.min(active.totalEntries, overallCompletedRef.current + commit.completedCount)
      setProgress((current) => ({ ...current, completed }))
    }, 80)
    void ai
      .listenToStream((payload: AiTranslationStreamPayload) => {
        if (disposed) return
        const active = streamingRef.current
        if (!active || active.jobId !== payload.jobId || active.operation !== operationRef.current) {
          return
        }
        streamAccumulatorRef.current = appendTranslationStreamDelta(streamAccumulatorRef.current, payload)
        if (payload.kind === 'reasoning') return
        throttle.schedule()
      })
      .then((unlisten) => {
        if (disposed) unlisten()
        else dispose = unlisten
      })
    return () => {
      disposed = true
      throttle.dispose()
      dispose?.()
    }
  }, [ai])

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
      streamingRef.current = null
      streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
      streamCompletedCountRef.current = 0
      overallCompletedRef.current = 0
      setStreamingValues(new Map())
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
        let aiProfileMaxBatchBytes: number | null = null
        if (selectedEngine.kind === 'generative-ai') {
          // Resolve the profile's explicit context window so batches budget
          // against it; the builder falls back to model metadata / safe default.
          const aiSettings = await guarded(ai.loadSettings())
          const profile = aiSettings.profiles.find((value) => value.id === selectedEngine.profileId)
          aiProfileMaxBatchBytes = profile?.maxBatchBytes ?? null
          const plan = buildAiTranslationBatches(
            {
              profileId: selectedEngine.profileId,
              sourceLocale,
              targetLocale,
              usageContext: { pageSource: 'workbench-translation', operation: 'translate', ...(scopeId ? { scopeId } : {}) },
              knowledgePolicy,
              maxBatchBytes: aiProfileMaxBatchBytes,
            },
            sourceItems,
            rootJobId,
            { contextWindowTokens: profile?.contextWindowTokens ?? null, maxBatchBytes: aiProfileMaxBatchBytes },
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
          // 记录当前 job 的流式上下文：后端在档案开启 streamTranslation 时用
          // 同一 jobId 通过 ai://translation-stream 上抛 delta。retry 的 job 也
          // 会重新走这里，迟到 delta 因 jobId 不匹配被订阅侧丢弃。
          streamingRef.current = {
            jobId,
            operation,
            totalEntries: selected.length,
            originalId: stardewPlan.originalId,
            mergeResults: (streamed) => stardewPlan.mergeResults(mergeBatchResults(streamed)),
            // 与后端同款：按发送的 item 文本派生 wire sentinel 映射，流式预览
            // 提交前把 ⟦N⟧ 还原回源占位符，避免用户看到线格式。
            sentinelByItemId: buildPlaceholderSentinelMap(items),
          }
          streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
          streamCompletedCountRef.current = 0
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
                maxBatchBytes: aiProfileMaxBatchBytes,
              }),
            )
            usageRecordFailed ||= result.usageRecordState === 'failed'
            results.push(...result.items)
            for (const issue of result.validationIssues) warningKeys.add(originalId(issue.itemId))
          } finally {
            activeJobs.current.delete(jobId)
            if (streamingRef.current?.jobId === jobId) {
              // 该 job 已 settle：后续迟到 delta 全部丢弃，正式结果接管。
              // 流式预览保留到整个 operation 结束（最终 apply 才写回文件），
              // 已完成条目并入累计进度，进度在批次间隙不回退。
              overallCompletedRef.current += streamCompletedCountRef.current
              streamingRef.current = null
              streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
              streamCompletedCountRef.current = 0
            }
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
          // 正式结构化结果已通过 applyResults 写回文件，流式预览全部让位。
          setStreamingValues(null)
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
  return { progress, run, cancel, streamingValues }
}
