import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useAiLocalizationCopy, useSettingsMenuCopy } from '@locales/provider'
import type { AiLocalizationScope, AiUsageQuery, AiUsageRecord, AiUsageSummary } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { isString, useAiLocalizationPersistentState } from '../model/localizationPageState'
import { ResizableColumnHeader, useAiLocalizationColumnWidths } from '../model/useAiLocalizationColumnWidths'

const day = 86_400_000
const NOTICE = 'ai-localization-project-usage-error'
function range(days: number) {
  const to = Date.now()
  return { fromMs: to - days * day, toMs: to }
}
type UsageFilters = {
  period: 'today' | '7' | '30' | 'custom'
  from: string
  to: string
  engine: AiUsageQuery['engineKind']
  profile: string
  operation: string
  succeeded: boolean | null
}
const isUsageFilters = (value: unknown): value is UsageFilters => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UsageFilters>
  return (
    (candidate.period === 'today' || candidate.period === '7' || candidate.period === '30' || candidate.period === 'custom') &&
    typeof candidate.from === 'string' &&
    typeof candidate.to === 'string' &&
    (candidate.engine === null || candidate.engine === 'generative-ai' || candidate.engine === 'machine-translation') &&
    typeof candidate.profile === 'string' &&
    typeof candidate.operation === 'string' &&
    (candidate.succeeded === null || typeof candidate.succeeded === 'boolean')
  )
}
export function ProjectUsageView() {
  const localization = useLocalization()
  const copy = useAiLocalizationCopy()
  const usage = useSettingsMenuCopy().ai.usage
  const publish = useNotificationPublisher()
  const [scopes, setScopes] = useState<AiLocalizationScope[]>([])
  const [scopeId, setScopeId] = useAiLocalizationPersistentState('scope', '', isString)
  const [filters, setFilters] = useAiLocalizationPersistentState<UsageFilters>(
    'usage',
    {
      period: '7',
      from: new Date(Date.now() - 7 * day).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
      engine: null,
      profile: '',
      operation: '',
      succeeded: null,
    },
    isUsageFilters,
  )
  const { period, from, to, engine, profile, operation, succeeded } = filters
  const [summary, setSummary] = useState<AiUsageSummary | null>(null)
  const [records, setRecords] = useState<AiUsageRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const runScopeLoad = useLatestTask('ai-localization-project-usage-scopes')
  const runUsageLoad = useLatestTask('ai-localization-project-usage-query')
  const dailyColumns = useAiLocalizationColumnWidths('project-usage-daily', {
    date: 130,
    engine: 150,
    profile: 180,
    requests: 100,
    input: 120,
    output: 120,
    characters: 140,
  })
  const totalColumns = useAiLocalizationColumnWidths('project-usage-totals', {
    profile: 180,
    requests: 100,
    input: 120,
    output: 120,
    cached: 120,
    characters: 140,
    failures: 100,
  })
  const fail = () => {
    setError(true)
    publish({
      id: NOTICE,
      level: 'error',
      title: usage.loadError,
      description: usage.loadError,
      action: { label: copy.retry, callback: () => setRetryToken((value) => value + 1), tone: 'primary' },
    })
  }
  useEffect(() => {
    void runScopeLoad(async (task) => {
      const page = await localization.listScopes({ query: null, offset: 0, limit: 200 })
      if (task.isCurrent()) {
        setScopes(page.records.filter((scope) => scope.kind === 'project'))
        setScopeId((value) => value || page.records.find((scope) => scope.kind === 'project')?.id || '')
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) fail()
    })
  }, [localization, retryToken, runScopeLoad, setScopeId])
  useEffect(() => () => dismissNotification(NOTICE), [])
  useEffect(() => {
    if (!scopeId) return
    const selected =
      period === 'today'
        ? range(1)
        : period === '7'
          ? range(7)
          : period === '30'
            ? range(30)
            : { fromMs: new Date(`${from}T00:00:00`).getTime(), toMs: new Date(`${to}T23:59:59.999`).getTime() }
    const query: AiUsageQuery = {
      ...selected,
      profileId: profile || null,
      model: null,
      operation: operation || null,
      engineKind: engine,
      scopeId,
      succeeded,
      offset: 0,
      limit: 500,
    }
    setLoading(true)
    void runUsageLoad(async (task) => {
      const [nextSummary, page] = await Promise.all([localization.queryUsageSummary(query), localization.queryUsageRecords(query)])
      if (task.isCurrent()) {
        setSummary(nextSummary)
        setRecords(page.records)
        setError(false)
        dismissNotification(NOTICE)
        setLoading(false)
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        fail()
        setLoading(false)
      }
    })
  }, [engine, from, localization, operation, period, profile, retryToken, runUsageLoad, scopeId, succeeded, to])
  const profiles = [
    ...new Set([
      ...(summary?.daily.map((row) => row.profileId).filter(Boolean) ?? []),
      ...records.map((row) => row.profileId).filter(Boolean),
    ]),
  ] as string[]
  const operations = [...new Set(records.map((row) => row.operation))]
  const byProfile = new Map<
    string,
    { requests: number; input: number; output: number; cached: number; characters: number; failures: number }
  >()
  for (const row of summary?.daily ?? []) {
    const key = row.profileId ?? usage.unavailable
    const value = byProfile.get(key) ?? { requests: 0, input: 0, output: 0, cached: 0, characters: 0, failures: 0 }
    value.requests += row.totals.requests
    value.input += row.totals.inputTokens
    value.output += row.totals.outputTokens
    value.cached += row.totals.cachedTokens
    value.characters += row.totals.billedCharacters
    value.failures += row.totals.failures
    byProfile.set(key, value)
  }
  return (
    <div className="ai-localization-layout">
      <aside className="ai-localization-scope">
        <h2>{copy.projectUsageTab}</h2>
        {scopes.map((scope) => (
          <button key={scope.id} type="button" className={scopeId === scope.id ? 'is-active' : ''} onClick={() => setScopeId(scope.id)}>
            {scope.name}
          </button>
        ))}
      </aside>
      <main className="ai-localization-main">
        <div className="ai-localization-filters">
          <select
            className="control-input"
            value={period}
            onChange={(event) => setFilters((value) => ({ ...value, period: event.target.value as UsageFilters['period'] }))}
          >
            <option value="today">{usage.today}</option>
            <option value="7">{usage.sevenDays}</option>
            <option value="30">{usage.thirtyDays}</option>
            <option value="custom">{usage.custom}</option>
          </select>
          {period === 'custom' ? (
            <>
              <label>
                <span>{usage.from}</span>
                <input
                  className="control-input"
                  type="date"
                  value={from}
                  onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))}
                />
              </label>
              <label>
                <span>{usage.to}</span>
                <input
                  className="control-input"
                  type="date"
                  value={to}
                  onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))}
                />
              </label>
            </>
          ) : null}
          <select
            className="control-input"
            value={engine ?? ''}
            onChange={(event) => setFilters((value) => ({ ...value, engine: (event.target.value || null) as AiUsageQuery['engineKind'] }))}
          >
            <option value="">{usage.allEngines}</option>
            <option value="generative-ai">{usage.generativeAi}</option>
            <option value="machine-translation">{usage.machineTranslation}</option>
          </select>
          <select
            className="control-input"
            value={profile}
            onChange={(event) => setFilters((value) => ({ ...value, profile: event.target.value }))}
          >
            <option value="">{usage.allProfiles}</option>
            {profiles.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className="control-input"
            value={operation}
            onChange={(event) => setFilters((value) => ({ ...value, operation: event.target.value }))}
          >
            <option value="">{usage.allOperations}</option>
            {operations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className="control-input"
            value={succeeded === null ? '' : String(succeeded)}
            onChange={(event) =>
              setFilters((value) => ({ ...value, succeeded: event.target.value === '' ? null : event.target.value === 'true' }))
            }
          >
            <option value="">{usage.allStatuses}</option>
            <option value="true">{usage.succeeded}</option>
            <option value="false">{usage.failed}</option>
          </select>
        </div>
        {summary ? (
          <div className="ai-project-usage-summary">
            <div>
              <span>{usage.inputTokens}</span>
              <strong>{summary.totals.inputTokens.toLocaleString()}</strong>
            </div>
            <div>
              <span>{usage.outputTokens}</span>
              <strong>{summary.totals.outputTokens.toLocaleString()}</strong>
            </div>
            <div>
              <span>{usage.cachedTokens}</span>
              <strong>{summary.totals.cachedTokens.toLocaleString()}</strong>
            </div>
            <div>
              <span>{usage.characters}</span>
              <strong>{summary.totals.billedCharacters.toLocaleString()}</strong>
            </div>
            <div>
              <span>{usage.requests}</span>
              <strong>{summary.totals.requests.toLocaleString()}</strong>
            </div>
            <div>
              <span>{usage.failures}</span>
              <strong>{summary.totals.failures.toLocaleString()}</strong>
            </div>
          </div>
        ) : null}
        <div className="ai-project-usage-tables">
          <div className="ai-localization-table">
            <table>
              <thead>
                <tr>
                  {[
                    ['date', usage.date],
                    ['engine', usage.engine],
                    ['profile', usage.profile],
                    ['requests', usage.requests],
                    ['input', usage.inputTokens],
                    ['output', usage.outputTokens],
                    ['characters', usage.characters],
                  ].map(([column, label]) => (
                    <ResizableColumnHeader
                      key={column}
                      column={column}
                      width={dailyColumns.widths[column]}
                      resizeLabel={copy.resizeColumn(label)}
                      setWidth={dailyColumns.setWidth}
                    >
                      {label}
                    </ResizableColumnHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary?.daily.map((row) => (
                  <tr key={`${row.date}:${row.engineKind}:${row.profileId}:${row.operation}`}>
                    <td>{row.date}</td>
                    <td>{row.engineKind}</td>
                    <td>{row.profileId ?? usage.unavailable}</td>
                    <td>{row.totals.requests}</td>
                    <td>{row.totals.inputTokens}</td>
                    <td>{row.totals.outputTokens}</td>
                    <td>{row.totals.billedCharacters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ai-localization-table">
            <table>
              <thead>
                <tr>
                  {[
                    ['profile', usage.profile],
                    ['requests', usage.requests],
                    ['input', usage.inputTokens],
                    ['output', usage.outputTokens],
                    ['cached', usage.cachedTokens],
                    ['characters', usage.characters],
                    ['failures', usage.failures],
                  ].map(([column, label]) => (
                    <ResizableColumnHeader
                      key={column}
                      column={column}
                      width={totalColumns.widths[column]}
                      resizeLabel={copy.resizeColumn(label)}
                      setWidth={totalColumns.setWidth}
                    >
                      {label}
                    </ResizableColumnHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...byProfile]
                  .sort((a, b) => b[1].requests - a[1].requests)
                  .map(([name, value]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{value.requests}</td>
                      <td>{value.input}</td>
                      <td>{value.output}</td>
                      <td>{value.cached}</td>
                      <td>{value.characters}</td>
                      <td>{value.failures}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        {loading ? (
          <p className="ai-localization-empty">{usage.loading}</p>
        ) : error ? (
          <p role="alert" className="ai-localization-empty">
            {usage.loadError}
          </p>
        ) : null}
      </main>
      <aside className="ai-localization-inspector">
        <p>{scopeId ? scopes.find((scope) => scope.id === scopeId)?.name : copy.selectEntry}</p>
      </aside>
    </div>
  )
}
