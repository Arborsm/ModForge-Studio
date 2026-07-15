import { useEffect, useRef, useState } from 'react'
import { parseAiFailure } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useTranslationEditorCopy } from '@locales/provider'
import type { AiReviewIssue, AiReviewResult } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import type { TranslationEntry } from './translationEditor'

const NOTIFICATION_ID = 'workbench-localization-review'
export type TranslationReviewMode = 'current' | 'translated' | 'all'

export function useTranslationReview(options: {
  activeEntry: TranslationEntry | null
  allEntries: TranslationEntry[]
  sourceLocale: string
  targetLocale: string
  scopeId: string | null
  profileId: string | null
  applySuggestions: (values: ReadonlyMap<string, string>) => void
}) {
  const localization = useLocalization()
  const copy = useTranslationEditorCopy()
  const notificationCopy = useNotificationCopy().ai
  const publish = useNotificationPublisher()
  const operation = useRef(0)
  const activeJob = useRef<string | null>(null)
  const runRef = useRef<(mode: TranslationReviewMode, runAi: boolean) => Promise<void>>(async () => undefined)
  const [result, setResult] = useState<AiReviewResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const entriesRef = useRef(options.allEntries)
  entriesRef.current = options.allEntries
  const cancel = () => {
    operation.current += 1
    const job = activeJob.current
    activeJob.current = null
    if (job) void localization.cancelJob(job).catch(() => undefined)
    setRunning(false)
  }
  useEffect(
    () => () => {
      cancel()
      dismissNotification(NOTIFICATION_ID)
    },
    [localization],
  )
  const run = async (mode: TranslationReviewMode, runAi: boolean) => {
    if (running) return
    if (!options.scopeId) {
      setError(copy.reviewFailed)
      return
    }
    const entries =
      mode === 'current'
        ? options.activeEntry
          ? [options.activeEntry]
          : []
        : mode === 'translated'
          ? options.allEntries.filter((entry) => entry.targetText.trim())
          : options.allEntries
    if (!entries.length) return
    const owner = ++operation.current
    const jobId = `workbench-review:${crypto.randomUUID()}`
    activeJob.current = jobId
    setRunning(true)
    setError(null)
    dismissNotification(NOTIFICATION_ID)
    try {
      const value = await localization.reviewBatch({
        jobId,
        scopeId: options.scopeId,
        sourceLocale: options.sourceLocale,
        targetLocale: options.targetLocale,
        mode,
        profileId: options.profileId,
        runAi,
        engine: runAi ? 'generative-ai' : 'local',
        items: entries.map((entry) => ({ unitKey: entry.key, sourceText: entry.sourceText, targetText: entry.targetText })),
      })
      if (owner !== operation.current) return
      setResult(value)
      setSelectedId(value.issues[0]?.id ?? null)
      setChecked(new Set())
      if (value.run.status === 'partial') {
        setError(copy.reviewPartial)
        publish({
          id: NOTIFICATION_ID,
          level: 'warning',
          title: copy.reviewPartial,
          description: notificationCopy.failureDescriptions.unknown,
          action: { label: notificationCopy.retryAction, callback: () => void runRef.current(mode, runAi), tone: 'primary' },
        })
      } else if (value.usageRecordState === 'failed') {
        publish({
          id: NOTIFICATION_ID,
          level: 'warning',
          title: notificationCopy.usageRecordFailedTitle,
          description: notificationCopy.usageRecordFailedDescription,
        })
      }
    } catch (cause) {
      if (owner !== operation.current) return
      const failure = parseAiFailure(cause)
      if (failure.code !== 'cancelled') {
        setError(copy.reviewFailed)
        publish({
          id: NOTIFICATION_ID,
          level: 'error',
          title: copy.reviewFailed,
          description: notificationCopy.failureDescriptions[failure.code],
          action: { label: notificationCopy.retryAction, callback: () => void runRef.current(mode, runAi), tone: 'primary' },
        })
      }
    } finally {
      if (owner === operation.current) {
        activeJob.current = null
        setRunning(false)
      }
    }
  }
  runRef.current = run
  const update = async (updates: Array<{ issue: AiReviewIssue; status: 'open' | 'ignored' | 'accepted' }>) => {
    if (!result) return
    const current = new Map(entriesRef.current.map((entry) => [entry.key, entry]))
    const next = await localization.updateReviewIssues({
      runId: result.run.id,
      issues: updates.map(({ issue, status }) => {
        const entry = current.get(issue.unitKey)
        return { id: issue.id, status, currentSourceText: entry?.sourceText ?? '', currentTargetText: entry?.targetText ?? '' }
      }),
    })
    setResult(next)
    setSelectedId((current) => next.issues.find((issue) => issue.status === 'open' && issue.id !== current)?.id ?? current)
    const accepted = new Map<string, string>()
    for (const { issue, status } of updates) {
      const persisted = next.issues.find((value) => value.id === issue.id)
      if (status === 'accepted' && persisted?.status === 'accepted' && persisted.suggestion)
        accepted.set(persisted.unitKey, persisted.suggestion)
    }
    if (accepted.size) options.applySuggestions(accepted)
    setChecked(new Set())
  }
  const selected = result?.issues.find((issue) => issue.id === selectedId) ?? null
  return { result, running, error, selected, setSelectedId, checked, setChecked, run, cancel, update, selectedIssue: selected }
}
