import { FileText, Search, Server } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import type { AiLocalizationScope } from '@shared/contracts'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { cx } from '@shared/lib/helper'
import { useAiLocalizationPage } from '../model/useAiLocalizationPage'

const assetCategories = ['Strings', 'Characters', 'Data', 'Dialogue', 'Maps', 'Movies']

export function OfficialCorpusView({
  scopes,
  activeScopeId,
  sourceLocale,
  targetLocale,
}: {
  scopes: AiLocalizationScope[]
  activeScopeId: string
  sourceLocale: string
  targetLocale: string
}) {
  const page = useAiLocalizationPage(sourceLocale, targetLocale)
  const { copy, status } = page
  const localization = useLocalization()
  const publish = useNotificationPublisher()
  const [termScope, setTermScope] = useState(activeScopeId)
  const [overrides, setOverrides] = useState<string[]>([])
  const runOverrideLoad = useLatestTask('ai-localization-official-overrides')
  useEffect(() => setTermScope(activeScopeId), [activeScopeId])
  useEffect(() => {
    if (!page.selected || page.selected.unitKind !== 'term') {
      setOverrides([])
      return
    }
    void runOverrideLoad(async (task) => {
      const values = await Promise.all(
        scopes.map(async (scope) => {
          const result = await localization.listGlossary({
            scopeId: scope.id,
            sourceLocale: page.selected!.sourceLocale,
            targetLocale: page.selected!.targetLocale,
            query: page.selected!.sourceText,
            offset: 0,
            limit: 20,
          })
          return result.records.some(
            (entry) => entry.sourceTerm.trim().localeCompare(page.selected!.sourceText.trim(), undefined, { sensitivity: 'accent' }) === 0,
          )
            ? scope.kind === 'global'
              ? copy.globalScope
              : scope.name
            : null
        }),
      )
      if (task.isCurrent()) setOverrides(values.filter((value): value is string => Boolean(value)))
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        setOverrides([])
        publish({ id: 'official-overrides-error', level: 'error', title: copy.knowledgeError, description: copy.knowledgeError })
      }
    })
  }, [copy.globalScope, copy.knowledgeError, localization, page.selected, publish, runOverrideLoad, scopes])
  const copyTerm = async () => {
    if (!page.selected || !termScope) return
    try {
      await localization.upsertGlossary(termScope, [
        {
          id: '',
          scopeId: termScope,
          sourceLocale: page.selected.sourceLocale,
          targetLocale: page.selected.targetLocale,
          sourceTerm: page.selected.sourceText,
          targetTerm: page.selected.targetText,
          matchMode: 'exact',
          doNotTranslate: false,
          notes: `${page.selected.assetPath} / ${page.selected.unitKey}`,
          updatedAtMs: 0,
        },
      ])
      publish({ id: 'official-term-copied', level: 'success', title: copy.termCopied, description: copy.termCopied })
    } catch {
      publish({ id: 'official-term-copy-error', level: 'error', title: copy.knowledgeError, description: copy.knowledgeError })
    }
  }
  const corpusReady = status?.indexed ?? false
  return (
    <div className="ai-localization-layout ai-localization-official-layout">
      <main className="ai-localization-main ai-localization-official-main">
        <header className="ai-localization-toolbar ai-localization-official-toolbar">
          <div className={cx('ai-localization-status-line ai-localization-official-status', corpusReady ? 'is-ready' : 'is-warn')}>
            <span className={cx('ai-localization-status-dot', corpusReady ? 'is-ready' : 'is-warn')} />
            <span>
              {copy.officialCorpusStatusLabel} <strong>{corpusReady ? copy.indexReadyShort : copy.indexMissingShort}</strong>
            </span>
          </div>
          <dl className="ai-localization-toolbar-stats ai-localization-official-stats">
            <div>
              <dt>{copy.gameVersion}</dt>
              <dd>{status?.gameVersion ?? '--'}</dd>
            </div>
            <div>
              <dt>{copy.revision}</dt>
              <dd className="mono" title={status?.revision ?? ''}>
                {status?.revision?.slice(0, 8) ?? '--'}
              </dd>
            </div>
            <div>
              <dt>{copy.languages}</dt>
              <dd>{status?.languageCount ?? 0}</dd>
            </div>
            <div>
              <dt>{copy.units}</dt>
              <dd>{status?.unitCount ?? 0}</dd>
            </div>
            <div>
              <dt>{copy.semanticUnits}</dt>
              <dd>{status?.semanticEligibleCount ?? '--'}</dd>
            </div>
            <div>
              <dt>{copy.errors}</dt>
              <dd>{status?.errorCount ?? 0}</dd>
            </div>
          </dl>
        </header>
        {page.error ? (
          <p role="alert" className="settings-ai-error">
            {page.error}
          </p>
        ) : null}
        {page.loading ? (
          <div className="ai-localization-status-loading" aria-live="polite" aria-busy="true">
            <p>{copy.loadingStatus}</p>
          </div>
        ) : !page.gameDirectory ? (
          <div className="ai-localization-empty-state">
            <div className="ai-localization-empty-icon">
              <Server className="h-4 w-4" />
            </div>
            <span>{copy.noGameDirectory}</span>
            <button type="button" className="control-button" onClick={() => void page.chooseGameDirectory()}>
              {copy.selectGameDirectory}
            </button>
          </div>
        ) : (
          <>
            <div className="ai-localization-filters ai-localization-official-filters">
              <label>
                <span>{copy.search}</span>
                <div className="ai-localization-search-box">
                  <Search className="h-4 w-4" />
                  <input
                    className="control-input"
                    disabled={!status?.indexed}
                    value={page.query}
                    placeholder={copy.searchPlaceholder}
                    onChange={(e) => page.setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void page.search()
                    }}
                  />
                </div>
              </label>
              <label>
                <span>{copy.assetCategory}</span>
                <CompactSelect
                  disabled={!status?.indexed}
                  value={page.assetCategory ?? ''}
                  options={[
                    { value: '', label: copy.allAssets },
                    ...assetCategories.map((category) => ({ value: category, label: category })),
                  ]}
                  onChange={(value) => page.setAssetCategory(value || null)}
                  ariaLabel={copy.assetCategory}
                />
              </label>
              <label>
                <span>{copy.unitKind}</span>
                <CompactSelect
                  disabled={!status?.indexed}
                  value={page.unitKind ?? ''}
                  options={['', 'term', 'plain-text', 'dialogue', 'event-script', 'structured-record', 'opaque'].map((value) => ({
                    value,
                    label: value || copy.allKinds,
                  }))}
                  onChange={(value) => page.setUnitKind(value || null)}
                  ariaLabel={copy.unitKind}
                />
              </label>
              <label className="ai-localization-check">
                <input
                  type="checkbox"
                  className="ai-localization-switch"
                  disabled={!status?.indexed}
                  checked={page.promptOnly}
                  onChange={(e) => page.setPromptOnly(e.target.checked)}
                />
                <span>{copy.promptEligibleOnly}</span>
              </label>
              <button
                className="control-button control-button-primary"
                disabled={!status?.indexed || page.searching || !page.query.trim()}
                onClick={() => void page.search()}
              >
                <Search className="h-4 w-4" />
                {page.searching ? copy.searching : copy.search}
              </button>
            </div>
            {status?.indexed ? (
              page.hasSearched ? (
                <div className="ai-localization-table ai-localization-table--official ai-localization-official-table">
                  <table>
                    <colgroup>
                      <col className="ai-localization-official-source-column" />
                      <col className="ai-localization-official-target-column" />
                      <col className="ai-localization-official-asset-column" />
                      <col className="ai-localization-official-kind-column" />
                    </colgroup>
                    <thead>
                      <tr>
                        {[copy.source, copy.target, copy.assetAndKey, copy.kind].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {page.records.map((row) => (
                        <tr
                          key={row.id}
                          className={page.selected?.id === row.id ? 'is-selected' : ''}
                          onClick={() => page.setSelected(row)}
                        >
                          <td>{row.sourceText}</td>
                          <td>{row.targetText}</td>
                          <td title={`${row.assetPath} / ${row.unitKey}`}>
                            {row.assetPath}
                            <small>{row.unitKey}</small>
                          </td>
                          <td>{row.unitKind}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!page.searching && !page.records.length ? (
                    <div className="ai-localization-empty-state">
                      <div className="ai-localization-empty-icon">
                        <Server className="h-4 w-4" />
                      </div>
                      <span>{copy.empty}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="ai-localization-empty-state">
                  <div className="ai-localization-empty-icon">
                    <Search className="h-4 w-4" />
                  </div>
                  <span>{copy.searchHint}</span>
                </div>
              )
            ) : (
              <div className="ai-localization-empty-state">
                <div className="ai-localization-empty-icon">
                  <Server className="h-4 w-4" />
                </div>
                <span>{copy.indexMissing}</span>
              </div>
            )}
          </>
        )}
      </main>
      {page.selected ? (
        <aside className="ai-localization-inspector ai-localization-official-inspector">
          <header className="ai-localization-official-inspector-header">
            <strong>{page.selected.unitKey}</strong>
            <div className="ai-localization-eligibility">
              <span className={cx('ai-localization-chip', page.selected.searchable ? 'is-success' : 'is-neutral')}>
                {page.selected.searchable ? copy.searchable : copy.notSearchable}
              </span>
              <span className={cx('ai-localization-chip', page.selected.semanticEligible ? 'is-accent' : 'is-neutral')}>
                {page.selected.semanticEligible ? copy.semanticEligible : copy.notSemanticEligible}
              </span>
              <span className={cx('ai-localization-chip', page.selected.promptEligible ? 'is-success' : 'is-neutral')}>
                {page.selected.promptEligible ? copy.promptEligible : copy.notPromptEligible}
              </span>
            </div>
          </header>
          <section className="ai-localization-official-copy">
            <h3>{copy.fullSource}</h3>
            <p>{page.selected.sourceText}</p>
          </section>
          <section className="ai-localization-official-copy">
            <h3>{copy.fullTarget}</h3>
            <p>{page.selected.targetText}</p>
          </section>
          <dl className="ai-localization-kv ai-localization-official-kv">
            <div>
              <dt>{copy.assetAndKey}</dt>
              <dd>{page.selected.assetPath}</dd>
            </div>
            <div>
              <dt>{copy.fingerprint}</dt>
              <dd>{page.selected.fingerprint}</dd>
            </div>
            <div>
              <dt>{copy.overriddenBy}</dt>
              <dd>{overrides.length ? overrides.join(', ') : '--'}</dd>
            </div>
          </dl>
          <section className="ai-localization-official-actions">
            <label>
              <span>{copy.termScope}</span>
              <CompactSelect
                value={termScope}
                options={scopes.map((scope) => ({ value: scope.id, label: scope.kind === 'global' ? copy.globalScope : scope.name }))}
                onChange={setTermScope}
                ariaLabel={copy.termScope}
                placement="top-start"
              />
            </label>
            <button type="button" className="control-button control-button-primary" disabled={!termScope} onClick={() => void copyTerm()}>
              {copy.copyAsTerm}
            </button>
          </section>
        </aside>
      ) : (
        <aside className="ai-localization-inspector ai-localization-official-inspector">
          <div className="ai-localization-empty-state">
            <div className="ai-localization-empty-icon">
              <FileText className="h-4 w-4" />
            </div>
            <span>{copy.selectEntry}</span>
          </div>
        </aside>
      )}
    </div>
  )
}
