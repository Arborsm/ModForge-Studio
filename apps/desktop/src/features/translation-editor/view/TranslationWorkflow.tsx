import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Languages, Save, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContentPatcherI18nFile } from '@entities/mod/api'
import { useLocalization } from '@entities/localization'
import { useTranslationEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { ConfirmedTranslation } from '@shared/contracts'
import {
  buildTranslationCheckSummary,
  buildTranslationEntries,
  createI18nFile,
  type TranslationCheckIssue,
} from '../model/translationEditor'
import { TranslationEditor, type TranslationEditorProps } from './TranslationEditor'

export type TranslationWorkflowProps = TranslationEditorProps & {
  onChangeProject?: () => void
}

type WorkflowStep = 'setup' | 'translate' | 'review'

function findFile(files: ContentPatcherI18nFile[], locale: string) {
  return files.find((file) => file.locale === locale) ?? null
}

function bindingFor(context: NonNullable<TranslationWorkflowProps['localizationContext']>) {
  const { kind, stableId, fallbackPath } = context.projectIdentity
  if (stableId) return { bindingKind: kind === 'cp-maker' ? 'project-unique-id' : 'installed-mod', bindingValue: stableId }
  if (fallbackPath) return { bindingKind: kind === 'cp-maker' ? 'draft-key' : 'canonical-path-hash', bindingValue: fallbackPath }
  return null
}

function issueLabel(issue: TranslationCheckIssue, copy: ReturnType<typeof useTranslationEditorCopy>) {
  if (issue.kind === 'invalid-json') return copy.workflowInvalidJson
  if (issue.kind === 'missing-token') return copy.workflowMissingToken
  if (issue.kind === 'missing-translation') return copy.workflowMissingTranslation
  if (issue.kind === 'whitespace') return copy.workflowWhitespace
  if (issue.kind === 'line-breaks') return copy.workflowLineBreaks
  if (issue.kind === 'language-mix') return copy.workflowLanguageMix
  return copy.workflowLength
}

function initializationError(error: unknown, copy: ReturnType<typeof useTranslationEditorCopy>) {
  const detail = error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : ''
  if (detail.includes('Unknown sidecar command') || detail.includes('initialize_localization_plan')) {
    return copy.workflowBackendRestartRequired
  }
  return detail ? `${copy.workflowInitializeFailed} ${copy.workflowErrorDetail(detail)}` : copy.workflowInitializeFailed
}

/** Guides one project from locale selection through editing, checks, and persistence. */
export function TranslationWorkflow(props: TranslationWorkflowProps) {
  const copy = useTranslationEditorCopy()
  const localization = useLocalization()
  const [step, setStep] = useState<WorkflowStep>('setup')
  const [importExisting, setImportExisting] = useState(true)
  const [initializing, setInitializing] = useState(false)
  const [initializedKey, setInitializedKey] = useState('')
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [memoryWarning, setMemoryWarning] = useState(false)
  const [openReviewCount, setOpenReviewCount] = useState(0)
  const semanticRuntimeLeaseId = useRef(crypto.randomUUID())
  const sourceFile = findFile(props.i18nFiles, props.sourceLocale)
  const targetFile = findFile(props.i18nFiles, props.targetLocale)
  const entries = useMemo(() => buildTranslationEntries({ sourceFile, targetFile, query: '', status: 'all' }), [sourceFile, targetFile])
  const existing = entries.filter((entry) => entry.sourceText.trim() && entry.targetText.trim())
  const check = useMemo(
    () => buildTranslationCheckSummary(sourceFile, targetFile, entries, props.targetLocale),
    [entries, props.targetLocale, sourceFile, targetFile],
  )
  const projectRootPath = props.project?.rootPath ?? ''
  const contextKey = `${projectRootPath}\u0000${props.sourceLocale}\u0000${props.targetLocale}`
  useEffect(() => {
    setStep('setup')
    setSaved(false)
    setError(null)
  }, [props.project?.rootPath])
  useEffect(() => setImportExisting(true), [contextKey])
  useEffect(() => {
    if (!projectRootPath) return
    const leaseId = semanticRuntimeLeaseId.current
    void localization.acquireSemanticRuntime(leaseId).catch(() => undefined)
    return () => {
      void localization.releaseSemanticRuntime(leaseId).catch(() => undefined)
    }
  }, [localization, projectRootPath])

  const ensureTargetFile = () => {
    if (!props.project || targetFile) return
    props.onI18nFilesChange([...props.i18nFiles, createI18nFile(props.project.rootPath, props.targetLocale)])
  }
  const initialize = async () => {
    if (!props.localizationContext) return
    const binding = bindingFor(props.localizationContext)
    if (!binding) return
    setInitializing(true)
    setError(null)
    try {
      const fileNamespace = targetFile?.relativePath ?? `${props.localizationContext.sourceNamespace}/${props.targetLocale}.json`
      const confirmed: ConfirmedTranslation[] = existing.map((entry) => ({
        sourceLocale: props.sourceLocale,
        targetLocale: props.targetLocale,
        sourceText: entry.sourceText,
        targetText: entry.targetText,
        fileNamespace,
        unitKey: entry.key,
      }))
      const result = await localization.initializePlan({
        jobId: crypto.randomUUID(),
        ...binding,
        planName: props.localizationContext.displayName,
        sourceLocale: props.sourceLocale,
        targetLocale: props.targetLocale,
        fileNamespace,
        importExisting: importExisting && confirmed.length > 0,
        entries: confirmed,
      })
      setScopeId(result.snapshot.scope.id)
      setInitializedKey(contextKey)
      ensureTargetFile()
      setStep('translate')
    } catch (nextError) {
      setError(initializationError(nextError, copy))
    } finally {
      setInitializing(false)
    }
  }
  const save = async () => {
    if (check.blocking.length) return
    setSaving(true)
    setError(null)
    setMemoryWarning(false)
    try {
      await props.onSave()
      setSaved(true)
      if (scopeId && props.localizationContext) {
        const fileNamespace = targetFile?.relativePath ?? `${props.localizationContext.sourceNamespace}/${props.targetLocale}.json`
        try {
          await localization.recordConfirmed({
            jobId: crypto.randomUUID(),
            scopeId,
            fileNamespace,
            entries: entries
              .filter((entry) => entry.targetText.trim())
              .map((entry) => ({
                sourceLocale: props.sourceLocale,
                targetLocale: props.targetLocale,
                sourceText: entry.sourceText,
                targetText: entry.targetText,
                fileNamespace,
                unitKey: entry.key,
              })),
          })
        } catch {
          setMemoryWarning(true)
        }
      }
    } catch {
      setError(copy.workflowSaveFailed)
    } finally {
      setSaving(false)
    }
  }
  const steps: Array<[WorkflowStep, string]> = [
    ['setup', copy.workflowSetup],
    ['translate', copy.workflowTranslate],
    ['review', copy.workflowReview],
  ]
  const canOpen = (candidate: WorkflowStep) => candidate === 'setup' || initializedKey === contextKey

  if (!props.project) return <TranslationEditor {...props} />
  return (
    <div className="translation-workflow flex h-full min-h-0 flex-col bg-(--bg-app)">
      <header className="translation-workflow-header flex shrink-0 items-center gap-4 border-b border-(--border-color) px-5 py-3">
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-(--text-primary)">{props.project.name}</strong>
          <nav className="mt-2 flex items-center gap-1" aria-label={copy.workspaceLabel}>
            {steps.map(([id, label], index) => (
              <button
                key={id}
                type="button"
                disabled={!canOpen(id)}
                className={cx('translation-workflow-step', step === id && 'is-active')}
                onClick={() => canOpen(id) && setStep(id)}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            ))}
          </nav>
        </div>
        {props.onChangeProject ? (
          <button type="button" className="control-button" onClick={props.onChangeProject}>
            <ArrowLeft className="h-4 w-4" />
            {copy.workflowChangeProject}
          </button>
        ) : null}
      </header>
      {error ? (
        <p className="translation-workflow-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        {step === 'setup' ? (
          <main className="translation-workflow-setup custom-scrollbar h-full overflow-auto p-6">
            <div className="mx-auto max-w-3xl">
              <header>
                <Languages className="h-6 w-6 text-(--accent)" />
                <h1>{copy.workflowSetupTitle}</h1>
                <p>{copy.workflowSetupDescription}</p>
              </header>
              <section className="translation-workflow-locale-grid">
                <label>
                  <span>{copy.sourceLocaleLabel}</span>
                  <select
                    className="control-input"
                    value={props.sourceLocale}
                    onChange={(event) => props.onSourceLocaleChange(event.target.value)}
                  >
                    {props.i18nFiles
                      .filter((file) => file.locale !== props.targetLocale)
                      .map((file) => (
                        <option key={file.locale} value={file.locale}>
                          {file.locale === 'default' ? copy.defaultLocaleLabel : file.locale}
                        </option>
                      ))}
                  </select>
                </label>
                <span aria-hidden>→</span>
                <label>
                  <span>{copy.targetLocaleLabel}</span>
                  <select
                    className="control-input"
                    value={props.targetLocale}
                    onChange={(event) => props.onTargetLocaleChange(event.target.value)}
                  >
                    {Array.from(new Set([...props.i18nFiles.map((file) => file.locale), 'zh-CN', 'en-US', 'ja-JP', 'ko-KR']))
                      .filter((locale) => locale !== props.sourceLocale && locale !== 'default')
                      .map((locale) => (
                        <option key={locale} value={locale}>
                          {locale}
                        </option>
                      ))}
                  </select>
                </label>
              </section>
              <section className="translation-workflow-plan">
                <div>
                  <Settings2 className="h-5 w-5" />
                  <span>
                    <strong>{copy.workflowPlanTitle}</strong>
                    <small>{copy.workflowPlanDescription}</small>
                  </span>
                </div>
                {existing.length ? (
                  <label>
                    <input type="checkbox" checked={importExisting} onChange={(event) => setImportExisting(event.target.checked)} />
                    {copy.workflowImportExisting(existing.length)}
                  </label>
                ) : null}
              </section>
              <button
                type="button"
                className="control-button control-button-primary"
                disabled={initializing || !props.localizationContext || props.sourceLocale === props.targetLocale}
                onClick={() => void initialize()}
              >
                {initializing ? copy.workflowInitializing : copy.workflowInitialize}
              </button>
            </div>
          </main>
        ) : null}
        {initializedKey === contextKey ? (
          <div className={cx('h-full min-h-0 flex-col', step === 'translate' ? 'flex' : 'hidden')}>
            <div className="min-h-0 flex-1">
              <TranslationEditor {...props} showSaveAction={false} onOpenReviewCountChange={setOpenReviewCount} />
            </div>
            <footer className="translation-workflow-footer">
              <button type="button" className="control-button control-button-primary" onClick={() => setStep('review')}>
                {copy.workflowContinue}
              </button>
            </footer>
          </div>
        ) : null}
        {step === 'review' ? (
          <main className="translation-workflow-review custom-scrollbar h-full overflow-auto p-6">
            <div className="mx-auto max-w-4xl">
              <header>
                <h1>{copy.workflowReviewTitle}</h1>
                <p>{copy.workflowReviewDescription}</p>
              </header>
              <div className="translation-workflow-summary">
                <section data-tone="danger">
                  <AlertTriangle />
                  <span>{copy.workflowBlocking}</span>
                  <strong>{check.blocking.length}</strong>
                </section>
                <section data-tone="warning">
                  <AlertTriangle />
                  <span>{copy.workflowWarnings}</span>
                  <strong>{check.warnings.length + openReviewCount}</strong>
                </section>
                <section data-tone="success">
                  <CheckCircle2 />
                  <span>{copy.workflowPassed}</span>
                  <strong>{check.passed}</strong>
                </section>
              </div>
              {[...check.blocking, ...check.warnings].length ? (
                <div className="translation-workflow-issues">
                  {[...check.blocking, ...check.warnings].map((issue, index) => (
                    <button
                      key={`${issue.kind}:${issue.key}:${index}`}
                      type="button"
                      onClick={() => {
                        if (issue.key) props.onQueryChange(issue.key)
                        setStep('translate')
                      }}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        <strong>{issue.key ?? props.targetLocale}</strong>
                        <small>{issueLabel(issue, copy)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {openReviewCount ? (
                <p className="translation-workflow-memory-warning">
                  <AlertTriangle className="h-4 w-4" />
                  {copy.workflowOpenReview(openReviewCount)}
                </p>
              ) : null}
              {saved ? (
                <p className="translation-workflow-success">
                  <Check className="h-4 w-4" />
                  {copy.workflowSaved}
                </p>
              ) : null}
              {memoryWarning ? (
                <p className="translation-workflow-memory-warning">
                  <AlertTriangle className="h-4 w-4" />
                  {copy.memoryLearningFailed}
                </p>
              ) : null}
              <div className="translation-workflow-review-actions">
                <button
                  type="button"
                  className="control-button"
                  onClick={() => {
                    setSaved(false)
                    setStep('translate')
                  }}
                >
                  {copy.workflowContinueEditing}
                </button>
                <button
                  type="button"
                  className="control-button"
                  onClick={() => {
                    setSaved(false)
                    setStep('setup')
                  }}
                >
                  {copy.workflowAnotherLanguage}
                </button>
                {props.onOpenLocalizationCenter ? (
                  <button type="button" className="control-button" onClick={() => props.onOpenLocalizationCenter?.(scopeId)}>
                    {copy.workflowOpenResources}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="control-button control-button-primary"
                  disabled={saving || check.blocking.length > 0 || !props.canPersist}
                  onClick={() => void save()}
                >
                  <Save className="h-4 w-4" />
                  {copy.workflowSaveAnyway}
                </button>
              </div>
            </div>
          </main>
        ) : null}
      </div>
    </div>
  )
}

export default TranslationWorkflow
