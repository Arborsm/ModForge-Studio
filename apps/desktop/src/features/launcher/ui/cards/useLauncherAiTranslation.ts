import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAiTranslationBatches, hashAiTranslationSource, parseAiFailure, useAi } from '@entities/ai'
import { useLocale, useNotificationCopy } from '@locales/provider'
import { applyNexusModsBbcodeTextTranslations, extractNexusModsBbcodeTextSegments } from '@shared/infra/game-formats/nexusmods-bbcode'
import type { AiTranslationItem } from '@shared/contracts'
import type { LocaleCode } from '@locales/api'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import type { ChangelogListItem } from './launcherModDetailData'

type LauncherTranslationPayload = {
  overview: string
  full: string
  changelog: ChangelogListItem[]
}

type TranslationState = 'idle' | 'loading' | 'ready'

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
  const locale = useLocale()
  const notificationCopy = useNotificationCopy().ai
  const publishNotification = useNotificationPublisher()
  const target = TARGET_TRANSLATION_LOCALE[locale]
  const notificationId = `launcher-ai-translation-${scopeKey}`
  const usageNotificationId = `${notificationId}-usage`
  const [translation, setTranslation] = useState<LauncherTranslationPayload | null>(null)
  const [state, setState] = useState<TranslationState>('idle')
  const activeJobs = useRef(new Set<string>())
  const operationRef = useRef(0)
  const translateRef = useRef<(refresh?: boolean) => void>(() => undefined)
  const source = JSON.stringify({ overview, full, changelog })

  useEffect(() => {
    let active = true
    const operation = ++operationRef.current
    setTranslation(null)
    setState('idle')
    void hashAiTranslationSource(source)
      .then((sourceHash) => ai.readCache({ scopeKey, targetLocale: target, sourceHash }))
      .then((cached) => {
        if (!active || operation !== operationRef.current || !cached) return
        const parsed = parseCached(cached.translatedText)
        if (parsed) {
          setTranslation(parsed)
          setState('ready')
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
      operationRef.current += 1
      for (const jobId of activeJobs.current) void ai.cancelJob(jobId).catch(() => undefined)
      activeJobs.current.clear()
      dismissNotification(notificationId)
      dismissNotification(usageNotificationId)
    }
  }, [ai, notificationId, scopeKey, source, target, usageNotificationId])

  const run = useCallback(
    async (refresh = false) => {
      const operation = ++operationRef.current
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
      dismissNotification(notificationId)
      dismissNotification(usageNotificationId)
      setState('loading')
      const sourceHash = await guarded(hashAiTranslationSource(source))
      if (!refresh) {
        const cached = await guarded(ai.readCache({ scopeKey, targetLocale: target, sourceHash }))
        const parsed = cached ? parseCached(cached.translatedText) : null
        if (parsed) {
          setTranslation(parsed)
          setState('ready')
          return
        }
      }

      const settings = await guarded(ai.loadSettings())
      const profileId = settings.defaultProfileId
      if (!profileId) throw new Error('AI_ERROR::not-configured::No default AI profile is configured.')
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
      if (!items.length) {
        setTranslation({ overview, full, changelog })
        setState('ready')
        return
      }
      const prefix = `launcher-ai:${Date.now()}:${scopeKey}`
      const plan = buildAiTranslationBatches(
        { profileId, targetLocale: target, usageContext: { pageSource: 'launcher', operation: 'translate' } },
        items,
        prefix,
      )
      const batches = plan.batches
      const results = []
      let usageRecordFailed = false
      for (const batch of batches) {
        activeJobs.current.add(batch.jobId)
        try {
          const result = await guarded(ai.translateBatch(batch))
          usageRecordFailed ||= result.usageRecordState === 'failed'
          results.push(...result.items)
        } finally {
          activeJobs.current.delete(batch.jobId)
        }
      }
      const resultMap = new Map(plan.mergeResults(results).map((item) => [item.id, item.translatedText]))
      const translated: LauncherTranslationPayload = {
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
      setState('ready')
      dismissNotification(notificationId)
      if (usageRecordFailed) {
        publishNotification({
          id: usageNotificationId,
          level: 'warning',
          title: notificationCopy.usageRecordFailedTitle,
          description: notificationCopy.usageRecordFailedDescription,
        })
      }
    },
    [ai, changelog, full, notificationCopy, notificationId, overview, publishNotification, scopeKey, source, target, usageNotificationId],
  )

  const translate = useCallback(
    (refresh = false) => {
      void run(refresh).catch((cause) => {
        const failure = parseAiFailure(cause)
        setState(translation ? 'ready' : 'idle')
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
    [notificationCopy, notificationId, publishNotification, run, translation],
  )

  translateRef.current = translate

  return { translation, state, translate }
}
