import { ChevronLeft, ChevronRight, Download, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePlatformPorts } from '@app/providers/usePlatformPorts'
import { useLocalization } from '@entities/localization'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiUsageQuery, AiUsageRecordPage, AiUsageSummary } from '@shared/contracts'
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
}

function dateInput(value: number) {
  return new Date(value).toISOString().slice(0, 10)
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
  const [profileId, setProfileId] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState<boolean | null>(null)
  const [summary, setSummary] = useState(emptySummary)
  const [page, setPage] = useState<AiUsageRecordPage>({ records: [], total: 0 })
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const actionRef = useRef<() => void>(() => {})

  const query: AiUsageQuery = {
    fromMs: from,
    toMs: to,
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
      const [nextSummary, nextPage] = await Promise.all([localization.queryUsageSummary(query), localization.queryUsageRecords(query)])
      setSummary(nextSummary)
      setPage(nextPage)
      setError(null)
    } catch {
      setError(copy.loadError)
      publish({
        id: NOTICE_ID,
        level: 'error',
        title: copy.loadError,
        description: copy.actionError,
        action: { label: copy.retry, callback: () => actionRef.current(), tone: 'primary' },
      })
    } finally {
      setLoading(false)
    }
  }
  actionRef.current = () => void load()
  useEffect(() => {
    void load()
  }, [from, to, engineKind, model, offset, profileId, operation, succeeded])
  useEffect(() => setOffset(0), [from, to, engineKind, model, profileId, operation, succeeded])
  useEffect(() => () => dismissNotification(NOTICE_ID), [])

  const selectRange = (next: typeof range) => {
    setRange(next)
    if (next === 'custom') return
    const end = startOfToday() + day
    const days = next === 'today' ? 1 : Number(next)
    setFrom(end - days * day)
    setTo(end)
  }
  const runAction = async (action: () => Promise<unknown>) => {
    try {
      dismissNotification(NOTICE_ID)
      await action()
      await load()
    } catch {
      setError(copy.actionError)
      publish({ id: NOTICE_ID, level: 'error', title: copy.actionError, description: copy.actionError })
    }
  }
  const profiles = [...new Set(page.records.flatMap((record) => (record.profileId ? [record.profileId] : [])))]
  const operations = [...new Set(page.records.map((record) => record.operation))]
  const number = new Intl.NumberFormat()

  return (
    <section className="settings-ai-usage" aria-busy={loading}>
      <header className="settings-ai-heading">
        <div>
          <p className="settings-window-section-title">{copy.title}</p>
          <p className="settings-window-section-copy mt-1">{copy.description}</p>
        </div>
        <button className="icon-button h-10 w-10" title={copy.loading} aria-label={copy.loading} onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>
      <div className="settings-ai-usage-filters">
        <div className="settings-ai-segments" role="radiogroup">
          {(['today', '7', '30', 'custom'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={range === value}
              className={range === value ? 'is-active' : ''}
              onClick={() => selectRange(value)}
            >
              {value === 'today' ? copy.today : value === '7' ? copy.sevenDays : value === '30' ? copy.thirtyDays : copy.custom}
            </button>
          ))}
        </div>
        {range === 'custom' ? (
          <>
            <label>
              <span>{copy.from}</span>
              <input
                type="date"
                className="control-input"
                value={dateInput(from)}
                onChange={(event) => setFrom(new Date(`${event.target.value}T00:00:00`).getTime())}
              />
            </label>
            <label>
              <span>{copy.to}</span>
              <input
                type="date"
                className="control-input"
                value={dateInput(to - day)}
                onChange={(event) => setTo(new Date(`${event.target.value}T00:00:00`).getTime() + day)}
              />
            </label>
          </>
        ) : null}
        <select
          className="control-input"
          aria-label={copy.engine}
          value={engineKind ?? ''}
          onChange={(e) => setEngineKind((e.target.value || null) as AiUsageQuery['engineKind'])}
        >
          <option value="">{copy.allEngines}</option>
          <option value="generative-ai">{copy.generativeAi}</option>
          <option value="machine-translation">{copy.machineTranslation}</option>
        </select>
        <select
          className="control-input"
          aria-label={copy.profile}
          value={profileId ?? ''}
          onChange={(e) => setProfileId(e.target.value || null)}
        >
          <option value="">{copy.allProfiles}</option>
          {profiles.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        <input
          className="control-input"
          aria-label={copy.model}
          placeholder={copy.allModels}
          value={model ?? ''}
          onChange={(event) => setModel(event.target.value.trim() || null)}
          list="ai-usage-models"
        />
        <datalist id="ai-usage-models">
          {[...new Set(page.records.flatMap((record) => (record.model ? [record.model] : [])))].map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <select
          className="control-input"
          aria-label={copy.operation}
          value={operation ?? ''}
          onChange={(e) => setOperation(e.target.value || null)}
        >
          <option value="">{copy.allOperations}</option>
          {operations.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className="control-input"
          aria-label={copy.status}
          value={succeeded === null ? '' : String(succeeded)}
          onChange={(e) => setSucceeded(e.target.value === '' ? null : e.target.value === 'true')}
        >
          <option value="">{copy.allStatuses}</option>
          <option value="true">{copy.succeeded}</option>
          <option value="false">{copy.failed}</option>
        </select>
      </div>
      {error ? (
        <p role="alert" className="settings-ai-error">
          {error}
        </p>
      ) : null}
      <div className="settings-ai-usage-totals">
        {[
          [copy.inputTokens, summary.totals.inputTokens],
          [copy.outputTokens, summary.totals.outputTokens],
          [copy.cachedTokens, summary.totals.cachedTokens],
          [copy.characters, summary.totals.billedCharacters],
          [copy.requests, summary.totals.requests],
          [copy.failures, summary.totals.failures],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{number.format(value as number)}</strong>
          </div>
        ))}
      </div>
      <div className="settings-ai-usage-table">
        <table>
          <thead>
            <tr>
              <th>{copy.date}</th>
              <th>{copy.engine}</th>
              <th>{copy.profile}</th>
              <th>{copy.operation}</th>
              <th>{copy.inputTokens}</th>
              <th>{copy.outputTokens}</th>
              <th>{copy.characters}</th>
              <th>{copy.requests}</th>
            </tr>
          </thead>
          <tbody>
            {summary.daily.map((row) => (
              <tr key={`${row.date}:${row.engineKind}:${row.profileId}:${row.operation}`}>
                <td>{row.date}</td>
                <td>{row.engineKind}</td>
                <td>{row.profileId ?? copy.unavailable}</td>
                <td>{row.operation}</td>
                <td>{number.format(row.totals.inputTokens)}</td>
                <td>{number.format(row.totals.outputTokens)}</td>
                <td>{number.format(row.totals.billedCharacters)}</td>
                <td>{number.format(row.totals.requests)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !summary.daily.length ? <p className="settings-ai-empty">{copy.empty}</p> : null}
      </div>
      <div className="settings-ai-usage-table">
        <table>
          <thead>
            <tr>
              <th>{copy.date}</th>
              <th>{copy.profile}</th>
              <th>{copy.model}</th>
              <th>{copy.operation}</th>
              <th>{copy.status}</th>
              <th>{copy.latency}</th>
            </tr>
          </thead>
          <tbody>
            {page.records.map((row) => (
              <tr key={`${row.jobId}:${row.attempt}`}>
                <td>{new Date(row.occurredAtMs).toLocaleString()}</td>
                <td>{row.profileId ?? copy.unavailable}</td>
                <td>{row.model ?? copy.unavailable}</td>
                <td>{row.operation}</td>
                <td>{row.succeeded ? copy.succeeded : copy.failed}</td>
                <td>{row.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
        {page.total > 0 ? (
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
        ) : null}
      </div>
      <footer className="settings-ai-usage-actions">
        <button
          className="control-button"
          onClick={() =>
            void runAction(async () => {
              const path = await dialog.saveFile({ defaultPath: 'ai-usage.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
              if (path) await localization.exportUsage(query, path)
            })
          }
        >
          <Download className="h-4 w-4" />
          {copy.exportCsv}
        </button>
        <button
          className="control-button"
          onClick={() =>
            window.confirm(copy.clearDetailsConfirm) && void runAction(() => localization.clearUsage('detail-older-than90-days'))
          }
        >
          {copy.clearDetails}
        </button>
        <button
          className="control-button"
          onClick={() => window.confirm(copy.clearAllConfirm) && void runAction(() => localization.clearUsage('all'))}
        >
          <Trash2 className="h-4 w-4" />
          {copy.clearAll}
        </button>
      </footer>
    </section>
  )
}
