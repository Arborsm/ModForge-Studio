import { BookOpen, Check, Database, Landmark, Palette, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useTranslationEditorCopy } from '@locales/provider'
import type { KnowledgePolicy, LocalizationContextInspection } from '@shared/contracts'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import type { TranslationEntry } from '../model/translationEditor'

type TranslationContextPanelProps = {
  entry: TranslationEntry
  scopeId: string
  sourceLocale: string
  targetLocale: string
  gameDirectory: string | null
  knowledgePolicy: KnowledgePolicy
  onApply: (value: string) => void
}

/** Shows the effective knowledge used for the active translation unit. */
export function TranslationContextPanel({
  entry,
  scopeId,
  sourceLocale,
  targetLocale,
  gameDirectory,
  knowledgePolicy,
  onApply,
}: TranslationContextPanelProps) {
  const copy = useTranslationEditorCopy()
  const localization = useLocalization()
  const runLoad = useLatestTask('translation-context')
  const { enabled, useOfficialCorpus, useGlobalKnowledge, useProfileKnowledge } = knowledgePolicy
  const [value, setValue] = useState<LocalizationContextInspection | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryRevision, setRetryRevision] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setValue(null)
      setLoading(false)
      setLoadFailed(false)
      void runLoad(async () => undefined).catch(() => undefined)
      return
    }
    setLoading(true)
    setLoadFailed(false)
    const handle = window.setTimeout(() => {
      void runLoad(async (task) => {
        try {
          const next = await localization.inspectContext({
            scopeId,
            sourceLocale,
            targetLocale,
            sourceText: entry.sourceText,
            unitKey: entry.key,
            gameDirectory,
            knowledgePolicy: {
              enabled,
              useOfficialCorpus,
              useGlobalKnowledge,
              useProfileKnowledge,
            },
          })
          if (task.isCurrent()) setValue(next)
        } catch (error) {
          if (task.isCurrent() && !(error instanceof TaskCancelledError)) {
            setValue(null)
            setLoadFailed(true)
          }
        } finally {
          if (task.isCurrent()) setLoading(false)
        }
      }).catch(() => undefined)
    }, 180)
    return () => window.clearTimeout(handle)
  }, [
    entry.key,
    entry.sourceText,
    enabled,
    gameDirectory,
    localization,
    retryRevision,
    runLoad,
    scopeId,
    sourceLocale,
    targetLocale,
    useGlobalKnowledge,
    useOfficialCorpus,
    useProfileKnowledge,
  ])
  const empty = !value || (!value.glossary.length && !value.memory.length && !value.official.length && !value.style)
  const officialUnavailable = value && useOfficialCorpus && !value.trace.officialIndexed
  return (
    <aside className="translation-context-panel">
      <header>
        <BookOpen className="h-4 w-4" />
        <strong>{copy.contextTitle}</strong>
      </header>
      {loading ? (
        <div className="translation-context-loading" aria-live="polite" aria-busy="true">
          <LoadingMotionFallback intensityId="light" />
          <span>{copy.contextLoading}</span>
        </div>
      ) : loadFailed ? (
        <div className="translation-context-error" role="alert">
          <span>{copy.contextLoadFailed}</span>
          <button type="button" className="control-button" onClick={() => setRetryRevision((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.retry}
          </button>
        </div>
      ) : empty ? (
        <p>{officialUnavailable ? copy.contextOfficialUnavailable : copy.contextEmpty}</p>
      ) : (
        <div className="translation-context-groups">
          {officialUnavailable ? <p>{copy.contextOfficialUnavailable}</p> : null}
          {value.glossary.length ? (
            <section>
              <h3>
                <Database className="h-3.5 w-3.5" />
                {copy.contextGlossary}
              </h3>
              {value.glossary.map((item) => (
                <article key={item.id}>
                  <strong>{item.sourceTerm}</strong>
                  <span>{item.doNotTranslate ? item.sourceTerm : item.targetTerm}</span>
                  {item.notes ? <small>{item.notes}</small> : null}
                </article>
              ))}
            </section>
          ) : null}
          {value.memory.length ? (
            <section>
              <h3>
                <Check className="h-3.5 w-3.5" />
                {copy.contextMemory}
              </h3>
              {value.memory.map((item) => (
                <article key={item.id}>
                  <strong>{item.sourceText}</strong>
                  <span>{item.targetText}</span>
                  <button type="button" onClick={() => onApply(item.targetText)}>
                    {copy.contextApplySuggestion}
                  </button>
                </article>
              ))}
            </section>
          ) : null}
          {value.official.length ? (
            <section>
              <h3>
                <Landmark className="h-3.5 w-3.5" />
                {copy.contextOfficial}
              </h3>
              {value.official.map((item) => (
                <article key={item.id}>
                  <strong>{item.sourceText}</strong>
                  <span>{item.targetText}</span>
                </article>
              ))}
            </section>
          ) : null}
          {value.style ? (
            <section>
              <h3>
                <Palette className="h-3.5 w-3.5" />
                {copy.contextStyle}
              </h3>
              <article>
                <span>{[value.style.tone, value.style.audience, value.style.formality].filter(Boolean).join(' · ')}</span>
                {value.style.rules.length ? <small>{value.style.rules.join(' · ')}</small> : null}
              </article>
            </section>
          ) : null}
        </div>
      )}
    </aside>
  )
}
