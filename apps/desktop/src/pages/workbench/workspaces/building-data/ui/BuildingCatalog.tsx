import { Building2, Plus, Search } from 'lucide-react'
import { BuildingSpritePreview, type BuildingWorkspaceEntry } from '@entities/building'
import type { LocaleCode } from '@locales'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { BuildingSourceGroups, BuildingSourceMode, BuildingSourceRow } from '../state/useBuildingAuthoringSources'
import { useBuildingTexture } from '../state/useBuildingTexture'

function BuildingCatalogCard({
  row,
  building,
  gameRootPath,
  locale,
  onSelect,
}: {
  row: BuildingSourceRow
  building: BuildingWorkspaceEntry | null
  gameRootPath: string | null
  locale: LocaleCode
  onSelect: (row: BuildingSourceRow) => void
}) {
  const copy = useBuildingDataEditorCopy()
  const texture = useBuildingTexture(building, gameRootPath, locale)

  return (
    <button
      type="button"
      className="building-catalog-card"
      onClick={() => onSelect(row)}
      title={copy.sources.openBuilding(row.displayName)}
    >
      <span className="building-catalog-preview" aria-hidden="true">
        {building === null ? (
          <Building2 className="h-8 w-8" />
        ) : (
          <BuildingSpritePreview building={building} textureState={texture} fitSize={64} />
        )}
      </span>
      <span className="building-catalog-card-body">
        <strong>{row.displayName}</strong>
        <span>{row.key}</span>
      </span>
      {row.inProject ? (
        <span className={cx('asset-editor-badge', row.vanilla ? 'is-warn' : 'is-ok')}>
          {row.vanilla ? copy.sources.overrideBadge : copy.sources.newBadge}
        </span>
      ) : null}
    </button>
  )
}

/** First-level visual library for choosing which building to edit. */
export function BuildingCatalog({
  groups,
  mode,
  search,
  vanillaLoading,
  vanillaAvailable,
  gameRootPath,
  locale,
  resolveBuilding,
  onModeChange,
  onSearchChange,
  onSelect,
  onAddEntry,
}: {
  groups: BuildingSourceGroups
  mode: BuildingSourceMode
  search: string
  vanillaLoading: boolean
  vanillaAvailable: boolean
  gameRootPath: string | null
  locale: LocaleCode
  resolveBuilding: (row: BuildingSourceRow) => BuildingWorkspaceEntry | null
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
  const hasRows = groups.project.length > 0 || groups.vanillaGroups.some((group) => group.rows.length > 0)

  const renderCards = (rows: BuildingSourceRow[]) => (
    <div className="building-catalog-grid">
      {rows.map((row) => (
        <BuildingCatalogCard
          key={row.key}
          row={row}
          building={resolveBuilding(row)}
          gameRootPath={gameRootPath}
          locale={locale}
          onSelect={onSelect}
        />
      ))}
    </div>
  )

  return (
    <div className="building-catalog custom-scrollbar">
      <header className="building-catalog-toolbar">
        <div className="building-catalog-intro">
          <h2>{copy.sources.libraryTitle}</h2>
          <p>{copy.sources.libraryHint}</p>
        </div>
        <label className="building-catalog-search">
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
        <button type="button" className="control-button control-button-primary" onClick={onAddEntry}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copy.addEntryAction}</span>
        </button>
      </header>

      <div className="building-catalog-content">
        {mode !== 'vanilla' && groups.project.length > 0 ? (
          <section className="building-catalog-section">
            <div className="building-catalog-section-head">
              <h3>{copy.sources.projectGroup}</h3>
              <span>{copy.sources.groupCount(groups.project.length)}</span>
            </div>
            {renderCards(groups.project)}
          </section>
        ) : null}

        {mode !== 'project'
          ? groups.vanillaGroups.map((group) => (
              <section key={group.key} className="building-catalog-section">
                <div className="building-catalog-section-head">
                  <h3>{group.label}</h3>
                  <span>{copy.sources.stageCount(group.stageCount)}</span>
                </div>
                {renderCards(group.rows)}
              </section>
            ))
          : null}

        {!hasRows ? (
          <div className="building-catalog-empty">
            <Building2 className="h-8 w-8" aria-hidden="true" />
            <p>
              {vanillaLoading
                ? copy.sources.vanillaLoading
                : !vanillaAvailable && mode !== 'project'
                  ? copy.sources.vanillaUnavailable
                  : search.trim()
                    ? copy.sources.searchEmpty
                    : copy.sources.projectEmpty}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
