import { appEvent, ignoreError } from '@platform/observability'

/**
 * @file useLauncherAiTranslation hook: AI batch translation of launcher mod
 * detail text with streaming preview, corpus warmup, caching, and degradation.
 */
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
import { dismissNotification } from '@shared/ui/notifications'
import { resolveLauncherAiTranslationProfileId } from '@features/launcher/model/launcherAiTranslationProfile'
import { getSessionCorpusWarmup, markSessionCorpusWarmed, startSessionCorpusWarmup } from '@features/launcher/model/sessionCorpusWarmup'
import type { ChangelogListItem } from './launcherModDetailData'

/** Translated launcher detail payload: overview, full description, and changelog items. */
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
    // observability-exempt: the caller treats this parse or read failure as an explicit empty result, so the fallback is recoverable and intentional
    return null
  }
}

/** Translates launcher mod detail text (overview, full description, changelog) via AI with streaming, caching, and corpus warmup. */
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
  const locale = useLocale()
  const notificationCopy = useNotificationCopy().ai
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
  // Overall progress for the whole job: accumulated across batches so the
  // progress ring never regresses between batches.
  const overallCompletedRef = useRef(0)
  const totalItemsRef = useRef(0)
  // Determinate progress during streaming; non-streaming (no content delta)
  // stays null → the progress ring degrades to an indeterminate spinner.
  const [streamProgress, setStreamProgress] = useState<TranslationProgress | null>(null)
  const source = JSON.stringify({ overview, full, changelog })

  // Streaming subscription: filters by jobId + operation as a double guard;
  // stale/misplaced deltas are always discarded.
  // The subscription is established once on mount; all state is read via refs
  // to avoid racing with run's ownership management.
  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    // High-frequency content deltas are merged via a trailing-edge throttle
    // (80ms) before a unified render commit: each commit tick is one
    // per-field fade-in / progress ring step, avoiding a full re-render per delta.
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
          // Chain-of-thought bypasses the throttle: accumulates char-by-char
          // to keep the streaming cursor smooth.
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

  // Corpus warmup: translation is unavailable until the knowledge base /
  // semantic runtime / official index is ready. Auto-warmup fires once per
  // session (the module-level singleton is shared across all mod detail
  // instances); concurrent mounts during warmup reuse the same in-flight
  // promise and do not re-issue prewarm_localization_corpus to the
  // single-slot AiSemanticSearch pool. On warmup failure the user explicitly
  // retries (retryCorpus); manual retry always calls the backend directly and
  // is not blocked by the singleton.
  const warmCorpus = async () => {
    setCorpusState('warming')
    try {
      const status = await localization.prewarmCorpus()
      markSessionCorpusWarmed(status.ready)
      setCorpusState(status.ready ? 'ready' : 'error')
    } catch {
      markSessionCorpusWarmed(false)
      setCorpusState('error')
    }
  }

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

  // Cancels the in-flight translation: invalidates run's ensureCurrent,
  // voids the old run's catch, and cancels the host-side task.
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
    for (const jobId of activeJobs.current) void ignoreError(ai.cancelJob(jobId), 'launcherAiTranslation.cancelJobs')
    activeJobs.current.clear()
  }, [ai])

  useEffect(() => {
    const inFlight = inFlightRef.current
    if (inFlight && inFlight.scopeKey === scopeKey && inFlight.target === target && inFlight.source === source) {
      // Remote detail arrived but translated content unchanged: keep the
      // in-flight task, do not reset state.
      return
    }
    if (inFlight) {
      const restart = inFlight.scopeKey === scopeKey && inFlight.target === target
      cancelInFlight()
      if (restart) {
        // Same mod content updated: the user already expressed translation
        // intent, so automatically re-run translation against the new content.
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
      // observability-exempt: 预期取消、资源可选加载或兼容性 fallback，保留现有状态行为
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [ai, cancelInFlight, notificationId, scopeKey, source, target, transientNotificationId, usageNotificationId])

  // Only cancel in-flight tasks and clean up notifications on unmount or when
  // switching mods (scopeKey changes).
  useEffect(() => {
    return () => {
      cancelInFlight()
      dismissNotification(notificationId)
      dismissNotification(usageNotificationId)
      dismissNotification(transientNotificationId)
    }
  }, [cancelInFlight, notificationId, transientNotificationId, usageNotificationId])

  const run = async (refresh = false) => {
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
        // The UI has already disabled the translate button; this is a
        // programmatic call (auto re-run / notification retry) double-guard.
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
      // Progress denominator = original item count (excluding chunks
      // produced by batch splitting); completed count accumulates across batches.
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
      appEvent('debug', 'launcher.ai.translation.batchPlan')
        .context({
          source: 'launcher-ai-translation',
          operation: 'build-batch-plan',
          scopeKey,
          job: prefix,
          batches: String(batches.length),
          items: String(items.length),
        })
        .dedupe('launcher.ai.translation.batchPlan')
        .emit({ notify: false })
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
                    // This job has settled: all late deltas are discarded
                    // and the authoritative result takes over. Completed
                    // items are merged into the accumulated progress so the
                    // progress ring never regresses between batches.
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
                    appEvent('debug', 'launcher.ai.translation.batchRetry')
                      .context({ source: 'launcher-ai-translation', operation: 'batch-retry', scopeKey, jobId: event.jobId })
                      .dedupe('launcher.ai.translation.batchRetry')
                      .emit({ notify: false })
                    break
                  case 'invalidResponseRetry':
                    appEvent('debug', 'launcher.ai.translation.invalidResponseRetry')
                      .context({ source: 'launcher-ai-translation', operation: 'invalid-response-retry', scopeKey, jobId: event.jobId })
                      .dedupe('launcher.ai.translation.invalidResponseRetry')
                      .emit({ notify: false })
                    break
                  case 'splitRetry':
                    appEvent('debug', 'launcher.ai.translation.splitRetry')
                      .context({
                        source: 'launcher-ai-translation',
                        operation: 'split-retry',
                        scopeKey,
                        jobId: event.jobId,
                        items: String(event.itemCount),
                      })
                      .dedupe('launcher.ai.translation.splitRetry')
                      .emit({ notify: false })
                    break
                  case 'itemKeptOriginal':
                    appEvent('debug', 'launcher.ai.translation.itemKeptOriginal')
                      .context({
                        source: 'launcher-ai-translation',
                        operation: 'item-kept-original',
                        scopeKey,
                        jobId: event.jobId,
                        itemId: event.itemId,
                      })
                      .dedupe('launcher.ai.translation.itemKeptOriginal')
                      .emit({ notify: false })
                    break
                  case 'attemptStart':
                  case 'attemptEnd':
                    break
                }
              },
            }),
          )
        } catch (cause) {
          // A single batch timeout / network error is a transient failure:
          // that batch keeps the original text and remaining batches continue,
          // so one slow batch does not void the entire detail translation.
          // Deterministic errors (auth, model, rate-limit, placeholder
          // validation, cancellation) still propagate and are not masked.
          ensureCurrent()
          const failure = parseAiFailure(cause)
          if (!isTransientAiFailure(failure)) throw cause
          lastTransientCause = cause
          transientRetainedIds.push(...batch.items.map((item) => item.id))
          appEvent('debug', 'launcher.ai.translation.batchTransientFailureKeptOriginal')
            .context({
              source: 'launcher-ai-translation',
              operation: 'batch-transient-failure-kept-original',
              scopeKey,
              jobId: batch.jobId,
              code: failure.code,
              items: String(batch.items.length),
              detail: failure.detail.slice(0, 200),
            })
            .dedupe('launcher.ai.translation.batchTransientFailureKeptOriginal')
            .emit({ notify: false })
          continue
        }
        results.push(...outcome.items)
        retainedIds.push(...outcome.retainedIds)
      }
      if (results.length === 0 && transientRetainedIds.length > 0) {
        // No batch succeeded at all: throw the last transient failure so the
        // error toast still appears, instead of disguising "all batches
        // timed out / network failed" as a success.
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
        // Items with repeated placeholder mismatches keep the original text;
        // the rest of the results land normally. A warning informs the user
        // rather than failing the whole batch.
        appEvent('debug', 'launcher.ai.translation.partialKeptOriginal')
          .context({
            source: 'launcher-ai-translation',
            operation: 'partial-translation-kept-original',
            scopeKey,
            retained: String(retainedIds.length),
            itemIds: retainedIds.join(','),
          })
          .dedupe('launcher.ai.translation.partialKeptOriginal')
          .emit({ notify: false })
        appEvent('warning', notificationCopy.partialTranslationKeptOriginalTitle)
          .description(notificationCopy.partialTranslationKeptOriginalDescription(retainedIds.length))
          .noticeId(notificationId)
          .context({
            source: 'launcher-ai-translation',
            operation: 'partial-translation-kept-original',
          })
          .emit()
      }
      if (transientRetainedIds.length > 0) {
        // At least one batch kept the original text due to a transient
        // timeout / network error, but the rest succeeded: a warning clearly
        // tells the user which content was not translated, instead of letting
        // them think the entire detail failed.
        appEvent('debug', 'launcher.ai.translation.partialTransientKeptOriginal')
          .context({
            source: 'launcher-ai-translation',
            operation: 'partial-translation-batch-failed',
            scopeKey,
            retained: String(transientRetainedIds.length),
          })
          .dedupe('launcher.ai.translation.partialTransientKeptOriginal')
          .emit({ notify: false })
        appEvent('warning', notificationCopy.partialTranslationBatchFailedTitle)
          .description(notificationCopy.partialTranslationBatchFailedDescription(transientRetainedIds.length))
          .noticeId(transientNotificationId)
          .context({
            source: 'launcher-ai-translation',
            operation: 'partial-translation-batch-failed',
          })
          .emit()
      }
      if (usageRecordFailed) {
        appEvent('warning', notificationCopy.usageRecordFailedTitle)
          .description(notificationCopy.usageRecordFailedDescription)
          .noticeId(usageNotificationId)
          .context({
            source: 'launcher-ai-translation',
            operation: 'record-translation-usage',
          })
          .emit()
      }
    } finally {
      if (inFlightRef.current?.operation === operation) {
        inFlightRef.current = null
        // Structural guarantee: when the current run is the last in-flight
        // owner and has settled, if the state is still stuck at loading
        // (e.g. translate's catch was skipped by the sequence guard), it must
        // be reset so the button never stays in "translating".
        setState((current) => (current === 'loading' ? (translationRef.current ? 'ready' : 'idle') : current))
      }
    }
  }

  const translate = (refresh = false) => {
    const sequence = ++runSequenceRef.current
    void run(refresh).catch((cause) => {
      if (sequence !== runSequenceRef.current) {
        // A newer operation has taken over UI state (auto re-run after
        // cancel or context switch); state reset is handled by run's finally.
        return
      }
      const failure = parseAiFailure(cause)
      if (failure.code === 'cancelled') {
        return
      }
      appEvent('error', failure.code === 'cache' ? notificationCopy.cacheFailedTitle : notificationCopy.translationFailedTitle)
        .description(notificationCopy.failureDescriptions[failure.code])
        .noticeId(notificationId)
        .action({ label: notificationCopy.retryAction, callback: () => translateRef.current(refresh), tone: 'primary' })
        .error(cause)
        .context({
          source: 'launcher-ai-translation',
          operation: 'translate-launcher-detail',
        })
        .emit()
    })
  }

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
