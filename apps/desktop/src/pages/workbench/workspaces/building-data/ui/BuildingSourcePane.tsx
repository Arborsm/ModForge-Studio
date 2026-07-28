/**
 * Left pane of the building authoring editor: which building is being edited.
 *
 * Vanilla rows are layered by upgrade chain rather than listed flat, because a
 * `Data/Buildings` key like `Deluxe Barn` only makes sense next to the `Barn`
 * it upgrades from — editing the wrong stage is the most common way a building
 * patch silently does nothing. Buildings this patch already defines stay in
 * their own group at the top so an author never has to hunt for their own work.
 */

import { Building2, Plus, Search } from 'lucide-react'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { BuildingSourceGroups, BuildingSourceMode, BuildingSourceRow } from '../state/useBuildingAuthoringSources'

function SourceRow({ row, active, onSelect }: { row: BuildingSourceRow; active: boolean; onSelect: (row: BuildingSourceRow) => void }) {
  const copy = useBuildingDataEditorCopy()

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx('asset-source-row', active && 'is-active')}
      onClick={() => onSelect(row)}
      title={row.inProject ? row.key : copy.sources.overrideHint}
    >
      <span className="asset-source-row-text">
        <span className="asset-source-row-name">{row.displayName}</span>
        <span className="asset-source-row-key">{row.key}</span>
      </span>
      {row.inProject ? (
        <span className={cx('asset-editor-badge', row.vanilla ? 'is-warn' : 'is-ok')}>
          {row.vanilla ? copy.sources.overrideBadge : copy.sources.newBadge}
        </span>
      ) : (
        <Plus className="asset-source-row-action" aria-hidden="true" />
      )}
    </button>
  )
}

export function BuildingSourcePane({
  groups,
  mode,
  search,
  activeKey,
  vanillaLoading,
  vanillaAvailable,
  onModeChange,
  onSearchChange,
  onSelect,
  onAddEntry,
}: {
  groups: BuildingSourceGroups
  mode: BuildingSourceMode
  search: string
  activeKey: string | null
  vanillaLoading: boolean
  vanillaAvailable: boolean
  onModeChange: (mode: BuildingSourceMode) => void
  onSearchChange: (search: string) => void
  onSelect: (row: BuildingSourceRow) => void
  onAddEntry: () => void
}) {
  const copy = useBuildingDataEditorCopy()
  const modes: Array<{ id: BuildingSourceMode; label: string }> = [
    { id: 'all', label: copy.sources.modeAll },
    { id: 'project', label: copy.sources.modeProject },
    { id: 'vanilla', label: copy.sources.modeVanilla },
  ]
  const vanillaRowCount = groups.vanillaGroups.reduce((total, group) => total + group.rows.length, 0)

  return (
    <aside className="asset-source-pane">
      <div className="asset-source-head">
        <span className="asset-source-title">{copy.sources.title}</span>
        <button type="button" className="control-button" onClick={onAddEntry}>
          <Plus className="h-3.5 w-3.5" />
          <span>{copy.addEntryAction}</span>
        </button>
      </div>

      <div className="asset-source-controls">
        <label className="asset-source-search">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <input
            type="search"
            className="control-input"
            value={search}
            placeholder={copy.sources.searchPlaceholder}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="asset-source-modes" role="group">
          {modes.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === mode}
              className={cx('asset-source-mode', option.id === mode && 'is-active')}
              onClick={() => onModeChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="asset-source-list custom-scrollbar">
        {mode !== 'vanilla' ? (
          <section className="asset-source-group">
            <header className="asset-source-group-head">
              <span>{copy.sources.projectGroup}</span>
              <span className="asset-source-group-count">{copy.sources.groupCount(groups.project.length)}</span>
            </header>
            {groups.project.length === 0 ? (
              <p className="asset-source-empty">{search.trim() ? copy.sources.searchEmpty : copy.sources.projectEmpty}</p>
            ) : (
              groups.project.map((row) => <SourceRow key={row.key} row={row} active={row.key === activeKey} onSelect={onSelect} />)
            )}
          </section>
        ) : null}

        {mode !== 'project' ? (
          <>
            <section className="asset-source-group">
              <header className="asset-source-group-head">
                <span>{copy.sources.vanillaGroup}</span>
                <span className="asset-source-group-count">{copy.sources.groupCount(vanillaRowCount)}</span>
              </header>
              {vanillaLoading ? <p className="asset-source-empty">{copy.sources.vanillaLoading}</p> : null}
              {!vanillaLoading && !vanillaAvailable ? <p className="asset-source-empty">{copy.sources.vanillaUnavailable}</p> : null}
              {!vanillaLoading && vanillaAvailable && vanillaRowCount === 0 ? (
                <p className="asset-source-empty">{copy.sources.searchEmpty}</p>
              ) : null}
            </section>

            {groups.vanillaGroups.map((group) => (
              <section key={group.key} className="asset-source-group">
                <header className="asset-source-group-head">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" aria-hidden="true" />
                    {group.label}
                  </span>
                  <span className="building-source-stage-badge">{copy.sources.stageCount(group.stageCount)}</span>
                </header>
                {group.rows.map((row) => (
                  <SourceRow key={row.key} row={row} active={row.key === activeKey} onSelect={onSelect} />
                ))}
              </section>
            ))}
          </>
        ) : null}
      </div>
    </aside>
  )
}
