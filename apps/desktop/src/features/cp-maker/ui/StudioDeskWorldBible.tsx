import { useState } from 'react'
import { X } from 'lucide-react'
import type { EditorCopy } from '@locales'
import type { StudioDeskModel, StudioDeskWorldBible, StudioDeskWorldBibleEntry } from '../model/studioDeskModel'
import { cx } from '@shared/lib/cx'

type StudioDeskWorldBibleProps = {
  id?: string
  className?: string
  copy: EditorCopy
  bible: StudioDeskWorldBible
  exportSummary: StudioDeskModel['exportSummary']
  isLoading: boolean
  onCloseDrawer?: () => void
  onExportPack: () => void
}

type BibleTab = 'actors' | 'tokens' | 'story' | 'items' | 'scenes'

const bibleTabs: Array<{ id: BibleTab; key: string }> = [
  { id: 'actors', key: 'A' },
  { id: 'tokens', key: 'T' },
  { id: 'story', key: 'J' },
  { id: 'items', key: 'I' },
  { id: 'scenes', key: 'S' },
]

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
  return entries.filter((entry) => `${entry.key} ${entry.value}`.toLowerCase().includes(normalized))
}

function EntryList({ entries, emptyLabel }: { entries: StudioDeskWorldBibleEntry[]; emptyLabel: string }) {
  if (!entries.length) {
    return <div className="studio-empty-note">{emptyLabel}</div>
  }

  return (
    <dl className="studio-bible-list">
      {entries.map((entry) => (
        <div key={`${entry.key}:${entry.value}`} className="studio-bible-row">
          <dt>{entry.key}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function StudioDeskWorldBible({
  id,
  className,
  copy,
  bible,
  exportSummary,
  isLoading,
  onCloseDrawer,
  onExportPack,
}: StudioDeskWorldBibleProps) {
  const desk = copy.studioDesk
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<BibleTab>('tokens')

  const entriesByTab: Record<BibleTab, StudioDeskWorldBibleEntry[]> = {
    actors: bible.actors,
    tokens: [...bible.tokens, ...bible.configSchema],
    story: bible.story,
    items: bible.items,
    scenes: bible.scenes.length ? bible.scenes : bible.customLocations,
  }
  const activeEntries = filterEntries(entriesByTab[activeTab], query)
  const activeEntryCount = activeEntries.length

  return (
    <aside id={id} className={cx('studio-world-bible', className)} aria-label={desk.worldBible}>
      <nav className="studio-bible-edge-tools" aria-label={desk.worldBible}>
        <span>INDEX</span>
        {bibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : undefined}
            aria-label={desk.bibleTabs[tab.id]}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.key}
          </button>
        ))}
      </nav>

      <div className="studio-bible-content">
        <header className="studio-world-header">
          <div>
            <div className="studio-section-label">{desk.worldBible}</div>
          </div>
          {onCloseDrawer ? (
            <button type="button" className="studio-world-close" aria-label={desk.closeWorldBible} onClick={onCloseDrawer}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </header>

        <label className="studio-search">
          <span className="sr-only">{desk.quickSearchLabel}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={desk.quickSearchPlaceholder} />
        </label>

        <section className="studio-bible-pane" aria-label={desk.bibleTabs[activeTab]}>
          <div className="studio-pane-title">
            <span>{desk.bibleTabs[activeTab]}</span>
            <span className="studio-card-pill studio-bible-count-pill">{desk.bibleEntryCount(entriesByTab[activeTab].length)}</span>
          </div>
          <section className="studio-accordion">
            <header className="studio-accordion-head">
              <div className="studio-accordion-title">{activeTab === 'tokens' ? desk.lexicalReferences : desk.bibleTabs[activeTab]}</div>
              <div className="studio-accordion-meta">
                <span className="studio-card-pill studio-bible-count-pill">{desk.bibleReferenceCount(activeEntryCount)}</span>
                {bible.conflictCount > 0 && activeTab === 'tokens' ? (
                  <span className="studio-conflict-bubble">{bible.conflictCount}</span>
                ) : null}
              </div>
            </header>
            <EntryList entries={activeEntries} emptyLabel={query ? desk.searchEmpty : desk.noEntries} />
          </section>
        </section>

        <section className="studio-export-center">
          <div>
            <span>{desk.exportCenter}</span>
            <small>
              {desk.lastExport}: {formatExportTime(desk, exportSummary.lastExportedAt)} ·{' '}
              {desk.exportDialog.filesToExport(exportSummary.fileList.length)}
            </small>
          </div>
          <button type="button" onClick={onExportPack} disabled={isLoading || exportSummary.fileList.length === 0}>
            <span>{desk.publishPack}</span>
          </button>
        </section>
      </div>
    </aside>
  )
}
