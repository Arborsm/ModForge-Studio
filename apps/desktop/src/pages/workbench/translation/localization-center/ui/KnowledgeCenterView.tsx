import { ChevronLeft, ChevronRight, Download, MousePointer2, Plus, Search, Server, Trash2, Upload } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useAiLocalizationCopy } from '@locales/provider'
import type {
  AiGlossaryEntry,
  AiLocalizationScope,
  AiStyleGuide,
  AiTranslationMemoryEntry,
  LocalizationKnowledgeFormat,
} from '@shared/contracts'
import { SemanticSearchStatus } from './SemanticSearchStatus'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { cx } from '@shared/lib/helper'
import { ResizableColumnHeader, useAiLocalizationColumnWidths } from '../model/useAiLocalizationColumnWidths'
import { errorDetail } from '../model/errorDetail'

const NOTICE = 'ai-localization-knowledge-error'
const PAGE_SIZE = 50
export type KnowledgeTab = 'glossary' | 'style' | 'memory'
const blankEntry = (scopeId: string, sourceLocale: string, targetLocale: string): AiGlossaryEntry => ({
  id: '',
  scopeId,
  sourceLocale,
  targetLocale,
  sourceTerm: '',
  targetTerm: '',
  matchMode: 'exact',
  doNotTranslate: false,
  notes: '',
  updatedAtMs: 0,
})
const blankStyle = (scopeId: string, targetLocale: string): AiStyleGuide => ({
  scopeId,
  targetLocale,
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

export function KnowledgeCenterView({
  tab,
  scopes,
  scopeId,
  sourceLocale,
  targetLocale,
}: {
  tab: KnowledgeTab
  scopes: AiLocalizationScope[]
  scopeId: string
  sourceLocale: string
  targetLocale: string
}) {
  const localization = useLocalization()
  const copy = useAiLocalizationCopy()
  const publish = useNotificationPublisher()
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
  const [deleteTarget, setDeleteTarget] = useState<'glossary' | 'selected-glossary' | 'memory' | null>(null)
  const deleteDialogTitleId = useId()
  const [memoryTargetScopeId, setMemoryTargetScopeId] = useState('')
  const [busy, setBusy] = useState(false)
  const runKnowledgeLoad = useLatestTask('ai-localization-knowledge-content')
  const glossaryColumns = useAiLocalizationColumnWidths('glossary', {
    source: 190,
    target: 190,
    locale: 110,
    scope: 120,
    match: 100,
    updated: 140,
  })
  const memoryColumns = useAiLocalizationColumnWidths('memory', {
    source: 180,
    target: 180,
    similarity: 80,
    sourceScope: 100,
    updated: 120,
  })
  const fail = (error: unknown, retry?: () => void) => {
    publish({
      id: NOTICE,
      level: 'error',
      eyebrow: copy.projectMessage,
      title: copy.knowledgeError,
      description: errorDetail(error),
      action: retry ? { label: copy.retry, callback: retry, tone: 'primary' } : undefined,
    })
  }
  useEffect(() => {
    return () => dismissNotification(NOTICE)
  }, [])
  const load = async () => {
    if (!scopeId) return
    try {
      await runKnowledgeLoad(async (task) => {
        setBusy(true)
        try {
          if (tab === 'glossary') {
            const page = await localization.listGlossary({
              scopeId,
              sourceLocale,
              targetLocale,
              query: query || null,
              offset: glossaryOffset,
              limit: PAGE_SIZE,
            })
            if (!task.isCurrent()) return
            setGlossary(page.records)
            setGlossaryTotal(page.total)
            setSelectedGlossary((current) => page.records.find((item) => item.id === current?.id) ?? null)
          } else if (tab === 'style') {
            const globalScope = scopes.find((scope) => scope.kind === 'global')
            const [selected, global] = await Promise.all([
              localization.loadStyle(scopeId, targetLocale),
              globalScope && globalScope.id !== scopeId ? localization.loadStyle(globalScope.id, targetLocale) : Promise.resolve(null),
            ])
            if (!task.isCurrent()) return
            setStyle(selected ?? blankStyle(scopeId, targetLocale))
            setInheritedStyle(global)
          } else {
            const page = await localization.searchMemory({
              scopeId,
              sourceLocale,
              targetLocale,
              query: query || null,
              offset: memoryOffset,
              limit: PAGE_SIZE,
            })
            if (!task.isCurrent()) return
            setMemory(page.records)
            setMemoryTotal(page.total)
            setSelectedMemory((current) => page.records.find((item) => item.id === current?.id) ?? null)
          }
          dismissNotification(NOTICE)
        } finally {
          if (task.isCurrent()) setBusy(false)
        }
      })
    } catch (error) {
      if (!(error instanceof TaskCancelledError)) {
        setBusy(false)
        fail(error, load)
      }
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
    } catch (error) {
      fail(error, saveGlossary)
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
    } catch (error) {
      fail(error, removeGlossary)
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
    } catch (error) {
      fail(error, removeSelectedGlossary)
    }
  }
  const saveStyle = async () => {
    if (!style) return
    try {
      setStyle(await localization.saveStyle(style))
      dismissNotification(NOTICE)
    } catch (error) {
      fail(error, saveStyle)
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
    } catch (error) {
      fail(error, removeMemory)
    }
  }
  const copyMemory = async () => {
    if (!selectedMemory || !memoryTargetScopeId) return
    try {
      await localization.copyMemory(scopeId, memoryTargetScopeId, [selectedMemory.id])
      dismissNotification(NOTICE)
      publish({ id: 'translation-memory-copied', level: 'success', title: copy.copiedMemory, description: copy.copiedMemory })
    } catch (error) {
      fail(error)
    }
  }
  const confirmDelete = async () => {
    const target = deleteTarget
    setDeleteTarget(null)
    if (target === 'glossary') await removeGlossary()
    else if (target === 'selected-glossary') await removeSelectedGlossary()
    else if (target === 'memory') await removeMemory()
  }
  const transfer = async (direction: 'import' | 'export') => {
    const format: LocalizationKnowledgeFormat =
      tab === 'glossary' ? 'glossary-csv' : tab === 'memory' ? 'translation-memory-tmx' : 'knowledge-pack-json'
    const path =
      direction === 'import' ? await localization.chooseKnowledgeImport(format) : await localization.chooseKnowledgeExport(format)
    if (!path) return
    try {
      if (direction === 'import') await localization.importKnowledge({ jobId: crypto.randomUUID(), scopeId, sourcePath: path, format })
      else
        await localization.exportKnowledge({
          scopeId,
          destinationPath: path,
          format,
          sourceLocale,
          targetLocale,
          query: format === 'knowledge-pack-json' ? null : query || null,
        })
      await load()
    } catch (error) {
      fail(error, () => void transfer(direction))
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
  const hasInspector = tab === 'glossary' || tab === 'memory'
  return (
    <>
      <div className={`ai-localization-layout${hasInspector ? '' : ' is-single-pane'}`} data-guide="translation-knowledge">
        <main className="ai-localization-main">
          {tab !== 'style' ? (
            <header className="ai-localization-toolbar">
              <strong>{tab === 'glossary' ? copy.glossaryTab : copy.memoryTab}</strong>
              {tab === 'memory' ? <SemanticSearchStatus scopeId={scopeId || undefined} showConfigure={false} /> : null}
              <div className="ai-localization-toolbar-search">
                <Search className="h-4 w-4" />
                <input
                  className="control-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.search}
                />
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
                  <button
                    className="control-button"
                    disabled={!selectedGlossaryIds.size}
                    onClick={() => setDeleteTarget('selected-glossary')}
                  >
                    <Trash2 className="h-4 w-4" />
                    {copy.delete} ({selectedGlossaryIds.size})
                  </button>
                  <button
                    className="control-button control-button-primary"
                    onClick={() => setSelectedGlossary(blankEntry(scopeId, sourceLocale, targetLocale))}
                  >
                    <Plus className="h-4 w-4" />
                    {copy.add}
                  </button>
                </>
              ) : null}
            </header>
          ) : null}
          {tab === 'style' ? (
            style ? (
              <div className="ai-localization-style">
                <label>
                  <span>{copy.tone}</span>
                  <input className="control-input" value={style.tone} onChange={(e) => setStyle({ ...style, tone: e.target.value })} />
                </label>
                <label>
                  <span>{copy.audience}</span>
                  <input
                    className="control-input"
                    value={style.audience}
                    onChange={(e) => setStyle({ ...style, audience: e.target.value })}
                  />
                </label>
                <label>
                  <span>{copy.formality}</span>
                  <input
                    className="control-input"
                    value={style.formality}
                    onChange={(e) => setStyle({ ...style, formality: e.target.value })}
                  />
                </label>
                <label className="full">
                  <span>{copy.forbiddenPhrases}</span>
                  <textarea
                    className="control-input"
                    value={style.forbiddenPhrases.join('\n')}
                    onChange={(e) => setStyle({ ...style, forbiddenPhrases: lines(e.target.value) })}
                  />
                </label>
                <label className="full">
                  <span>{copy.preferredPhrases}</span>
                  <textarea
                    className="control-input"
                    value={style.preferredPhrases.join('\n')}
                    onChange={(e) => setStyle({ ...style, preferredPhrases: lines(e.target.value) })}
                  />
                </label>
                <label className="full">
                  <span>{copy.rules}</span>
                  <textarea
                    className="control-input"
                    value={style.rules.join('\n')}
                    onChange={(e) => setStyle({ ...style, rules: lines(e.target.value) })}
                  />
                </label>
                <section className="preview-box">
                  <h4>{copy.effectivePreview}</h4>
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
                <div className="ai-localization-style-actions">
                  <button className="control-button control-button-primary" onClick={() => void saveStyle()}>
                    {copy.save}
                  </button>
                </div>
              </div>
            ) : (
              <div className="ai-localization-empty-state">
                <span>{busy ? copy.resourceStatusLoading : copy.noScopes}</span>
              </div>
            )
          ) : tab === 'glossary' ? (
            <div className="ai-localization-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
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
                      <td className="mono">{entry.sourceTerm}</td>
                      <td>{entry.doNotTranslate ? copy.doNotTranslate : entry.targetTerm}</td>
                      <td>
                        {entry.sourceLocale} → {entry.targetLocale}
                      </td>
                      <td>{scopes.find((scope) => scope.id === entry.scopeId)?.name ?? entry.scopeId}</td>
                      <td>
                        <span className={cx('ai-localization-chip', entry.doNotTranslate ? 'is-accent' : 'is-neutral')}>
                          {entry.matchMode === 'exact' ? copy.exact : copy.caseInsensitive}
                        </span>
                      </td>
                      <td>
                        <span className="muted">{new Date(entry.updatedAtMs).toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!busy && !glossary.length ? (
                <div className="ai-localization-empty-state">
                  <div className="ai-localization-empty-icon">
                    <Server className="h-4 w-4" />
                  </div>
                  <span>{copy.glossaryEmpty}</span>
                </div>
              ) : null}
              {glossaryTotal > 0 ? pagination(glossaryOffset, glossaryTotal, setGlossaryOffset) : null}
            </div>
          ) : (
            <div className="ai-localization-table">
              <table>
                <thead>
                  <tr>
                    {[
                      ['source', copy.source],
                      ['target', copy.target],
                      ['similarity', copy.similarity],
                      ['sourceScope', copy.sourceKind],
                      ['updated', copy.updatedAt],
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
                      <td className="mono">{entry.sourceText}</td>
                      <td>{entry.targetText}</td>
                      <td>
                        <span className={cx('ai-localization-chip', entry.similarity >= 0.95 ? 'is-success' : 'is-accent')}>
                          {Math.round(entry.similarity * 100)}%
                        </span>
                      </td>
                      <td>{entry.sourceKind}</td>
                      <td>
                        <span className="muted">{new Date(entry.confirmedAtMs).toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!busy && !memory.length ? (
                <div className="ai-localization-empty-state">
                  <div className="ai-localization-empty-icon">
                    <Server className="h-4 w-4" />
                  </div>
                  <span>{copy.memoryEmpty}</span>
                </div>
              ) : null}
              {memoryTotal > 0 ? pagination(memoryOffset, memoryTotal, setMemoryOffset) : null}
            </div>
          )}
        </main>
        {hasInspector ? (
          <aside className="ai-localization-inspector">
            {tab === 'glossary' ? (
              selectedGlossary ? (
                <div className="ai-localization-form">
                  <div className="ai-localization-inspector-header">
                    <strong>{copy.selectGlossary}</strong>
                  </div>
                  <label>
                    <span>{copy.sourceTerm}</span>
                    <input
                      className="control-input mono"
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
                    <CompactSelect
                      value={selectedGlossary.matchMode}
                      options={[
                        { value: 'exact', label: copy.exact },
                        { value: 'case-insensitive', label: copy.caseInsensitive },
                      ]}
                      onChange={(matchMode) => setSelectedGlossary({ ...selectedGlossary, matchMode })}
                      ariaLabel={copy.matchMode}
                      placement="bottom-start"
                    />
                  </label>
                  <label className="ai-localization-check">
                    <input
                      type="checkbox"
                      className="ai-localization-switch"
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
                    <button
                      className="control-button ai-localization-danger-button"
                      disabled={!selectedGlossary.id}
                      onClick={() => setDeleteTarget('glossary')}
                    >
                      <Trash2 className="h-4 w-4" />
                      {copy.delete}
                    </button>
                    <button className="control-button control-button-primary" onClick={() => void saveGlossary()}>
                      {copy.save}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ai-localization-empty-state">
                  <div className="ai-localization-empty-icon">
                    <Server className="h-4 w-4" />
                  </div>
                  <span>{copy.selectGlossary}</span>
                </div>
              )
            ) : tab === 'memory' ? (
              selectedMemory ? (
                <>
                  <div className="ai-localization-inspector-header">
                    <strong>{copy.selectMemory}</strong>
                  </div>
                  <section>
                    <h3>{copy.fullSource}</h3>
                    <div className="ai-localization-code-box">{selectedMemory.sourceText}</div>
                  </section>
                  <section>
                    <h3>{copy.fullTarget}</h3>
                    <div className="ai-localization-code-box">{selectedMemory.targetText}</div>
                  </section>
                  <dl className="ai-localization-kv">
                    <div>
                      <dt>{copy.similarity}</dt>
                      <dd>{Math.round(selectedMemory.similarity * 100)}%</dd>
                    </div>
                    <div>
                      <dt>{copy.localePair}</dt>
                      <dd>
                        {selectedMemory.sourceLocale} → {selectedMemory.targetLocale}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.sourceKind}</dt>
                      <dd>{selectedMemory.sourceKind}</dd>
                    </div>
                    <div>
                      <dt>{copy.useCount}</dt>
                      <dd>{selectedMemory.useCount}</dd>
                    </div>
                    <div>
                      <dt>{copy.updatedAt}</dt>
                      <dd>{new Date(selectedMemory.confirmedAtMs).toLocaleString()}</dd>
                    </div>
                  </dl>
                  <label>
                    <span>{copy.copyToScope}</span>
                    <CompactSelect
                      value={memoryTargetScopeId}
                      options={[
                        { value: '', label: copy.selectEntry },
                        ...scopes
                          .filter((scope) => scope.id !== scopeId)
                          .map((scope) => ({ value: scope.id, label: scope.kind === 'global' ? copy.globalScope : scope.name })),
                      ]}
                      onChange={setMemoryTargetScopeId}
                      ariaLabel={copy.copyToScope}
                      placement="top-start"
                    />
                  </label>
                  <div className="ai-localization-form-actions">
                    <button className="control-button ai-localization-danger-button" onClick={() => setDeleteTarget('memory')}>
                      <Trash2 className="h-4 w-4" />
                      {copy.delete}
                    </button>
                    <button
                      className="control-button control-button-primary"
                      disabled={!memoryTargetScopeId}
                      onClick={() => void copyMemory()}
                    >
                      {copy.copyToScope}
                    </button>
                  </div>
                </>
              ) : (
                <div className="ai-localization-empty-state">
                  <div className="ai-localization-empty-icon">
                    <MousePointer2 className="h-4 w-4" />
                  </div>
                  <span>{copy.selectMemory}</span>
                </div>
              )
            ) : null}
          </aside>
        ) : null}
      </div>
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} size="sm" labelledBy={deleteDialogTitleId}>
        <DialogHeader
          id={deleteDialogTitleId}
          title={copy.confirmDeleteTitle}
          onClose={() => setDeleteTarget(null)}
          closeLabel={copy.cancel}
        />
        <DialogBody>
          <p>{copy.confirmDeleteDescription(deleteTarget === 'selected-glossary' ? selectedGlossaryIds.size : 1)}</p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setDeleteTarget(null)}>{copy.cancel}</DialogAction>
          <DialogAction tone="danger" onClick={() => void confirmDelete()}>
            {copy.delete}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </>
  )
}
