import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useAiLocalizationCopy, useTranslationEditorCopy } from '@locales/provider'
import type { AiReviewResult, AiReviewRun, LocalizationScopeSettings } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { ResizableColumnHeader, useAiLocalizationColumnWidths } from '../model/useAiLocalizationColumnWidths'

const NOTICE = 'ai-localization-quality-error'
const PAGE_SIZE = 20

export function QualityHistoryView({ scopeId }: { scopeId: string }) {
  const localization = useLocalization()
  const copy = useAiLocalizationCopy()
  const reviewCopy = useTranslationEditorCopy()
  const publish = useNotificationPublisher()
  const [runs, setRuns] = useState<AiReviewRun[]>([])
  const [runOffset, setRunOffset] = useState(0)
  const [runTotal, setRunTotal] = useState(0)
  const [selected, setSelected] = useState<AiReviewResult | null>(null)
  const [error, setError] = useState(false)
  const [view, setView] = useState<'rules' | 'history'>('rules')
  const [settings, setSettings] = useState<LocalizationScopeSettings | null>(null)
  const historyColumns = useAiLocalizationColumnWidths('quality-history', {
    created: 170,
    locale: 140,
    engine: 150,
    issues: 100,
    passed: 100,
    warnings: 110,
    critical: 100,
    status: 120,
  })
  const retryRef = useRef<() => void>(() => undefined)
  const runHistoryLoad = useLatestTask('ai-localization-quality-history')
  const fail = () => {
    setError(true)
    publish({
      id: NOTICE,
      level: 'error',
      title: copy.knowledgeError,
      description: copy.knowledgeError,
      action: { label: copy.retry, callback: () => retryRef.current(), tone: 'primary' },
    })
  }
  useEffect(() => () => dismissNotification(NOTICE), [])
  useEffect(() => {
    if (!scopeId) {
      setRuns([])
      return
    }
    const reload = () => {
      void runHistoryLoad(async (task) => {
        const [page, scope] = await Promise.all([
          localization.listReviewRuns({ scopeId, offset: runOffset, limit: PAGE_SIZE }),
          localization.loadScope(scopeId),
        ])
        if (task.isCurrent()) {
          setSettings(scope.settings)
          setRuns(page.records)
          setRunTotal(page.total)
        }
        const id = page.records[0]?.id
        const value = id ? await localization.loadReviewRun(id) : null
        if (task.isCurrent()) setSelected(value)
      }).catch((error) => {
        if (!(error instanceof TaskCancelledError)) fail()
      })
    }
    retryRef.current = reload
    reload()
  }, [localization, runHistoryLoad, runOffset, scopeId])
  useEffect(() => setRunOffset(0), [scopeId])
  const load = async (run: AiReviewRun) => {
    try {
      setSelected(await localization.loadReviewRun(run.id))
      setError(false)
    } catch {
      fail()
    }
  }
  const saveRules = async () => {
    if (!settings) return
    try {
      const value = await localization.saveScopeSettings(settings)
      setSettings(value.settings)
      setError(false)
    } catch {
      fail()
    }
  }
  return (
    <div className="ai-localization-layout">
      <main className="ai-localization-main">
        <div className="ai-localization-filters">
          <button
            type="button"
            className={view === 'rules' ? 'control-button control-button-primary' : 'control-button'}
            onClick={() => setView('rules')}
          >
            {copy.rulesView}
          </button>
          <button
            type="button"
            className={view === 'history' ? 'control-button control-button-primary' : 'control-button'}
            onClick={() => setView('history')}
          >
            {copy.historyView}
          </button>
        </div>
        {view === 'rules' && settings ? (
          <div className="ai-localization-qa-groups">
            <section className="ai-localization-qa-group">
              <header className="ai-localization-qa-group-head">
                <strong>{copy.qaGroupProtection}</strong>
                <span>{copy.qaAlwaysOn}</span>
              </header>
              <label className="ai-localization-qa-rule is-locked">
                <input type="checkbox" checked disabled />
                <span className="ai-localization-qa-rule-text">
                  <strong>{copy.fixedMarkerRule}</strong>
                </span>
                <span className="ai-localization-qa-rule-lock">{copy.qaAlwaysOn}</span>
              </label>
            </section>
            <section className="ai-localization-qa-group">
              <header className="ai-localization-qa-group-head">
                <strong>{copy.qaGroupContent}</strong>
              </header>
              {(
                [
                  ['checkEmpty', copy.emptyRule],
                  ['checkLanguageMix', copy.languageRule],
                  ['checkWhitespace', copy.whitespaceRule],
                  ['checkLineBreaks', copy.lineBreakRule],
                  ['checkLength', copy.lengthRule],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="ai-localization-qa-rule">
                  <input
                    type="checkbox"
                    checked={settings.qaConfig[key]}
                    onChange={(event) => setSettings({ ...settings, qaConfig: { ...settings.qaConfig, [key]: event.target.checked } })}
                  />
                  <span className="ai-localization-qa-rule-text">
                    <strong>{label}</strong>
                  </span>
                </label>
              ))}
            </section>
            <section className="ai-localization-qa-group">
              <header className="ai-localization-qa-group-head">
                <strong>{copy.qaGroupAutomation}</strong>
              </header>
              <label className="ai-localization-qa-rule">
                <input
                  type="checkbox"
                  checked={settings.autoReview}
                  onChange={(event) => setSettings({ ...settings, autoReview: event.target.checked })}
                />
                <span className="ai-localization-qa-rule-text">
                  <strong>{copy.automaticReview}</strong>
                </span>
              </label>
            </section>
            <div className="ai-localization-qa-footer">
              <button type="button" className="control-button control-button-primary" onClick={() => void saveRules()}>
                {copy.saveRules}
              </button>
            </div>
          </div>
        ) : null}
        {view === 'history' ? (
          <>
            <div className="ai-localization-table">
              <table>
                <thead>
                  <tr>
                    {[
                      ['created', copy.reviewCreated],
                      ['locale', copy.localePair],
                      ['engine', copy.reviewEngine],
                      ['issues', copy.reviewIssues],
                      ['passed', copy.reviewPassed],
                      ['warnings', copy.reviewWarnings],
                      ['critical', copy.reviewCritical],
                      ['status', copy.reviewStatus],
                    ].map(([column, label]) => (
                      <ResizableColumnHeader
                        key={column}
                        column={column}
                        width={historyColumns.widths[column]}
                        resizeLabel={copy.resizeColumn(label)}
                        setWidth={historyColumns.setWidth}
                      >
                        {label}
                      </ResizableColumnHeader>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className={selected?.run.id === run.id ? 'is-selected' : ''} onClick={() => void load(run)}>
                      <td>{new Date(run.createdAtMs).toLocaleString()}</td>
                      <td>
                        {run.sourceLocale} → {run.targetLocale}
                      </td>
                      <td>{run.engine}</td>
                      <td className="num">{run.summary.checked}</td>
                      <td className="num">{run.summary.passed}</td>
                      <td className={`num ${run.summary.warnings > 0 ? 'warn' : 'muted'}`}>{run.summary.warnings}</td>
                      <td className={`num ${run.summary.critical > 0 ? 'crit' : 'muted'}`}>{run.summary.critical}</td>
                      <td>{run.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!runs.length ? <p>{error ? copy.knowledgeError : copy.noReviewRuns}</p> : null}
              {runTotal > 0 ? (
                <nav
                  className="ai-localization-pagination"
                  aria-label={copy.pageSummary(Math.min(runOffset + 1, runTotal), Math.min(runOffset + PAGE_SIZE, runTotal), runTotal)}
                >
                  <button
                    type="button"
                    className="icon-button"
                    disabled={runOffset === 0}
                    aria-label={copy.previousPage}
                    title={copy.previousPage}
                    onClick={() => setRunOffset(Math.max(0, runOffset - PAGE_SIZE))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span>{copy.pageSummary(Math.min(runOffset + 1, runTotal), Math.min(runOffset + PAGE_SIZE, runTotal), runTotal)}</span>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={runOffset + PAGE_SIZE >= runTotal}
                    aria-label={copy.nextPage}
                    title={copy.nextPage}
                    onClick={() => setRunOffset(runOffset + PAGE_SIZE)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              ) : null}
            </div>
          </>
        ) : null}
      </main>
      <aside className="ai-localization-inspector">
        {view === 'history' && selected ? (
          <>
            <h2>{copy.reviewIssues}</h2>
            <dl>
              <dt>{copy.reviewCritical}</dt>
              <dd>{selected.run.summary.critical}</dd>
              <dt>{copy.reviewMajor}</dt>
              <dd>{selected.run.summary.major}</dd>
              <dt>{copy.reviewMinor}</dt>
              <dd>{selected.run.summary.minor}</dd>
            </dl>
            <div className="ai-localization-history-issues">
              {selected.issues.map((issue) => (
                <article key={issue.id}>
                  <header>
                    <code>{issue.unitKey}</code>
                    <span>
                      {issue.severity} · {issue.status}
                    </span>
                  </header>
                  <p>{reviewCopy.reviewLocalReasons[issue.reason] ?? issue.reason}</p>
                  {issue.suggestion ? <pre>{issue.suggestion}</pre> : null}
                </article>
              ))}
            </div>
          </>
        ) : view === 'history' ? (
          <p>{copy.selectReviewRun}</p>
        ) : (
          <p>{copy.fixedMarkerRule}</p>
        )}
      </aside>
    </div>
  )
}
