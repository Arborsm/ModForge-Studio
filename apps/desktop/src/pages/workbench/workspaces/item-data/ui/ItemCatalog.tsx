import { Package, Plus, Search } from 'lucide-react'
import { ITEM_ASSET_FAMILIES, ItemSprite, type ItemAssetFamily, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import { useItemDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { ItemSourceGroups, ItemSourceMode, ItemSourceRow } from '../state/useItemAuthoringSources'
import { MAX_ROWS_PER_GROUP } from '../state/useItemAuthoringSources'

function ItemCatalogCard({
  row,
  item,
  textureStates,
  onSelect,
}: {
  row: ItemSourceRow
  item: ItemWorkspaceEntry | null
  textureStates: Readonly<Record<string, ItemTextureAssetState>>
  onSelect: (row: ItemSourceRow) => void
}) {
  const copy = useItemDataEditorCopy()
  const textureKey = item?.textureAssetName?.replaceAll('\\', '/').toLowerCase() ?? ''
  const texture = textureStates[textureKey] ?? null
  return (
    <button type="button" className="item-catalog-card" title={copy.sources.openItem(row.displayName)} onClick={() => onSelect(row)}>
      <span className="item-catalog-preview" aria-hidden="true">
        {item === null ? (
          <Package className="h-7 w-7" />
        ) : (
          <ItemSprite item={item} textureState={texture} scale={2.5} className="h-full w-full" />
        )}
      </span>
      <span className="item-catalog-card-body">
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

/** Visual item library grouped by asset family and vanilla object type. */
export function ItemCatalog({
  groups,
  activeAssetId,
  mode,
  search,
  vanillaLoading,
  vanillaAvailable,
  textureStates,
  resolveItem,
  onSelectFamily,
  onModeChange,
  onSearchChange,
  onSelect,
  onAddEntry,
}: {
  groups: ItemSourceGroups
  activeAssetId: string
  mode: ItemSourceMode
  search: string
  vanillaLoading: boolean
  vanillaAvailable: boolean
  textureStates: Readonly<Record<string, ItemTextureAssetState>>
  resolveItem: (row: ItemSourceRow) => ItemWorkspaceEntry | null
  onSelectFamily: (family: ItemAssetFamily) => void
  onModeChange: (mode: ItemSourceMode) => void
  onSearchChange: (search: string) => void
  onSelect: (row: ItemSourceRow) => void
  onAddEntry: () => void
}) {
  const copy = useItemDataEditorCopy()
  const modes: Array<{ id: ItemSourceMode; label: string }> = [
    { id: 'all', label: copy.sources.modeAll },
    { id: 'project', label: copy.sources.modeProject },
    { id: 'vanilla', label: copy.sources.modeVanilla },
  ]
  const normalizedActiveAsset = activeAssetId.trim().toLowerCase()
  const hasRows =
    groups.project.length > 0 || groups.vanillaGroups.some((group) => group.rows.length > 0) || groups.placeholderRows.length > 0

  const renderCards = (rows: ItemSourceRow[]) => (
    <div className="item-catalog-grid">
      {rows.map((row) => (
        <ItemCatalogCard key={row.key} row={row} item={resolveItem(row)} textureStates={textureStates} onSelect={onSelect} />
      ))}
    </div>
  )

  return (
    <div className="item-catalog custom-scrollbar">
      <header className="item-catalog-toolbar">
        <div className="item-catalog-intro">
          <h2>{copy.sources.libraryTitle}</h2>
          <p>{copy.sources.libraryHint}</p>
        </div>
        <label className="item-catalog-search">
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

      <nav className="item-family-strip" aria-label={copy.families.title}>
        {ITEM_ASSET_FAMILIES.map((family) => (
          <button
            key={family.assetId}
            type="button"
            aria-pressed={family.assetId.toLowerCase() === normalizedActiveAsset}
            className={cx('item-family-button', family.assetId.toLowerCase() === normalizedActiveAsset && 'is-active')}
            title={family.assetId}
            onClick={() => onSelectFamily(family)}
          >
            <span>{copy.families.labels[family.kind]}</span>
            <span className={family.editor === 'structured' ? 'asset-editor-badge is-ok' : 'asset-editor-badge'}>
              {family.editor === 'structured' ? copy.families.supportedBadge : copy.families.rawBadge}
            </span>
          </button>
        ))}
      </nav>

      <div className="item-catalog-content">
        {mode !== 'vanilla' && groups.project.length > 0 ? (
          <section className="item-catalog-section">
            <div className="item-catalog-section-head">
              <h3>{copy.sources.projectGroup}</h3>
              <span>{copy.sources.groupCount(groups.project.length)}</span>
            </div>
            {renderCards(groups.project)}
          </section>
        ) : null}

        {mode !== 'project'
          ? groups.vanillaGroups.map((group) => (
              <section key={group.key} className="item-catalog-section">
                <div className="item-catalog-section-head">
                  <h3>{group.label}</h3>
                  <span>{copy.sources.groupCount(group.totalRows)}</span>
                </div>
                {renderCards(group.rows)}
                {group.totalRows > group.rows.length ? (
                  <p className="item-catalog-truncated">{copy.sources.truncatedHint(group.rows.length, group.totalRows)}</p>
                ) : null}
              </section>
            ))
          : null}

        {mode !== 'project' && groups.placeholderRows.length > 0 ? (
          <details className="item-catalog-section">
            <summary className="item-catalog-section-head">
              <h3>{copy.sources.placeholderGroup}</h3>
              <span>{copy.sources.groupCount(groups.placeholderRows.length)}</span>
            </summary>
            {renderCards(groups.placeholderRows.slice(0, MAX_ROWS_PER_GROUP))}
          </details>
        ) : null}

        {!hasRows ? (
          <div className="item-catalog-empty">
            <Package className="h-8 w-8" aria-hidden="true" />
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
