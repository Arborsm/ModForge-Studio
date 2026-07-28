/**
 * Left pane of the item authoring editor: which asset family, and which object.
 *
 * Every item family is listed even though only `Data/Objects` has a structured
 * form, because an author looking for weapons or hats has to be able to see that
 * they exist and reach them — picking one opens its patch in the raw JSON editor
 * instead of dead-ending. Vanilla objects are layered by `Type`; with ~800 of
 * them the search is the real navigation, so each group renders a capped slice
 * and says how much it is holding back.
 */

import { Package, Plus, Search } from 'lucide-react'
import { ITEM_ASSET_FAMILIES, type ItemAssetFamily } from '@entities/item'
import { useItemDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { ItemSourceGroups, ItemSourceMode, ItemSourceRow } from '../state/useItemAuthoringSources'
import { MAX_ROWS_PER_GROUP } from '../state/useItemAuthoringSources'

function FamilyRow({
  family,
  active,
  onSelect,
}: {
  family: ItemAssetFamily
  active: boolean
  onSelect: (family: ItemAssetFamily) => void
}) {
  const copy = useItemDataEditorCopy()
  const supported = family.editor === 'structured'

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx('asset-source-row', active && 'is-active')}
      onClick={() => onSelect(family)}
      title={family.assetId}
    >
      <span className="asset-source-row-text">
        <span className="asset-source-row-name">{copy.families.labels[family.kind]}</span>
        <span className="asset-source-row-key">{family.assetId}</span>
      </span>
      <span className={cx('asset-editor-badge', supported ? 'is-ok' : 'is-warn')}>
        {supported ? copy.families.supportedBadge : copy.families.rawBadge}
      </span>
    </button>
  )
}

function SourceRow({ row, active, onSelect }: { row: ItemSourceRow; active: boolean; onSelect: (row: ItemSourceRow) => void }) {
  const copy = useItemDataEditorCopy()

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

export function ItemSourcePane({
  groups,
  activeAssetId,
  mode,
  search,
  activeKey,
  vanillaLoading,
  vanillaAvailable,
  onSelectFamily,
  onModeChange,
  onSearchChange,
  onSelect,
  onAddEntry,
}: {
  groups: ItemSourceGroups
  /** Asset the open patch edits, so the family list can mark it active. */
  activeAssetId: string
  mode: ItemSourceMode
  search: string
  activeKey: string | null
  vanillaLoading: boolean
  vanillaAvailable: boolean
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
  const vanillaRowCount = groups.vanillaGroups.reduce((total, group) => total + group.totalRows, 0)

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
        <section className="asset-source-group">
          <header className="asset-source-group-head">
            <span>{copy.families.title}</span>
          </header>
          {ITEM_ASSET_FAMILIES.map((family) => (
            <FamilyRow
              key={family.assetId}
              family={family}
              active={family.assetId.toLowerCase() === normalizedActiveAsset}
              onSelect={onSelectFamily}
            />
          ))}
          <p className="asset-source-empty">{copy.families.rawHint}</p>
        </section>

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
                    <Package className="h-3 w-3" aria-hidden="true" />
                    {group.label}
                  </span>
                  <span className="asset-source-group-count">{copy.sources.groupCount(group.totalRows)}</span>
                </header>
                {group.rows.map((row) => (
                  <SourceRow key={row.key} row={row} active={row.key === activeKey} onSelect={onSelect} />
                ))}
                {group.totalRows > group.rows.length ? (
                  <p className="asset-source-empty">{copy.sources.truncatedHint(group.rows.length, group.totalRows)}</p>
                ) : null}
              </section>
            ))}

            {groups.placeholderRows.length > 0 ? (
              <details className="asset-source-group">
                <summary className="asset-source-group-head cursor-pointer">
                  <span className="inline-flex items-center gap-1.5">
                    <Package className="h-3 w-3" aria-hidden="true" />
                    {copy.sources.placeholderGroup}
                  </span>
                  <span className="asset-source-group-count">{copy.sources.groupCount(groups.placeholderRows.length)}</span>
                </summary>
                {groups.placeholderRows.slice(0, MAX_ROWS_PER_GROUP).map((row) => (
                  <SourceRow key={row.key} row={row} active={row.key === activeKey} onSelect={onSelect} />
                ))}
                {groups.placeholderRows.length > MAX_ROWS_PER_GROUP ? (
                  <p className="asset-source-empty">{copy.sources.truncatedHint(MAX_ROWS_PER_GROUP, groups.placeholderRows.length)}</p>
                ) : null}
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  )
}
