import { ChevronLeft, ChevronRight, Download, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useAi } from '@entities/ai'
import { useAiLocalizationCopy } from '@locales/provider'
import type {
  AiGlossaryEntry,
  AiLocalizationScope,
  AiStyleGuide,
  AiTranslationMemoryEntry,
  LocalizationKnowledgeFormat,
  LocalizationScopeSettings,
} from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { isString, useAiLocalizationPersistentState } from '../model/localizationPageState'
import { ResizableColumnHeader, useAiLocalizationColumnWidths } from '../model/useAiLocalizationColumnWidths'

const NOTICE = 'ai-localization-knowledge-error'
const PAGE_SIZE = 50
export type KnowledgeTab = 'glossary' | 'style' | 'memory'
const blankEntry = (scopeId: string): AiGlossaryEntry => ({
  id: '',
  scopeId,
  sourceLocale: 'en-US',
  targetLocale: 'zh-CN',
  sourceTerm: '',
  targetTerm: '',
  matchMode: 'exact',
  doNotTranslate: false,
  notes: '',
  updatedAtMs: 0,
})
const blankStyle = (scopeId: string): AiStyleGuide => ({
  scopeId,
  targetLocale: 'zh-CN',
  tone: '',
  audience: '',
  formality: '',
  forbiddenPhrases: [],
  preferredPhrases: [],
  rules: [],
  updatedAtMs: 0,
})
const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)

export function KnowledgeCenterView({ tab }: { tab: KnowledgeTab }) {
  const localization = useLocalization()
  const ai = useAi()
  const copy = useAiLocalizationCopy()
  const publish = useNotificationPublisher()
  const [scopes, setScopes] = useState<AiLocalizationScope[]>([])
  const [scopeId, setScopeId] = useAiLocalizationPersistentState('scope', '', isString)
  const [scopeQuery, setScopeQuery] = useState('')
  const [query, setQuery] = useState('')
  const [glossary, setGlossary] = useState<AiGlossaryEntry[]>([])
  const [glossaryOffset, setGlossaryOffset] = useState(0)
  const [glossaryTotal, setGlossaryTotal] = useState(0)
  const [selectedGlossaryIds, setSelectedGlossaryIds] = useState<Set<string>>(new Set())
  const [selectedGlossary, setSelectedGlossary] = useState<AiGlossaryEntry | null>(null)
  const [style, setStyle] = useState<AiStyleGuide | null>(null)
  const [inheritedStyle, setInheritedStyle] = useState<AiStyleGuide | null>(null)
  const [memory, setMemory] = useState<AiTranslationMemoryEntry[]>([])
  const [memoryOffset, setMemoryOffset] = useState(0)
  const [memoryTotal, setMemoryTotal] = useState(0)
  const [selectedMemory, setSelectedMemory] = useState<AiTranslationMemoryEntry | null>(null)
  const [memoryTargetScopeId, setMemoryTargetScopeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scopeSettings, setScopeSettings] = useState<LocalizationScopeSettings | null>(null)
  const [engineOptions, setEngineOptions] = useState<Array<{ kind: 'generative-ai' | 'machine-translation'; id: string; name: string }>>([])
  const [reviewProfiles, setReviewProfiles] = useState<Array<{ id: string; name: string }>>([])
  const [bindingKind, setBindingKind] = useState('project-unique-id')
  const [bindingValue, setBindingValue] = useState('')
  const runEngineLoad = useLatestTask('ai-localization-knowledge-engines')
  const runScopeSettingsLoad = useLatestTask('ai-localization-knowledge-scope-settings')
  const glossaryColumns = useAiLocalizationColumnWidths('glossary', {
    source: 220,
    target: 220,
    locale: 140,
    scope: 140,
    match: 140,
    updated: 170,
  })
  const memoryColumns = useAiLocalizationColumnWidths('memory', {
    source: 260,
    target: 260,
    locale: 140,
    kind: 140,
    file: 220,
    confirmed: 170,
    uses: 100,
  })
  const fail = () => {
    setError(copy.knowledgeError)
    publish({ id: NOTICE, level: 'error', title: copy.knowledgeError, description: copy.knowledgeError })
  }
  const loadScopes = async () => {
    try {
      const page = await localization.listScopes({ query: scopeQuery || null, offset: 0, limit: 200 })
      setScopes(page.records)
      setScopeId((current) => (current && page.records.some((scope) => scope.id === current) ? current : (page.records[0]?.id ?? '')))
    } catch {
      fail()
    }
  }
  useEffect(() => {
    void loadScopes()
    return () => dismissNotification(NOTICE)
  }, [scopeQuery])
  useEffect(() => {
    const selected = scopes.find((scope) => scope.id === scopeId)
    if (selected?.kind === 'project') {
      setBindingKind(selected.bindingKind ?? 'project-unique-id')
      setBindingValue(selected.bindingValue ?? '')
    } else setBindingValue('')
  }, [scopeId, scopes])
  useEffect(() => {
    void runEngineLoad(async (task) => {
      const [generative, machine] = await Promise.all([ai.loadSettings(), localization.loadMachineTranslationSettings()])
      if (task.isCurrent()) {
        setReviewProfiles(generative.profiles.map(({ id, name }) => ({ id, name })))
        setEngineOptions([
          ...generative.profiles.map(({ id, name }) => ({ kind: 'generative-ai' as const, id, name })),
          ...machine.profiles.map(({ id, name }) => ({ kind: 'machine-translation' as const, id, name })),
        ])
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) fail()
    })
  }, [ai, localization, runEngineLoad])
  useEffect(() => {
    if (!scopeId) {
      setScopeSettings(null)
      return
    }
    void runScopeSettingsLoad(async (task) => {
      const value = await localization.loadScope(scopeId)
      if (task.isCurrent()) setScopeSettings(value.settings)
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) fail()
    })
  }, [localization, runScopeSettingsLoad, scopeId])
  const saveScopeDefaults = async () => {
    if (!scopeSettings) return
    try {
      const value = await localization.saveScopeSettings(scopeSettings)
      setScopeSettings(value.settings)
    } catch {
      fail()
    }
  }
  const rebind = async () => {
    if (!scopeId || !bindingKind.trim() || !bindingValue.trim()) return
    try {
      const snapshot = await localization.rebindScope(scopeId, bindingKind, bindingValue)
      setScopes((current) => current.map((scope) => (scope.id === scopeId ? snapshot.scope : scope)))
      setError(null)
    } catch {
      fail()
    }
  }
  const load = async () => {
    if (!scopeId) return
    setBusy(true)
    try {
      if (tab === 'glossary') {
        const page = await localization.listGlossary({
          scopeId,
          sourceLocale: null,
          targetLocale: null,
          query: query || null,
          offset: glossaryOffset,
          limit: PAGE_SIZE,
        })
        setGlossary(page.records)
        setGlossaryTotal(page.total)
        setSelectedGlossary((current) => page.records.find((item) => item.id === current?.id) ?? null)
      } else if (tab === 'style') {
        const globalScope = scopes.find((scope) => scope.kind === 'global')
        const [selected, global] = await Promise.all([
          localization.loadStyle(scopeId, 'zh-CN'),
          globalScope && globalScope.id !== scopeId ? localization.loadStyle(globalScope.id, 'zh-CN') : Promise.resolve(null),
        ])
        setStyle(selected ?? blankStyle(scopeId))
        setInheritedStyle(global)
      } else {
        const page = await localization.searchMemory({
          scopeId,
          sourceLocale: null,
          targetLocale: null,
          query: query || null,
          offset: memoryOffset,
          limit: PAGE_SIZE,
        })
        setMemory(page.records)
        setMemoryTotal(page.total)
        setSelectedMemory((current) => page.records.find((item) => item.id === current?.id) ?? null)
      }
      setError(null)
    } catch {
      fail()
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [glossaryOffset, memoryOffset, scopeId, tab, query])
  useEffect(() => {
    setGlossaryOffset(0)
    setMemoryOffset(0)
  }, [query, scopeId, tab])
  const saveGlossary = async () => {
    if (!selectedGlossary) return
    setBusy(true)
    try {
      await localization.upsertGlossary(scopeId, [selectedGlossary])
      await load()
    } catch {
      fail()
    } finally {
      setBusy(false)
    }
  }
  const removeGlossary = async () => {
    if (!selectedGlossary?.id) return
    try {
      await localization.deleteGlossary(scopeId, [selectedGlossary.id])
      setSelectedGlossary(null)
      if (glossary.length === 1 && glossaryOffset > 0) setGlossaryOffset(Math.max(0, glossaryOffset - PAGE_SIZE))
      else await load()
    } catch {
      fail()
    }
  }
  const removeSelectedGlossary = async () => {
    if (!selectedGlossaryIds.size) return
    try {
      await localization.deleteGlossary(scopeId, [...selectedGlossaryIds])
      setSelectedGlossaryIds(new Set())
      setSelectedGlossary(null)
      if (selectedGlossaryIds.size >= glossary.length && glossaryOffset > 0) setGlossaryOffset(Math.max(0, glossaryOffset - PAGE_SIZE))
      else await load()
    } catch {
      fail()
    }
  }
  const saveStyle = async () => {
    if (!style) return
    try {
      setStyle(await localization.saveStyle(style))
    } catch {
      fail()
    }
  }
  const effectiveStyle = style
    ? {
        tone: style.tone || inheritedStyle?.tone || '',
        audience: style.audience || inheritedStyle?.audience || '',
        formality: style.formality || inheritedStyle?.formality || '',
        forbiddenPhrases: style.forbiddenPhrases.length ? style.forbiddenPhrases : (inheritedStyle?.forbiddenPhrases ?? []),
        preferredPhrases: style.preferredPhrases.length ? style.preferredPhrases : (inheritedStyle?.preferredPhrases ?? []),
        rules: style.rules.length ? style.rules : (inheritedStyle?.rules ?? []),
      }
    : null
  const removeMemory = async () => {
    if (!selectedMemory) return
    try {
      await localization.deleteMemory(scopeId, [selectedMemory.id])
      setSelectedMemory(null)
      if (memory.length === 1 && memoryOffset > 0) setMemoryOffset(Math.max(0, memoryOffset - PAGE_SIZE))
      else await load()
    } catch {
      fail()
    }
  }
  const copyMemory = async () => {
    if (!selectedMemory || !memoryTargetScopeId) return
    try {
      await localization.copyMemory(scopeId, memoryTargetScopeId, [selectedMemory.id])
      publish({ id: 'translation-memory-copied', level: 'success', title: copy.copiedMemory, description: copy.copiedMemory })
    } catch {
      fail()
    }
  }
  const transfer = async (direction: 'import' | 'export') => {
    const format: LocalizationKnowledgeFormat =
      tab === 'glossary' ? 'glossary-csv' : tab === 'memory' ? 'translation-memory-tmx' : 'knowledge-pack-json'
    const path =
      direction === 'import' ? await localization.chooseKnowledgeImport(format) : await localization.chooseKnowledgeExport(format)
    if (!path) return
    try {
      if (direction === 'import') await localization.importKnowledge({ scopeId, sourcePath: path, format })
      else
        await localization.exportKnowledge({
          scopeId,
          destinationPath: path,
          format,
          sourceLocale: null,
          targetLocale: null,
          query: format === 'knowledge-pack-json' ? null : query || null,
        })
      await load()
    } catch {
      fail()
    }
  }
  const pagination = (offset: number, total: number, setOffset: (value: number) => void) => (
    <nav
      className="ai-localization-pagination"
      aria-label={copy.pageSummary(Math.min(offset + 1, total), Math.min(offset + PAGE_SIZE, total), total)}
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
      <span>{copy.pageSummary(Math.min(offset + 1, total), Math.min(offset + PAGE_SIZE, total), total)}</span>
      <button
        type="button"
        className="icon-button"
        disabled={offset + PAGE_SIZE >= total}
        title={copy.nextPage}
        aria-label={copy.nextPage}
        onClick={() => setOffset(offset + PAGE_SIZE)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  )
  return (
    <div className="ai-localization-layout">
      <aside className="ai-localization-scope">
        <h2>{copy.title}</h2>
        <label>
          <span>{copy.searchScopes}</span>
          <input className="control-input" value={scopeQuery} onChange={(event) => setScopeQuery(event.target.value)} />
        </label>
        <div className="ai-localization-scope-list">
          {scopes.map((scope) => (
            <button key={scope.id} className={scope.id === scopeId ? 'is-active' : ''} onClick={() => setScopeId(scope.id)}>
              <strong>{scope.kind === 'global' ? copy.globalScope : scope.name}</strong>
              <small>{scope.bindingValue ?? ''}</small>
            </button>
          ))}
        </div>
        {scopeSettings ? (
          <div className="ai-localization-scope-defaults">
            <label>
              <span>{copy.defaultEngine}</span>
              <select
                className="control-input"
                value={
                  scopeSettings.defaultEngineKind && scopeSettings.defaultEngineProfileId
                    ? `${scopeSettings.defaultEngineKind}:${scopeSettings.defaultEngineProfileId}`
                    : ''
                }
                onChange={(event) => {
                  const [kind, id] = event.target.value.split(':')
                  setScopeSettings({ ...scopeSettings, defaultEngineKind: kind || null, defaultEngineProfileId: id || null })
                }}
              >
                <option value="">{copy.noDefault}</option>
                {engineOptions.map((option) => (
                  <option key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{copy.defaultReviewProfile}</span>
              <select
                className="control-input"
                value={scopeSettings.reviewProfileId ?? ''}
                onChange={(event) => setScopeSettings({ ...scopeSettings, reviewProfileId: event.target.value || null })}
              >
                <option value="">{copy.noDefault}</option>
                {reviewProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ai-localization-check">
              <input
                type="checkbox"
                checked={scopeSettings.autoReview}
                onChange={(event) => setScopeSettings({ ...scopeSettings, autoReview: event.target.checked })}
              />
              <span>{copy.automaticReview}</span>
            </label>
            <button type="button" className="control-button" onClick={() => void saveScopeDefaults()}>
              {copy.saveDefaults}
            </button>
          </div>
        ) : null}
        {scopes.find((scope) => scope.id === scopeId)?.kind === 'project' ? (
          <div className="ai-localization-scope-defaults">
            <label>
              <span>{copy.bindingKind}</span>
              <select className="control-input" value={bindingKind} onChange={(event) => setBindingKind(event.target.value)}>
                {Object.entries(copy.bindingKinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{copy.bindingValue}</span>
              <input className="control-input" value={bindingValue} onChange={(event) => setBindingValue(event.target.value)} />
            </label>
            {!bindingValue.trim() ? (
              <p role="alert" className="settings-ai-error">
                {copy.bindingMissing}
              </p>
            ) : null}
            <button type="button" className="control-button" disabled={!bindingValue.trim()} onClick={() => void rebind()}>
              {copy.rebindProject}
            </button>
          </div>
        ) : null}
      </aside>
      <main className="ai-localization-main">
        <header className="ai-localization-toolbar">
          <strong>{tab === 'glossary' ? copy.glossaryTab : tab === 'style' ? copy.styleTab : copy.memoryTab}</strong>
          <div className="settings-ai-secret">
            <Search className="h-4 w-4" />
            <input className="control-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} />
          </div>
          <button className="control-button" onClick={() => void transfer('import')}>
            <Upload className="h-4 w-4" />
            {copy.importAction}
          </button>
          <button className="control-button" onClick={() => void transfer('export')}>
            <Download className="h-4 w-4" />
            {copy.exportAction}
          </button>
          {tab === 'glossary' ? (
            <>
              <button className="control-button" disabled={!selectedGlossaryIds.size} onClick={() => void removeSelectedGlossary()}>
                <Trash2 className="h-4 w-4" />
                {copy.delete} ({selectedGlossaryIds.size})
              </button>
              <button className="control-button" onClick={() => setSelectedGlossary(blankEntry(scopeId))}>
                <Plus className="h-4 w-4" />
                {copy.add}
              </button>
            </>
          ) : null}
        </header>
        {error ? (
          <p role="alert" className="settings-ai-error">
            {error}
          </p>
        ) : null}
        {tab === 'glossary' ? (
          <div className="ai-localization-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={copy.selectAll}
                      checked={glossary.length > 0 && selectedGlossaryIds.size === glossary.length}
                      onChange={(event) =>
                        setSelectedGlossaryIds(event.target.checked ? new Set(glossary.map((entry) => entry.id)) : new Set())
                      }
                    />
                  </th>
                  {[
                    ['source', copy.sourceTerm],
                    ['target', copy.targetTerm],
                    ['locale', copy.sourceLocale],
                    ['scope', copy.scopeColumn],
                    ['match', copy.matchMode],
                    ['updated', copy.updatedAt],
                  ].map(([column, label]) => (
                    <ResizableColumnHeader
                      key={column}
                      column={column}
                      width={glossaryColumns.widths[column]}
                      resizeLabel={copy.resizeColumn(label)}
                      setWidth={glossaryColumns.setWidth}
                    >
                      {label}
                    </ResizableColumnHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {glossary.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selectedGlossary?.id === entry.id ? 'is-selected' : ''}
                    onClick={() => setSelectedGlossary(entry)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${copy.selectEntry}: ${entry.sourceTerm}`}
                        checked={selectedGlossaryIds.has(entry.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setSelectedGlossaryIds((current) => {
                            const next = new Set(current)
                            if (event.target.checked) next.add(entry.id)
                            else next.delete(entry.id)
                            return next
                          })
                        }
                      />
                    </td>
                    <td>{entry.sourceTerm}</td>
                    <td>{entry.doNotTranslate ? copy.doNotTranslate : entry.targetTerm}</td>
                    <td>
                      {entry.sourceLocale} → {entry.targetLocale}
                    </td>
                    <td>{scopes.find((scope) => scope.id === entry.scopeId)?.name ?? entry.scopeId}</td>
                    <td>{entry.matchMode === 'exact' ? copy.exact : copy.caseInsensitive}</td>
                    <td>{new Date(entry.updatedAtMs).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && !glossary.length ? <p className="ai-localization-empty">{copy.empty}</p> : null}
            {glossaryTotal > 0 ? pagination(glossaryOffset, glossaryTotal, setGlossaryOffset) : null}
          </div>
        ) : tab === 'style' && style ? (
          <div className="ai-localization-style">
            <label>
              <span>{copy.tone}</span>
              <input className="control-input" value={style.tone} onChange={(e) => setStyle({ ...style, tone: e.target.value })} />
            </label>
            <label>
              <span>{copy.audience}</span>
              <input className="control-input" value={style.audience} onChange={(e) => setStyle({ ...style, audience: e.target.value })} />
            </label>
            <label>
              <span>{copy.formality}</span>
              <input
                className="control-input"
                value={style.formality}
                onChange={(e) => setStyle({ ...style, formality: e.target.value })}
              />
            </label>
            <label>
              <span>{copy.forbiddenPhrases}</span>
              <textarea
                className="control-input"
                value={style.forbiddenPhrases.join('\n')}
                onChange={(e) => setStyle({ ...style, forbiddenPhrases: lines(e.target.value) })}
              />
            </label>
            <label>
              <span>{copy.preferredPhrases}</span>
              <textarea
                className="control-input"
                value={style.preferredPhrases.join('\n')}
                onChange={(e) => setStyle({ ...style, preferredPhrases: lines(e.target.value) })}
              />
            </label>
            <label>
              <span>{copy.rules}</span>
              <textarea
                className="control-input"
                value={style.rules.join('\n')}
                onChange={(e) => setStyle({ ...style, rules: lines(e.target.value) })}
              />
            </label>
            <section>
              <h3>{copy.effectivePreview}</h3>
              <pre>{JSON.stringify(effectiveStyle, null, 2)}</pre>
            </section>
            {inheritedStyle ? (
              <div className="ai-localization-inheritance-actions">
                {(
                  [
                    ['tone', copy.tone],
                    ['audience', copy.audience],
                    ['formality', copy.formality],
                    ['forbiddenPhrases', copy.forbiddenPhrases],
                    ['preferredPhrases', copy.preferredPhrases],
                    ['rules', copy.rules],
                  ] as const
                ).map(([field, label]) => (
                  <button
                    key={field}
                    type="button"
                    className="control-button"
                    onClick={() => setStyle({ ...style, [field]: Array.isArray(style[field]) ? [] : '' })}
                  >
                    {copy.restoreInheritance}: {label}
                  </button>
                ))}
              </div>
            ) : null}
            <button className="control-button control-button-primary" onClick={() => void saveStyle()}>
              {copy.save}
            </button>
          </div>
        ) : (
          <div className="ai-localization-table">
            <table>
              <thead>
                <tr>
                  {[
                    ['source', copy.source],
                    ['target', copy.target],
                    ['locale', copy.localePair],
                    ['kind', copy.sourceKind],
                    ['file', copy.fileAndKey],
                    ['confirmed', copy.confirmedAt],
                    ['uses', copy.useCount],
                  ].map(([column, label]) => (
                    <ResizableColumnHeader
                      key={column}
                      column={column}
                      width={memoryColumns.widths[column]}
                      resizeLabel={copy.resizeColumn(label)}
                      setWidth={memoryColumns.setWidth}
                    >
                      {label}
                    </ResizableColumnHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memory.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selectedMemory?.id === entry.id ? 'is-selected' : ''}
                    onClick={() => setSelectedMemory(entry)}
                  >
                    <td>{entry.sourceText}</td>
                    <td>{entry.targetText}</td>
                    <td>
                      {entry.sourceLocale} → {entry.targetLocale}
                    </td>
                    <td>{entry.sourceKind}</td>
                    <td>
                      {entry.fileNamespace}
                      <small>{entry.unitKey}</small>
                    </td>
                    <td>{new Date(entry.confirmedAtMs).toLocaleString()}</td>
                    <td>{entry.useCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && !memory.length ? <p className="ai-localization-empty">{copy.empty}</p> : null}
            {memoryTotal > 0 ? pagination(memoryOffset, memoryTotal, setMemoryOffset) : null}
          </div>
        )}
      </main>
      <aside className="ai-localization-inspector">
        {tab === 'glossary' ? (
          selectedGlossary ? (
            <div className="ai-localization-form">
              <label>
                <span>{copy.sourceTerm}</span>
                <input
                  className="control-input"
                  value={selectedGlossary.sourceTerm}
                  onChange={(e) => setSelectedGlossary({ ...selectedGlossary, sourceTerm: e.target.value })}
                />
              </label>
              <label>
                <span>{copy.targetTerm}</span>
                <input
                  className="control-input"
                  disabled={selectedGlossary.doNotTranslate}
                  value={selectedGlossary.targetTerm}
                  onChange={(e) => setSelectedGlossary({ ...selectedGlossary, targetTerm: e.target.value })}
                />
              </label>
              <label>
                <span>{copy.matchMode}</span>
                <select
                  className="control-input"
                  value={selectedGlossary.matchMode}
                  onChange={(e) => setSelectedGlossary({ ...selectedGlossary, matchMode: e.target.value as AiGlossaryEntry['matchMode'] })}
                >
                  <option value="exact">{copy.exact}</option>
                  <option value="case-insensitive">{copy.caseInsensitive}</option>
                </select>
              </label>
              <label className="ai-localization-check">
                <input
                  type="checkbox"
                  checked={selectedGlossary.doNotTranslate}
                  onChange={(e) => setSelectedGlossary({ ...selectedGlossary, doNotTranslate: e.target.checked })}
                />
                <span>{copy.doNotTranslate}</span>
              </label>
              <label>
                <span>{copy.notes}</span>
                <textarea
                  className="control-input"
                  value={selectedGlossary.notes}
                  onChange={(e) => setSelectedGlossary({ ...selectedGlossary, notes: e.target.value })}
                />
              </label>
              <div className="ai-localization-form-actions">
                <button className="control-button" disabled={!selectedGlossary.id} onClick={() => void removeGlossary()}>
                  <Trash2 className="h-4 w-4" />
                  {copy.delete}
                </button>
                <button className="control-button control-button-primary" onClick={() => void saveGlossary()}>
                  {copy.save}
                </button>
              </div>
            </div>
          ) : (
            <p className="ai-localization-empty">{copy.selectGlossary}</p>
          )
        ) : tab === 'memory' ? (
          selectedMemory ? (
            <>
              <section>
                <h3>{copy.fullSource}</h3>
                <p>{selectedMemory.sourceText}</p>
              </section>
              <section>
                <h3>{copy.fullTarget}</h3>
                <p>{selectedMemory.targetText}</p>
              </section>
              <dl>
                <div>
                  <dt>{copy.sourceKind}</dt>
                  <dd>{selectedMemory.sourceKind}</dd>
                </div>
                <div>
                  <dt>{copy.similarity}</dt>
                  <dd>{Math.round(selectedMemory.similarity * 100)}%</dd>
                </div>
                <div>
                  <dt>{copy.useCount}</dt>
                  <dd>{selectedMemory.useCount}</dd>
                </div>
              </dl>
              <button className="control-button" onClick={() => void removeMemory()}>
                <Trash2 className="h-4 w-4" />
                {copy.delete}
              </button>
              <label>
                <span>{copy.copyToScope}</span>
                <select
                  className="control-input"
                  value={memoryTargetScopeId}
                  onChange={(event) => setMemoryTargetScopeId(event.target.value)}
                >
                  <option value="">{copy.selectEntry}</option>
                  {scopes
                    .filter((scope) => scope.id !== scopeId)
                    .map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.kind === 'global' ? copy.globalScope : scope.name}
                      </option>
                    ))}
                </select>
              </label>
              <button className="control-button" disabled={!memoryTargetScopeId} onClick={() => void copyMemory()}>
                {copy.copyToScope}
              </button>
            </>
          ) : null
        ) : null}
      </aside>
    </div>
  )
}
