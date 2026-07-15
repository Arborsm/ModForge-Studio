import { ChevronLeft, ChevronRight, Download, Plus, Search, Trash2, Upload } from 'lucide-react'
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
import { ResizableColumnHeader, useAiLocalizationColumnWidths } from '../model/useAiLocalizationColumnWidths'

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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const runKnowledgeLoad = useLatestTask('ai-localization-knowledge-content')
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
          setError(null)
        } finally {
          if (task.isCurrent()) setBusy(false)
        }
      })
    } catch (error) {
      if (!(error instanceof TaskCancelledError)) {
        setBusy(false)
        fail()
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
    <>
      <div className="ai-localization-layout">
        <main className="ai-localization-main">
          <header className="ai-localization-toolbar">
            {tab === 'memory' ? <SemanticSearchStatus scopeId={scopeId || undefined} /> : null}
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
                <button
                  className="control-button"
                  disabled={!selectedGlossaryIds.size}
                  onClick={() => setDeleteTarget('selected-glossary')}
                >
                  <Trash2 className="h-4 w-4" />
                  {copy.delete} ({selectedGlossaryIds.size})
                </button>
                <button className="control-button" onClick={() => setSelectedGlossary(blankEntry(scopeId, sourceLocale, targetLocale))}>
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
              {!busy && !glossary.length ? <p className="ai-localization-empty">{copy.glossaryEmpty}</p> : null}
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
              {!busy && !memory.length ? <p className="ai-localization-empty">{copy.memoryEmpty}</p> : null}
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
                  <button className="control-button" disabled={!selectedGlossary.id} onClick={() => setDeleteTarget('glossary')}>
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
                <button className="control-button" onClick={() => setDeleteTarget('memory')}>
                  <Trash2 className="h-4 w-4" />
                  {copy.delete}
                </button>
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
                <button className="control-button" disabled={!memoryTargetScopeId} onClick={() => void copyMemory()}>
                  {copy.copyToScope}
                </button>
              </>
            ) : null
          ) : null}
        </aside>
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
