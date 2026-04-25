import { useMemo, useState } from 'react'
import type { EditorCopy } from '../../locales'
import type { StudioDeskModel, StudioDeskWorldBible, StudioDeskWorldBibleEntry } from '../../lib/app/studioDeskModel'

type StudioDeskWorldBibleProps = {
  copy: EditorCopy
  bible: StudioDeskWorldBible
  exportSummary: StudioDeskModel['exportSummary']
  isLoading: boolean
  onExportPack: () => void
}

function formatExportTime(copy: EditorCopy['studioDesk'], timestamp: number | null) {
  if (!timestamp) return copy.neverExported
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function filterEntries(entries: StudioDeskWorldBibleEntry[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return entries
  return entries.filter((entry) =>
    `${entry.key} ${entry.value}`.toLowerCase().includes(normalized)
  )
}

function EntryList({
  entries,
  emptyLabel,
}: {
  entries: StudioDeskWorldBibleEntry[]
  emptyLabel: string
}) {
  if (!entries.length) {
    return <div className="studio-empty-note">{emptyLabel}</div>
  }

  return (
    <dl className="studio-bible-list">
      {entries.map((entry) => (
        <div key={entry.key} className="studio-bible-row">
          <dt>{entry.key}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function StudioDeskWorldBible({
  copy,
  bible,
  exportSummary,
  isLoading,
  onExportPack,
}: StudioDeskWorldBibleProps) {
  const desk = copy.studioDesk
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () => ({
      configSchema: filterEntries(bible.configSchema, query),
      tokens: filterEntries(bible.tokens, query),
      customLocations: filterEntries(bible.customLocations, query),
    }),
    [bible.configSchema, bible.customLocations, bible.tokens, query],
  )
  const hasFilteredEntries =
    filtered.configSchema.length > 0 || filtered.tokens.length > 0 || filtered.customLocations.length > 0

  return (
    <aside className="studio-world-bible">
      <header className="studio-world-header">
        <div>
          <div className="studio-section-label">{desk.worldBible}</div>
        </div>
      </header>

      <label className="studio-search">
        <span className="sr-only">{desk.quickSearchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={desk.quickSearchPlaceholder}
        />
      </label>

      {query && !hasFilteredEntries ? <div className="studio-empty-note">{desk.searchEmpty}</div> : null}

      <div className="studio-accordion-stack">
        <details className="studio-accordion" open={bible.configSchema.length > 0}>
          <summary>
            <span>
              {desk.globalRules}
              {bible.conflictCount > 0 ? <span className="studio-conflict-bubble">{bible.conflictCount}</span> : null}
            </span>
            <small className="studio-card-pill">{desk.activeRules(bible.configSchema.length)}</small>
          </summary>
          <EntryList entries={filtered.configSchema} emptyLabel={desk.noEntries} />
        </details>

        <details className="studio-accordion" open={bible.tokens.length > 0}>
          <summary>
            <span>{desk.lexicalReferences}</span>
            <small className="studio-card-pill">{desk.tokenCount(bible.tokens.length)}</small>
          </summary>
          <EntryList entries={filtered.tokens} emptyLabel={desk.noEntries} />
        </details>

        <details className="studio-accordion">
          <summary>
            <span>{desk.customLocations}</span>
            <small className="studio-card-pill">{desk.locationCount(bible.customLocations.length)}</small>
          </summary>
          <EntryList entries={filtered.customLocations} emptyLabel={desk.noEntries} />
        </details>
      </div>

      <section className="studio-export-center">
        <div>
          <span>{desk.exportCenter}</span>
          <small>{desk.lastExport}: {formatExportTime(desk, exportSummary.lastExportedAt)}</small>
        </div>
        <button type="button" onClick={onExportPack} disabled={isLoading || exportSummary.fileList.length === 0}>
          <span>{desk.publishPack}</span>
        </button>
      </section>
    </aside>
  )
}
