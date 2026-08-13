import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendTranslationStreamDelta,
  buildAiTranslationBatches,
  buildPlaceholderSentinelMap,
  createStreamCommitThrottle,
  extractCompletedTranslationItems,
  hashAiTranslationSource,
  isTransientAiFailure,
  parseAiFailure,
  restorePlaceholderSentinels,
  resolveTranslationProgress,
  translateBatchWithDegradation,
  uniqueOriginalItemIds,
  useAi,
  EMPTY_TRANSLATION_STREAM,
  type AiBatchDegradationResult,
  type TranslationProgress,
  type TranslationStreamAccumulator,
} from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useLocale, useNotificationCopy } from '@locales/provider'
import { applyNexusModsBbcodeTextTranslations, extractNexusModsBbcodeTextSegments } from '@shared/infra/game-formats/nexusmods-bbcode'
import type { AiTranslationItem, AiTranslationResultItem, AiTranslationStreamPayload } from '@shared/contracts'
import type { LocaleCode } from '@locales/api'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { resolveLauncherAiTranslationProfileId } from '@features/launcher/model/launcherAiTranslationProfile'
import { getSessionCorpusWarmup, markSessionCorpusWarmed, startSessionCorpusWarmup } from '@features/launcher/model/sessionCorpusWarmup'
import type { ChangelogListItem } from './launcherModDetailData'

type LauncherTranslationPayload = {
  overview: string
  full: string
  changelog: ChangelogListItem[]
}

type TranslationState = 'idle' | 'loading' | 'ready'

/** Corpus warmup gates the translate action; failed warmup is retryable. */
export type CorpusWarmupState = 'warming' | 'ready' | 'error'

type InFlightTranslation = {
  operation: number
  scopeKey: string
  source: string
  target: string
}

type BbcodeSegment = ReturnType<typeof extractNexusModsBbcodeTextSegments>[number]

/** Reassembles a structured payload from translated items by id; falls back to the source text for missing segments. */
function buildLauncherTranslationPayload(
  overview: string,
  full: string,
  changelog: ChangelogListItem[],
  overviewSegments: BbcodeSegment[],
  fullSegments: BbcodeSegment[],
  resultMap: Map<string, string>,
): LauncherTranslationPayload {
  return {
    overview: applyNexusModsBbcodeTextTranslations(
      overview,
      overviewSegments,
      new Map(overviewSegments.map((segment) => [segment.id, resultMap.get(`overview:${segment.id}`) ?? segment.text])),
    ),
    full: applyNexusModsBbcodeTextTranslations(
      full,
      fullSegments,
      new Map(fullSegments.map((segment) => [segment.id, resultMap.get(`full:${segment.id}`) ?? segment.text])),
    ),
    changelog: changelog.map((group, groupIndex) => ({
      ...group,
      lines: group.lines.map((line, lineIndex) => resultMap.get(`changelog:${groupIndex}:${lineIndex}`) ?? line),
    })),
  }
}

/** Context captured for the currently streaming job so late deltas can render partial translations. */
type StreamingTranslationContext = {
  jobId: string
  operation: number
  overview: string
  full: string
  changelog: ChangelogListItem[]
  overviewSegments: BbcodeSegment[]
  fullSegments: BbcodeSegment[]
  /** Per-item placeholder tokens the backend sentinel-izes on the wire; used to restore the streaming preview. */
  sentinelByItemId: ReadonlyMap<string, readonly string[]>
}

const TARGET_TRANSLATION_LOCALE: Record<LocaleCode, string> = { 'en-US': 'en', 'zh-CN': 'zh-Hans' }

function parseCached(value: string): LauncherTranslationPayload | null {
  try {
    const parsed = JSON.parse(value) as LauncherTranslationPayload
    return typeof parsed.overview === 'string' && typeof parsed.full === 'string' && Array.isArray(parsed.changelog) ? parsed : null
  } catch {
    return null
  }
}

export function useLauncherAiTranslation({
  scopeKey,
  overview,
  full,
  changelog,
}: {
  scopeKey: string
  overview: string
  full: string
  changelog: ChangelogListItem[]
}) {
  const ai = useAi()
  const localization = useLocalization()
  const launcherPort = useLauncherPort()
  const locale = useLocale()
  const notificationCopy = useNotificationCopy().ai
  const publishNotification = useNotificationPublisher()
  const target = TARGET_TRANSLATION_LOCALE[locale]
  const notificationId = `launcher-ai-translation-${scopeKey}`
  const usageNotificationId = `${notificationId}-usage`
  const transientNotificationId = `${notificationId}-transient`
  const [translation, setTranslation] = useState<LauncherTranslationPayload | null>(null)
  const translationRef = useRef(translation)
  translationRef.current = translation
  const [state, setState] = useState<TranslationState>('idle')
  // Provider chain-of-thought text, one entry per batch that returned it.
  const [reasoning, setReasoning] = useState<string[]>([])
  // Partial translation rendered while a streaming batch is in flight; replaced
  // by the fully validated result when the command resolves.
  const [streamPreview, setStreamPreview] = useState<LauncherTranslationPayload | null>(null)
  // Chain-of-thought text still being generated for the active streaming job.
  const [streamingReasoning, setStreamingReasoning] = useState<string | null>(null)
  const [corpusState, setCorpusState] = useState<CorpusWarmupState>('warming')
  const corpusStateRef = useRef<CorpusWarmupState>('warming')
  corpusStateRef.current = corpusState
  const activeJobs = useRef(new Set<string>())
  const operationRef = useRef(0)
  const runSequenceRef = useRef(0)
  const inFlightRef = useRef<InFlightTranslation | null>(null)
  const translateRef = useRef<(refresh?: boolean) => void>(() => undefined)
  const streamingRef = useRef<StreamingTranslationContext | null>(null)
  const streamAccumulatorRef = useRef<TranslationStreamAccumulator>(EMPTY_TRANSLATION_STREAM)
  const streamCompletedCountRef = useRef(0)
  // 整个任务的累计进度：跨批次累计，保证进度环在批次间隙不回退。
  const overallCompletedRef = useRef(0)
  const totalItemsRef = useRef(0)
  // 流式期间的确定进度；非流式（无 content delta）保持 null → 进度环退化为不确定旋转。
  const [streamProgress, setStreamProgress] = useState<TranslationProgress | null>(null)
  const source = JSON.stringify({ overview, full, changelog })

  // 流式订阅：按 jobId + operation 双保险过滤，过期/错位 delta 一律丢弃。
  // 订阅在挂载期建立一次，所有状态通过 ref 读取，避免与 run 的竞态管理冲突。
  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    // 高频 content delta 经尾沿节流（80ms）合并后统一提交渲染：提交粒度即
    // 逐字段渐入/进度环的一个 tick，避免每个 delta 触发一次整段重渲染。
    const throttle = createStreamCommitThrottle(() => {
      if (disposed) return
      const active = streamingRef.current
      if (!active) return
      const completed = extractCompletedTranslationItems(streamAccumulatorRef.current.content)
      // The wire carries sentinel tokens (`⟦N⟧`) instead of placeholders while
      // streaming; restore them for the preview so users never see the wire
      // form. The authoritative result is restored and count-checked by the
      // backend, so this only affects the transient preview.
      const restored = completed.map((item) => {
        const tokens = active.sentinelByItemId.get(item.id)
        if (!tokens) return item
        return { ...item, translatedText: restorePlaceholderSentinels(item.translatedText, tokens).text }
      })
      const completedUnique = uniqueOriginalItemIds(restored.map((item) => item.id))
      if (completedUnique.length <= streamCompletedCountRef.current) return
      streamCompletedCountRef.current = completedUnique.length
      const resultMap = new Map(restored.map((item) => [item.id, item.translatedText]))
      setStreamPreview(
        buildLauncherTranslationPayload(
          active.overview,
          active.full,
          active.changelog,
          active.overviewSegments,
          active.fullSegments,
          resultMap,
        ),
      )
      setStreamProgress(resolveTranslationProgress(overallCompletedRef.current + completedUnique.length, totalItemsRef.current))
    }, 80)
    void ai
      .listenToStream((payload: AiTranslationStreamPayload) => {
        if (disposed) return
        const active = streamingRef.current
        if (!active || active.jobId !== payload.jobId || active.operation !== operationRef.current) {
          return
        }
        streamAccumulatorRef.current = appendTranslationStreamDelta(streamAccumulatorRef.current, payload)
        if (payload.kind === 'reasoning') {
          // 思考链不走节流：逐字累积保持流式光标流畅。
          setStreamingReasoning(streamAccumulatorRef.current.reasoning)
          return
        }
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

  // 语料预热：知识库/语义运行时/官方索引就绪前翻译不可用。自动预热按会话只
  // 触发一次（模块级单例跨所有 mod detail 实例共享），预热中的并发挂载复用
  // 同一个在途 promise，不再向单槽 AiSemanticSearch 池重复下发
  // prewarm_localization_corpus；预热失败后由用户显式重试（retryCorpus），
  // 手动重试总是直接调用后端，不受单例挡。
  const warmCorpus = useCallback(async () => {
    setCorpusState('warming')
    try {
      const status = await localization.prewarmCorpus()
      markSessionCorpusWarmed(status.ready)
      setCorpusState(status.ready ? 'ready' : 'error')
    } catch {
      markSessionCorpusWarmed(false)
      setCorpusState('error')
    }
  }, [localization])

  useEffect(() => {
    const session = getSessionCorpusWarmup()
    if (session.status === 'warming') {
      setCorpusState('warming')
      session.promise.then(
        (ready) => setCorpusState(ready ? 'ready' : 'error'),
        () => setCorpusState('error'),
      )
      return
    }
    if (session.status === 'settled') {
      setCorpusState(session.ready ? 'ready' : 'error')
      return
    }
    const promise = startSessionCorpusWarmup(() => localization.prewarmCorpus().then((status) => status.ready))
    setCorpusState('warming')
    promise.then(
      (ready) => setCorpusState(ready ? 'ready' : 'error'),
      () => setCorpusState('error'),
    )
  }, [localization])

  // 取消在途翻译：使 run 的 ensureCurrent 失效、作废旧 run 的 catch，并取消宿主侧任务。
  const cancelInFlight = useCallback(() => {
    inFlightRef.current = null
    operationRef.current += 1
    runSequenceRef.current += 1
    streamingRef.current = null
    streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
    streamCompletedCountRef.current = 0
    overallCompletedRef.current = 0
    totalItemsRef.current = 0
    setStreamPreview(null)
    setStreamingReasoning(null)
    setStreamProgress(null)
    for (const jobId of activeJobs.current) void ai.cancelJob(jobId).catch(() => undefined)
    activeJobs.current.clear()
  }, [ai])

  useEffect(() => {
    const inFlight = inFlightRef.current
    if (inFlight && inFlight.scopeKey === scopeKey && inFlight.target === target && inFlight.source === source) {
      // 远程详情到达但翻译内容未变：保留在途任务，不重置状态。
      return
    }
    if (inFlight) {
      const restart = inFlight.scopeKey === scopeKey && inFlight.target === target
      cancelInFlight()
      if (restart) {
        // 同一 mod 的内容更新：用户已表达过翻译意图，自动针对新内容重开翻译。
        setTranslation(null)
        setReasoning([])
        translateRef.current(false)
        return
      }
    }
    setTranslation(null)
    setReasoning([])
    setState('idle')
    dismissNotification(notificationId)
    dismissNotification(usageNotificationId)
    dismissNotification(transientNotificationId)
    let active = true
    void hashAiTranslationSource(source)
      .then((sourceHash) => ai.readCache({ scopeKey, targetLocale: target, sourceHash }))
      .then((cached) => {
        if (!active || !cached) return
        const parsed = parseCached(cached.translatedText)
        if (parsed) {
          setTranslation(parsed)
          setReasoning([])
          setState('ready')
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [ai, cancelInFlight, notificationId, scopeKey, source, target, transientNotificationId, usageNotificationId])

  // 仅在卸载或切换 mod（scopeKey 变化）时取消在途任务并清理通知。
  useEffect(() => {
    return () => {
      cancelInFlight()
      dismissNotification(notificationId)
      dismissNotification(usageNotificationId)
      dismissNotification(transientNotificationId)
    }
  }, [cancelInFlight, notificationId, transientNotificationId, usageNotificationId])

  const run = useCallback(
    async (refresh = false) => {
      const operation = ++operationRef.current
      inFlightRef.current = { operation, scopeKey, source, target }
      const ensureCurrent = () => {
        if (operation !== operationRef.current) {
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
        if (corpusStateRef.current !== 'ready') {
          // UI 已禁用翻译按钮；此处是程序化调用（自动重开/通知重试）的双保险。
          throw new Error('AI_ERROR::corpus-not-ready::Localization corpus is not warmed up yet.')
        }
        dismissNotification(notificationId)
        dismissNotification(usageNotificationId)
        dismissNotification(transientNotificationId)
        setState('loading')
        setReasoning([])
        setStreamPreview(null)
        setStreamingReasoning(null)
        const sourceHash = await guarded(hashAiTranslationSource(source))
        if (!refresh) {
          const cached = await guarded(ai.readCache({ scopeKey, targetLocale: target, sourceHash }))
          const parsed = cached ? parseCached(cached.translatedText) : null
          if (parsed) {
            setTranslation(parsed)
            setReasoning([])
            setState('ready')
            return
          }
        }

        const settings = await guarded(ai.loadSettings())
        const defaultEngine = settings.defaultProfileId ? null : await guarded(localization.loadDefaultEngine())
        const profileId = resolveLauncherAiTranslationProfileId(settings.defaultProfileId, defaultEngine)
        if (!profileId) throw new Error('AI_ERROR::not-configured::No default AI profile is configured.')
        const profile = settings.profiles.find((value) => value.id === profileId)
        const overviewSegments = extractNexusModsBbcodeTextSegments(overview)
        const fullSegments = extractNexusModsBbcodeTextSegments(full)
        const items: AiTranslationItem[] = [
          ...overviewSegments.map((segment) => ({ id: `overview:${segment.id}`, text: segment.text, format: 'nexusBbcodeText' as const })),
          ...fullSegments.map((segment) => ({ id: `full:${segment.id}`, text: segment.text, format: 'nexusBbcodeText' as const })),
          ...changelog.flatMap((group, groupIndex) =>
            group.lines.map((line, lineIndex) => ({
              id: `changelog:${groupIndex}:${lineIndex}`,
              text: line,
              format: 'plainText' as const,
              context: group.version,
            })),
          ),
        ]
        // 进度分母 = 原始条目数（不含批次拆分产生的 chunk）；跨批累计已完成数。
        totalItemsRef.current = items.length
        overallCompletedRef.current = 0
        setStreamProgress(null)
        if (!items.length) {
          setTranslation({ overview, full, changelog })
          setReasoning([])
          setState('ready')
          return
        }
        const prefix = `launcher-ai:${Date.now()}:${scopeKey}`
        const plan = buildAiTranslationBatches(
          {
            profileId,
            targetLocale: target,
            usageContext: { pageSource: 'launcher', operation: 'translate' },
            // Launcher detail text is extracted into bbcode segments, so the
            // provider may legitimately reorder/normalize tokens inside segments;
            // the backend skips only the placeholder multiset comparison while
            // id uniqueness/count checks stay on (mergeResults reassembles by id).
            skipFormatValidation: true,
            maxBatchBytes: profile?.maxBatchBytes ?? null,
          },
          items,
          prefix,
          { contextWindowTokens: profile?.contextWindowTokens ?? null, maxBatchBytes: profile?.maxBatchBytes ?? null },
        )
        const batches = plan.batches
        launcherPort.writeDebugLog({
          message: 'launcher.ai.translation.batchPlan',
          keyValues: {
            scopeKey,
            job: prefix,
            batches: String(batches.length),
            items: String(items.length),
          },
        })
        const results: AiTranslationResultItem[] = []
        const retainedIds: string[] = []
        const transientRetainedIds: string[] = []
        const reasoningByJob = new Map<string, string>()
        let lastTransientCause: unknown = null
        let usageRecordFailed = false
        for (const batch of batches) {
          let outcome: AiBatchDegradationResult
          try {
            outcome = await guarded(
              translateBatchWithDegradation({
                batch,
                attempt: async (request) => {
                  activeJobs.current.add(request.jobId)
                  streamingRef.current = {
                    jobId: request.jobId,
                    operation,
                    overview,
                    full,
                    changelog,
                    overviewSegments,
                    fullSegments,
                    sentinelByItemId: buildPlaceholderSentinelMap(request.items),
                  }
                  streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
                  streamCompletedCountRef.current = 0
                  setStreamPreview(null)
                  setStreamingReasoning(null)
                  try {
                    const result = await guarded(ai.translateBatch(request))
                    usageRecordFailed ||= result.usageRecordState === 'failed'
                    if (result.reasoning) reasoningByJob.set(request.jobId, result.reasoning)
                    return result.items
                  } finally {
                    activeJobs.current.delete(request.jobId)
                    if (streamingRef.current?.jobId === request.jobId) {
                      // 该 job 已 settle：后续迟到 delta 全部丢弃，正式结果接管。
                      // 已完成的条目并入累计进度，进度环在批次间隙保持不回退。
                      overallCompletedRef.current += streamCompletedCountRef.current
                      streamingRef.current = null
                      streamAccumulatorRef.current = EMPTY_TRANSLATION_STREAM
                      streamCompletedCountRef.current = 0
                      setStreamPreview(null)
                      setStreamingReasoning(null)
                    }
                  }
                },
                isPlaceholderMismatch: (cause) => parseAiFailure(cause).code === 'placeholder-mismatch',
                isInvalidResponse: (cause) => parseAiFailure(cause).code === 'invalid-response',
                checkCancelled: ensureCurrent,
                onEvent: (event) => {
                  switch (event.kind) {
                    case 'batchRetry':
                      launcherPort.writeDebugLog({
                        message: 'launcher.ai.translation.batchRetry',
                        keyValues: { scopeKey, jobId: event.jobId },
                      })
                      break
                    case 'invalidResponseRetry':
                      launcherPort.writeDebugLog({
                        message: 'launcher.ai.translation.invalidResponseRetry',
                        keyValues: { scopeKey, jobId: event.jobId },
                      })
                      break
                    case 'splitRetry':
                      launcherPort.writeDebugLog({
                        message: 'launcher.ai.translation.splitRetry',
                        keyValues: { scopeKey, jobId: event.jobId, items: String(event.itemCount) },
                      })
                      break
                    case 'itemKeptOriginal':
                      launcherPort.writeDebugLog({
                        message: 'launcher.ai.translation.itemKeptOriginal',
                        keyValues: { scopeKey, jobId: event.jobId, itemId: event.itemId },
                      })
                      break
                    case 'attemptStart':
                    case 'attemptEnd':
                      break
                  }
                },
              }),
            )
          } catch (cause) {
            // 单批超时/网络错误属于瞬时故障：该批保留原文、继续剩余批次，
            // 避免整个详情翻译因一个慢批次作废。确定性错误（鉴权、模型、
            // 限流、占位符校验、取消）照常上抛，不掩盖真实失败原因。
            ensureCurrent()
            const failure = parseAiFailure(cause)
            if (!isTransientAiFailure(failure)) throw cause
            lastTransientCause = cause
            transientRetainedIds.push(...batch.items.map((item) => item.id))
            launcherPort.writeDebugLog({
              message: 'launcher.ai.translation.batchTransientFailureKeptOriginal',
              keyValues: {
                scopeKey,
                jobId: batch.jobId,
                code: failure.code,
                items: String(batch.items.length),
                detail: failure.detail.slice(0, 200),
              },
            })
            continue
          }
          results.push(...outcome.items)
          retainedIds.push(...outcome.retainedIds)
        }
        if (results.length === 0 && transientRetainedIds.length > 0) {
          // 没有任何批次成功：抛出最后一次瞬时失败，让错误 toast 照常出现，
          // 而不是把“全部超时/网络失败”伪装成一次成功。
          throw lastTransientCause ?? new Error('AI_ERROR::network::All translation batches failed with transient provider errors.')
        }
        const resultMap = new Map(plan.mergeResults(results).map((item) => [item.id, item.translatedText]))
        const translated = buildLauncherTranslationPayload(overview, full, changelog, overviewSegments, fullSegments, resultMap)
        await guarded(
          ai.writeCache({
            scopeKey,
            targetLocale: target,
            sourceHash,
            translatedText: JSON.stringify(translated),
            providerProfileId: profileId,
            model: settings.profiles.find((profile) => profile.id === profileId)?.model ?? '',
            updatedAtMs: Date.now(),
          }),
        )
        ensureCurrent()
        setTranslation(translated)
        setReasoning([...reasoningByJob.values()])
        setState('ready')
        dismissNotification(notificationId)
        if (retainedIds.length > 0) {
          // 占位符反复 mismatch 的条目保留原文，其余结果照常落地；用 warning 告知而非整批失败。
          launcherPort.writeDebugLog({
            message: 'launcher.ai.translation.partialKeptOriginal',
            keyValues: { scopeKey, retained: String(retainedIds.length), itemIds: retainedIds.join(',') },
          })
          publishNotification({
            id: notificationId,
            level: 'warning',
            title: notificationCopy.partialTranslationKeptOriginalTitle,
            description: notificationCopy.partialTranslationKeptOriginalDescription(retainedIds.length),
          })
        }
        if (transientRetainedIds.length > 0) {
          // 至少有一个批次因瞬时超时/网络错误保留原文，但其余批次成功：用 warning
          // 明确告知哪些内容未翻译，而不是让用户以为整个详情都失败了。
          launcherPort.writeDebugLog({
            message: 'launcher.ai.translation.partialTransientKeptOriginal',
            keyValues: { scopeKey, retained: String(transientRetainedIds.length) },
          })
          publishNotification({
            id: transientNotificationId,
            level: 'warning',
            title: notificationCopy.partialTranslationBatchFailedTitle,
            description: notificationCopy.partialTranslationBatchFailedDescription(transientRetainedIds.length),
          })
        }
        if (usageRecordFailed) {
          publishNotification({
            id: usageNotificationId,
            level: 'warning',
            title: notificationCopy.usageRecordFailedTitle,
            description: notificationCopy.usageRecordFailedDescription,
          })
        }
      } finally {
        if (inFlightRef.current?.operation === operation) {
          inFlightRef.current = null
          // 结构性保证：当前 run 是最后的在途所有者且已 settle 时，若状态仍停留在
          // loading（例如 translate 的 catch 因序号守卫被跳过），必须复位，按钮永远离开「翻译中」。
          setState((current) => (current === 'loading' ? (translationRef.current ? 'ready' : 'idle') : current))
        }
      }
    },
    [
      ai,
      changelog,
      full,
      localization,
      notificationCopy,
      notificationId,
      overview,
      publishNotification,
      scopeKey,
      source,
      target,
      transientNotificationId,
      usageNotificationId,
    ],
  )

  const translate = useCallback(
    (refresh = false) => {
      const sequence = ++runSequenceRef.current
      void run(refresh).catch((cause) => {
        if (sequence !== runSequenceRef.current) {
          // 已有更新的 operation 接管 UI 状态（取消后自动重开或上下文切换）；状态复位由 run 的 finally 负责。
          return
        }
        const failure = parseAiFailure(cause)
        if (failure.code === 'cancelled') {
          return
        }
        publishNotification({
          id: notificationId,
          level: 'error',
          title: failure.code === 'cache' ? notificationCopy.cacheFailedTitle : notificationCopy.translationFailedTitle,
          description: notificationCopy.failureDescriptions[failure.code],
          action: { label: notificationCopy.retryAction, callback: () => translateRef.current(refresh), tone: 'primary' },
        })
      })
    },
    [notificationCopy, notificationId, publishNotification, run],
  )

  translateRef.current = translate

  return {
    translation,
    state,
    translate,
    corpusState,
    retryCorpus: warmCorpus,
    reasoning,
    streamPreview,
    streamingReasoning,
    streamProgress,
  }
}
