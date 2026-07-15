import { Database, RefreshCw, Search, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import type { AiLocalizationScope } from '@shared/contracts'
import { useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { useAiLocalizationPage } from '../model/useAiLocalizationPage'
import { ResizableColumnHeader, useAiLocalizationColumnWidths } from '../model/useAiLocalizationColumnWidths'

const locales = ['en-US', 'de-DE', 'es-ES', 'fr-FR', 'hu-HU', 'it-IT', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'zh-CN', 'zh-TW']
const assetCategories = ['Strings', 'Characters', 'Data', 'Dialogue', 'Maps', 'Movies']

export function OfficialCorpusView() {
  const page = useAiLocalizationPage()
  const { copy, status } = page
  const localization = useLocalization()
  const publish = useNotificationPublisher()
  const [scopes, setScopes] = useState<AiLocalizationScope[]>([])
  const [termScope, setTermScope] = useState('')
  const [overrides, setOverrides] = useState<string[]>([])
  const officialColumns = useAiLocalizationColumnWidths('official', { source: 280, target: 280, asset: 260, kind: 120 })
  const runScopeLoad = useLatestTask('ai-localization-official-scopes')
  const runOverrideLoad = useLatestTask('ai-localization-official-overrides')
  useEffect(() => {
    void runScopeLoad(async (task) => {
      const value = await localization.listScopes({ query: null, offset: 0, limit: 200 })
      if (task.isCurrent()) {
        setScopes(value.records)
        setTermScope((current) => current || value.records[0]?.id || '')
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        publish({ id: 'official-scopes-error', level: 'error', title: copy.knowledgeError, description: copy.knowledgeError })
      }
    })
  }, [copy.knowledgeError, localization, publish, runScopeLoad])
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
  return (
    <div className="ai-localization-layout">
      <aside className="ai-localization-scope">
        <h2>{copy.title}</h2>
        <button className="is-active">
          <Database className="h-4 w-4" />
          <span>{copy.globalScope}</span>
        </button>
        <label>
          <span>{copy.gameDirectory}</span>
          <select className="control-input" value={page.gameDirectory} onChange={(e) => page.setGameDirectory(e.target.value)}>
            <option value="">{copy.noGameDirectory}</option>
            {page.directories.map((path) => (
              <option key={path}>{path}</option>
            ))}
          </select>
        </label>
      </aside>
      <main className="ai-localization-main">
        <header className="ai-localization-toolbar">
          <strong>{copy.officialTab}</strong>
          <label>
            <span>{copy.sourceLocale}</span>
            <select className="control-input" value={page.sourceLocale} onChange={(e) => page.setSourceLocale(e.target.value)}>
              {locales.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.targetLocale}</span>
            <select className="control-input" value={page.targetLocale} onChange={(e) => page.setTargetLocale(e.target.value)}>
              {locales.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {page.indexing ? (
            <button className="control-button" onClick={() => void page.cancel()}>
              <Square className="h-4 w-4" />
              {copy.cancel}
            </button>
          ) : (
            <button className="control-button" disabled={!page.gameDirectory} onClick={() => void page.rebuild()}>
              <RefreshCw className="h-4 w-4" />
              {status?.indexed ? copy.rebuildIndex : copy.buildIndex}
            </button>
          )}
        </header>
        {page.error ? (
          <p role="alert" className="settings-ai-error">
            {page.error}
          </p>
        ) : null}
        {!page.gameDirectory ? (
          <div className="ai-localization-empty">
            <p>{copy.noGameDirectory}</p>
            <button type="button" className="control-button" onClick={() => void page.chooseGameDirectory()}>
              {copy.selectGameDirectory}
            </button>
          </div>
        ) : page.loading ? (
          <div className="ai-localization-empty" aria-live="polite">
            {copy.loadError}
          </div>
        ) : (
          <>
            <div className="ai-localization-status">
              <span className="status-pill">
                {page.indexing ? copy.indexing : !status?.indexed ? copy.indexMissing : status.stale ? copy.indexStale : copy.indexReady}
              </span>
              <dl>
                <div>
                  <dt>{copy.gameVersion}</dt>
                  <dd>{status?.gameVersion ?? '--'}</dd>
                </div>
                <div>
                  <dt>{copy.revision}</dt>
                  <dd title={status?.revision ?? ''}>{status?.revision?.slice(0, 8) ?? '--'}</dd>
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
                  <dt>{copy.errors}</dt>
                  <dd>{status?.errorCount ?? 0}</dd>
                </div>
              </dl>
            </div>
            {page.indexing && page.indexProgress ? (
              <div className="ai-localization-index-progress" aria-live="polite">
                <div>
                  <span>{page.indexProgress.phase === 'committing' ? copy.indexCommitting : copy.indexParsing}</span>
                  <strong>{copy.indexProgress(page.indexProgress.completed, page.indexProgress.total)}</strong>
                </div>
                <progress value={page.indexProgress.completed} max={Math.max(1, page.indexProgress.total)} />
              </div>
            ) : null}
            {status?.indexed && !status.stale ? (
              <>
                <div className="ai-localization-filters">
                  <label>
                    <span>{copy.search}</span>
                    <div className="settings-ai-secret">
                      <Search className="h-4 w-4" />
                      <input
                        className="control-input"
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
                    <select
                      className="control-input"
                      value={page.assetCategory ?? ''}
                      onChange={(event) => page.setAssetCategory(event.target.value || null)}
                    >
                      <option value="">{copy.allAssets}</option>
                      {assetCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{copy.unitKind}</span>
                    <select
                      className="control-input"
                      value={page.unitKind ?? ''}
                      onChange={(e) => page.setUnitKind(e.target.value || null)}
                    >
                      <option value="">{copy.allKinds}</option>
                      <option value="term">term</option>
                      <option value="plain-text">plain-text</option>
                      <option value="dialogue">dialogue</option>
                      <option value="event-script">event-script</option>
                      <option value="structured-record">structured-record</option>
                      <option value="opaque">opaque</option>
                    </select>
                  </label>
                  <label className="ai-localization-check">
                    <input type="checkbox" checked={page.promptOnly} onChange={(e) => page.setPromptOnly(e.target.checked)} />
                    <span>{copy.promptEligibleOnly}</span>
                  </label>
                  <button className="control-button" disabled={page.searching || !page.query.trim()} onClick={() => void page.search()}>
                    <Search className="h-4 w-4" />
                    {copy.search}
                  </button>
                </div>
                {page.hasSearched ? (
                  <div className="ai-localization-table">
                    <table>
                      <thead>
                        <tr>
                          {[
                            ['source', copy.source],
                            ['target', copy.target],
                            ['asset', copy.assetAndKey],
                            ['kind', copy.kind],
                          ].map(([column, label]) => (
                            <ResizableColumnHeader
                              key={column}
                              column={column}
                              width={officialColumns.widths[column]}
                              resizeLabel={copy.resizeColumn(label)}
                              setWidth={officialColumns.setWidth}
                            >
                              {label}
                            </ResizableColumnHeader>
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
                    {!page.searching && !page.records.length ? <p className="ai-localization-empty">{copy.empty}</p> : null}
                  </div>
                ) : (
                  <p className="ai-localization-empty">{copy.searchHint}</p>
                )}
              </>
            ) : null}
          </>
        )}
      </main>
      <aside className="ai-localization-inspector">
        {page.selected ? (
          <>
            <header>
              <strong>{page.selected.unitKey}</strong>
              <span className="status-pill">{page.selected.promptEligible ? copy.promptEligible : copy.notPromptEligible}</span>
            </header>
            <section>
              <h3>{copy.fullSource}</h3>
              <p>{page.selected.sourceText}</p>
            </section>
            <section>
              <h3>{copy.fullTarget}</h3>
              <p>{page.selected.targetText}</p>
            </section>
            <dl>
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
            <section>
              <label>
                <span>{copy.termScope}</span>
                <select className="control-input" value={termScope} onChange={(event) => setTermScope(event.target.value)}>
                  {scopes.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.kind === 'global' ? copy.globalScope : scope.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="control-button" disabled={!termScope} onClick={() => void copyTerm()}>
                {copy.copyAsTerm}
              </button>
            </section>
          </>
        ) : (
          <p className="ai-localization-empty">{copy.selectEntry}</p>
        )}
      </aside>
    </div>
  )
}
