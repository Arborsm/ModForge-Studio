import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePlatformPorts } from '@app/providers/usePlatformPorts'
import { useLocalization } from '@entities/localization'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiUsageQuery, AiUsageRecordPage, AiUsageSummary } from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'

const NOTICE_ID = 'ai-usage-error'
const day = 24 * 60 * 60 * 1000
const PAGE_SIZE = 100
const emptySummary: AiUsageSummary = {
  totals: {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    billedCharacters: 0,
    requestCharacters: 0,
    responseCharacters: 0,
    requests: 0,
    failures: 0,
    unavailableUsageRequests: 0,
  },
  daily: [],
  diagnostics: {
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    attemptSuccessRate: 0,
    jobs: 0,
    successfulJobs: 0,
    jobSuccessRate: 0,
    cacheEligibleRequests: 0,
    cacheHitRequests: 0,
    cacheHitRate: 0,
    tokenUnavailableRequests: 0,
    detailFromMs: 0,
    detailComplete: true,
    providerModels: [],
    failureCategories: [],
  },
}

function startOfToday() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value.getTime()
}

export function AiUsageSection() {
  const localization = useLocalization()
  const { dialog } = usePlatformPorts()
  const copy = useSettingsMenuCopy().ai.usage
  const publish = useNotificationPublisher()
  const [range, setRange] = useState<'today' | '7' | '30' | 'custom'>('7')
  const [from, setFrom] = useState(startOfToday() - 6 * day)
  const [to, setTo] = useState(startOfToday() + day)
  const [engineKind, setEngineKind] = useState<AiUsageQuery['engineKind']>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [failureCategory, setFailureCategory] = useState<string | null>(null)
  const [usageFacet, setUsageFacet] = useState<AiUsageQuery['usageFacet']>(null)
  const [profileId] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState<boolean | null>(null)
  const [summary, setSummary] = useState(emptySummary)
  const [page, setPage] = useState<AiUsageRecordPage>({ records: [], total: 0 })
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actionRef = useRef<() => void>(() => {})
  const runLoad = useLatestTask('settings-ai-usage-load')

  const query: AiUsageQuery = {
    fromMs: from,
    toMs: to,
    provider,
    failureCategory,
    usageFacet,
    profileId,
    model,
    operation,
    engineKind,
    scopeId: null,
    succeeded,
    offset,
    limit: PAGE_SIZE,
  }
  const load = async () => {
    setLoading(true)
    dismissNotification(NOTICE_ID)
    try {
      await runLoad(async (task) => {
        const [nextSummary, nextPage] = await Promise.all([localization.queryUsageSummary(query), localization.queryUsageRecords(query)])
        if (task.isCurrent()) {
          setSummary(nextSummary)
          setPage(nextPage)
          setError(null)
          setReady(true)
          setLoading(false)
        }
      })
    } catch (cause) {
      if (cause instanceof TaskCancelledError) return
      setError(copy.loadError)
      setReady(true)
      setLoading(false)
      publish({
        id: NOTICE_ID,
        level: 'error',
        title: copy.loadError,
        description: copy.actionError,
        action: { label: copy.retry, callback: () => actionRef.current(), tone: 'primary' },
      })
    }
  }
  actionRef.current = () => void load()
  useEffect(() => {
    void load()
  }, [from, to, engineKind, failureCategory, model, offset, operation, profileId, provider, succeeded, usageFacet])
  useEffect(() => setOffset(0), [from, to, engineKind, failureCategory, model, operation, profileId, provider, succeeded, usageFacet])
  useEffect(() => () => dismissNotification(NOTICE_ID), [])

  const selectRange = (next: typeof range) => {
    setRange(next)
    if (next === 'custom') return
    const end = startOfToday() + day
    const days = next === 'today' ? 1 : Number(next)
    setFrom(end - days * day)
    setTo(end)
  }
  const runAction = async (action: () => Promise<unknown>, options?: { runningTitle: string; successTitle: string }) => {
    try {
      dismissNotification(NOTICE_ID)
      if (options) {
        publish({ id: NOTICE_ID, level: 'info', title: options.runningTitle, autoDismissMs: null })
      }
      await action()
      await load()
      if (options) {
        dismissNotification(NOTICE_ID)
        publish({ id: NOTICE_ID, level: 'success', title: options.successTitle })
      }
    } catch {
      setError(copy.actionError)
      dismissNotification(NOTICE_ID)
      publish({ id: NOTICE_ID, level: 'error', title: copy.actionError, description: copy.actionError })
    }
  }
  const operations = [...new Set([...summary.daily.map((row) => row.operation), ...page.records.map((record) => record.operation)])]
  const number = new Intl.NumberFormat()
  const percentage = (value: number) => `${(value * 100).toFixed(1)}%`
  const latency = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`)
  const hasDiagnosticFilter = Boolean(provider || failureCategory || usageFacet || succeeded !== null)
  const clearDiagnosticFilter = () => {
    setProvider(null)
    setFailureCategory(null)
    setUsageFacet(null)
    setSucceeded(null)
  }
  const maximumProviderAttempts = Math.max(1, ...summary.diagnostics.providerModels.map((item) => item.attempts))
  const maximumFailureAttempts = Math.max(1, ...summary.diagnostics.failureCategories.map((item) => item.attempts))
  const activeFilterLabel = failureCategory
    ? failureCategory
    : usageFacet
      ? usageFacet
      : provider
        ? `${provider}${model ? ` · ${model}` : ''}`
        : succeeded === true
          ? copy.succeeded
          : succeeded === false
            ? copy.failed
            : copy.detailFilterAll
  const compactNumber = (value: number) =>
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(2)}M`
      : value >= 1000
        ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 2)}K`
        : number.format(value)

  const kpis: Array<{
    label: string
    value: string
    active: boolean
    action: () => void
  }> = [
    {
      label: copy.requests,
      value: compactNumber(summary.totals.requests),
      active: !hasDiagnosticFilter,
      action: clearDiagnosticFilter,
    },
    {
      label: copy.averageP95Latency,
      value: `${latency(summary.diagnostics.averageLatencyMs)} / ${latency(summary.diagnostics.p95LatencyMs)}`,
      active: false,
      action: clearDiagnosticFilter,
    },
    {
      label: copy.attemptSuccessRate,
      value: percentage(summary.diagnostics.attemptSuccessRate),
      active: succeeded === true,
      action: () => setSucceeded(true),
    },
    {
      label: copy.jobSuccessRate,
      value: percentage(summary.diagnostics.jobSuccessRate),
      active: false,
      action: clearDiagnosticFilter,
    },
    {
      label: copy.cacheHitRate,
      value: percentage(summary.diagnostics.cacheHitRate),
      active: usageFacet === 'cache-hit',
      action: () => setUsageFacet('cache-hit'),
    },
    {
      label: copy.tokenIoFull,
      value: `${compactNumber(summary.totals.inputTokens)} / ${compactNumber(summary.totals.outputTokens)}`,
      active: false,
      action: clearDiagnosticFilter,
    },
    {
      label: copy.tokenUnavailableRequests,
      value: compactNumber(summary.diagnostics.tokenUnavailableRequests),
      active: usageFacet === 'token-unavailable',
      action: () => setUsageFacet('token-unavailable'),
    },
    {
      label: copy.characters,
      value: compactNumber(summary.totals.billedCharacters),
      active: usageFacet === 'mt-billed',
      action: () => setUsageFacet('mt-billed'),
    },
    {
      label: copy.failuresAttempt,
      value: compactNumber(summary.totals.failures),
      active: succeeded === false,
      action: () => setSucceeded(false),
    },
  ]

  const bootstrapping = !ready
  const refreshing = ready && loading

  return (
    <section className={cx('settings-ai-usage', refreshing && 'is-refreshing')} aria-busy={loading}>
      <div className="settings-ai-tab-body">
        <div className="settings-ai-usage-toolbar">
          <div className="settings-ai-usage-seg" role="radiogroup" aria-label={copy.today}>
            {(['today', '7', '30'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={range === value}
                className={range === value ? 'is-active' : ''}
                onClick={() => selectRange(value)}
              >
                {value === 'today' ? copy.today : value === '7' ? copy.sevenDays : copy.thirtyDays}
              </button>
            ))}
          </div>
          <div className="settings-ai-usage-toolbar-filters">
            <CompactSelect
              value={engineKind ?? ''}
              options={[
                { value: '', label: copy.allEngines },
                { value: 'generative-ai', label: copy.generativeAi },
                { value: 'machine-translation', label: copy.machineTranslation },
              ]}
              onChange={(next) => setEngineKind((next || null) as AiUsageQuery['engineKind'])}
              ariaLabel={copy.engine}
              placement="bottom-start"
              className="settings-ai-usage-compact-select"
              triggerClassName="settings-ai-usage-compact-select-trigger"
              menuClassName="settings-ai-usage-compact-select-menu"
            />
            <CompactSelect
              value={operation ?? ''}
              options={[{ value: '', label: copy.allOperations }, ...operations.map((value) => ({ value, label: value }))]}
              onChange={(next) => setOperation(next || null)}
              ariaLabel={copy.operation}
              placement="bottom-start"
              className="settings-ai-usage-compact-select"
              triggerClassName="settings-ai-usage-compact-select-trigger"
              menuClassName="settings-ai-usage-compact-select-menu"
            />
            <button
              type="button"
              className={cx('settings-window-btn', !hasDiagnosticFilter && 'is-placeholder')}
              disabled={!hasDiagnosticFilter}
              aria-hidden={!hasDiagnosticFilter}
              tabIndex={hasDiagnosticFilter ? 0 : -1}
              onClick={clearDiagnosticFilter}
            >
              {copy.clearFilter}
            </button>
          </div>
        </div>

        {bootstrapping ? (
          <div className="settings-ai-usage-body" role="status" aria-live="polite">
            <div className="settings-ai-usage-loading-banner">
              <span className="settings-ai-usage-loading-spinner" aria-hidden="true" />
              <span>{copy.loading}</span>
            </div>
            <div className="settings-ai-usage-kpis" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <div key={index} className="settings-ai-usage-kpi settings-ai-usage-kpi-skeleton">
                  <i />
                  <i />
                </div>
              ))}
            </div>
            <div className="settings-ai-usage-breakdowns" aria-hidden="true">
              <section className="settings-ai-usage-skeleton-block">
                <i />
                <i />
                <i />
                <i />
              </section>
              <section className="settings-ai-usage-skeleton-block">
                <i />
                <i />
                <i />
                <i />
              </section>
            </div>
            <div className="settings-ai-usage-detail settings-ai-usage-skeleton-detail" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : (
          <div className="settings-ai-usage-body">
            {!summary.diagnostics.detailComplete ? (
              <p className="settings-ai-usage-coverage" role="status">
                {copy.detailCoveragePartial(new Date(summary.diagnostics.detailFromMs).toLocaleDateString())}
              </p>
            ) : null}
            <div className="settings-ai-usage-kpis">
              {kpis.map(({ label, value, active, action }) => (
                <button type="button" className={cx('settings-ai-usage-kpi', active && 'is-active')} key={label} onClick={action}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </button>
              ))}
            </div>
            <div className="settings-ai-usage-breakdowns">
              <section>
                <header className="settings-ai-usage-panel-head">
                  <h3>{copy.providerModelBreakdown}</h3>
                </header>
                <div className="settings-ai-usage-panel-body">
                  {summary.diagnostics.providerModels.length ? (
                    summary.diagnostics.providerModels.map((item) => (
                      <button
                        type="button"
                        className="settings-ai-usage-bar"
                        key={`${item.provider}:${item.model ?? ''}`}
                        onClick={() => {
                          setProvider(item.provider)
                          setModel(item.model)
                        }}
                      >
                        <span>
                          <strong>
                            {item.provider} · {item.model ?? copy.unavailable}
                          </strong>
                          <em>{number.format(item.attempts)}</em>
                        </span>
                        <i>
                          <b style={{ width: `${(item.attempts / maximumProviderAttempts) * 100}%` }} />
                        </i>
                      </button>
                    ))
                  ) : (
                    <p className="settings-ai-usage-empty-inline">{copy.empty}</p>
                  )}
                </div>
              </section>
              <section>
                <header className="settings-ai-usage-panel-head">
                  <h3>{copy.failureBreakdown}</h3>
                </header>
                <div className="settings-ai-usage-panel-body">
                  {summary.diagnostics.failureCategories.length ? (
                    summary.diagnostics.failureCategories.map((item) => (
                      <button
                        type="button"
                        className="settings-ai-usage-bar is-failure"
                        key={item.category}
                        onClick={() => setFailureCategory(item.category)}
                      >
                        <span>
                          <strong>{item.category}</strong>
                          <em>{number.format(item.attempts)}</em>
                        </span>
                        <i>
                          <b style={{ width: `${(item.attempts / maximumFailureAttempts) * 100}%` }} />
                        </i>
                      </button>
                    ))
                  ) : (
                    <p className="settings-ai-usage-empty-inline">{copy.empty}</p>
                  )}
                </div>
              </section>
            </div>
            <div className="settings-ai-usage-detail">
              <div className="settings-ai-usage-detail-meta">
                {(() => {
                  const [before = '', after = ''] = copy.detailMeta('\u0001').split('\u0001')
                  return (
                    <span>
                      {before}
                      <strong>{activeFilterLabel}</strong>
                      {after}
                    </span>
                  )
                })()}
              </div>
              {page.total > 0 ? (
                <>
                  <div className="settings-ai-usage-table">
                    <table>
                      <thead>
                        <tr>
                          <th>{copy.date}</th>
                          <th>{copy.job}</th>
                          <th>{copy.attempt}</th>
                          <th>{copy.engine}</th>
                          <th>{copy.profile}</th>
                          <th>{copy.model}</th>
                          <th>{copy.operation}</th>
                          <th>{copy.attemptResult}</th>
                          <th>{copy.jobResult}</th>
                          <th>{copy.failureCategory}</th>
                          <th>{copy.tokenIo}</th>
                          <th>{copy.latency}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.records.map((row) => (
                          <tr key={`${row.jobId}:${row.attempt}`}>
                            <td>{new Date(row.occurredAtMs).toLocaleString()}</td>
                            <td>{row.jobId}</td>
                            <td>{row.attempt}</td>
                            <td>{row.engineKind}</td>
                            <td>{row.profileId ?? copy.unavailable}</td>
                            <td>{row.model ?? copy.unavailable}</td>
                            <td>{row.operation}</td>
                            <td>{row.succeeded ? copy.succeeded : copy.failed}</td>
                            <td>{row.jobSucceeded ? copy.succeeded : copy.failed}</td>
                            <td>{row.failureCategory ?? '—'}</td>
                            <td>
                              {row.inputTokens ?? '—'} / {row.outputTokens ?? '—'}
                            </td>
                            <td>{row.latencyMs} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <nav
                    className="settings-ai-usage-pagination"
                    aria-label={copy.pageSummary(Math.min(offset + 1, page.total), Math.min(offset + PAGE_SIZE, page.total), page.total)}
                  >
                    <button
                      type="button"
                      className="icon-button"
                      disabled={offset === 0}
                      title={copy.previousPage}
                      aria-label={copy.previousPage}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span>{copy.pageSummary(Math.min(offset + 1, page.total), Math.min(offset + PAGE_SIZE, page.total), page.total)}</span>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={offset + PAGE_SIZE >= page.total}
                      title={copy.nextPage}
                      aria-label={copy.nextPage}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </nav>
                </>
              ) : (
                <p className="settings-ai-usage-empty">{error ?? copy.empty}</p>
              )}
            </div>
          </div>
        )}
      </div>
      <footer className="settings-ai-dock">
        <div className="settings-ai-dock-meta">
          <span>{copy.dockMeta}</span>
        </div>
        <div className="settings-window-actions">
          <button
            type="button"
            className="settings-window-btn"
            disabled={bootstrapping}
            onClick={() =>
              void runAction(
                async () => {
                  const path = await dialog.saveFile({ defaultPath: 'ai-usage.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
                  if (path) await localization.exportUsage(query, path)
                },
                { runningTitle: copy.exportRunning, successTitle: copy.exportSuccess },
              )
            }
          >
            {copy.exportCsv}
          </button>
          <button
            type="button"
            className="settings-window-btn settings-window-btn-danger"
            disabled={bootstrapping}
            onClick={() => {
              if (!window.confirm(copy.clearDetailsConfirm)) return
              void runAction(() => localization.clearUsage('detail-older-than90-days'), {
                runningTitle: copy.purgeRunning,
                successTitle: copy.purgeSuccess,
              })
            }}
          >
            {copy.purgeUsage}
          </button>
          <button
            type="button"
            className="settings-window-btn"
            disabled={bootstrapping || loading}
            onClick={() =>
              void runAction(() => load(), {
                runningTitle: copy.refreshing,
                successTitle: copy.refresh,
              })
            }
          >
            {copy.refresh}
          </button>
        </div>
      </footer>
    </section>
  )
}
