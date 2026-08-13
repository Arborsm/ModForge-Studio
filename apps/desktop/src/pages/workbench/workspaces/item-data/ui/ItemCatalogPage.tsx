import { useDeferredValue, useEffect, useState } from 'react'
import { Package, Plus, Search } from 'lucide-react'
import {
  addObjectEntry,
  ITEM_ASSET_FAMILIES,
  ItemSprite,
  OBJECT_DATA_ASSET_ID,
  OBJECT_DATA_SCHEMA,
  resolveItemFamilyTarget,
  useItemAuthoringHandoff,
  type ItemAssetFamily,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
  type ObjectEntrySeed,
} from '@entities/item'
import { parseAssetEditorState, parseAssetEntry } from '@entities/asset-schema'
import { WorkspaceEntryList, type AssetDraftPort, type DraftPatch, type EditorResources, type WorkspaceEntryRow } from '@features/cp-maker'
import { useEditorCopy, useItemDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import { useItemAuthoringResources } from '../state/useItemAuthoringResources'
import {
  buildItemSourceGroups,
  buildPreviewItem,
  useVanillaObjectIndex,
  type ItemSourceMode,
  type ItemSourceRow,
} from '../state/useItemAuthoringSources'
import { MAX_ROWS_PER_GROUP } from '../state/useItemAuthoringSources'
import { AddObjectDialog } from './AddObjectDialog'

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
          <ItemSprite item={item} textureState={texture} fitSize={60} className="h-full w-full" />
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

/**
 * Item authoring landing page: a two-column layout with the entry manager on
 * the left and the item library (project overrides + vanilla objects grouped
 * by `Type`) on the right. Selecting an item stages it into the singleton patch
 * and opens the editor.
 */
export function ItemCatalogPage({
  patch,
  draftPort,
  resources,
  onOpenPatch,
}: {
  patch: DraftPatch
  draftPort: AssetDraftPort
  resources: EditorResources
  onOpenPatch: (patchId: string) => void
}) {
  const copy = useItemDataEditorCopy()
  const entryListCopy = useEditorCopy().studioDesk.entryList
  const { gameRootPath, directoryInfo, locale } = resources
  const [sourceMode, setSourceMode] = useState<ItemSourceMode>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [groups, setGroups] = useState<{
    project: ItemSourceRow[]
    vanillaGroups: { key: string; label: string; totalRows: number; rows: ItemSourceRow[] }[]
    placeholderRows: ItemSourceRow[]
    resolvedNames: Map<string, string>
  }>({ project: [], vanillaGroups: [], placeholderRows: [], resolvedNames: new Map() })
  const [groupsLoading, setGroupsLoading] = useState(true)
  const deferredSearch = useDeferredValue(search)
  const vanilla = useVanillaObjectIndex(gameRootPath, directoryInfo, locale)
  const referenceData = useItemAuthoringResources({
    gameRootPath,
    directoryInfo,
    locale,
    patches: draftPort.draft.patches,
  })
  const requestOpenFamily = useItemAuthoringHandoff((state) => state.requestOpen)

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(OBJECT_DATA_ASSET_ID)

  useEffect(() => {
    let cancelled = false
    setGroupsLoading(true)
    void buildItemSourceGroups({
      rootPath: gameRootPath,
      locale,
      projectKeys: entryIds,
      projectEntries: entries,
      vanilla,
      mode: sourceMode,
      search: deferredSearch,
      ungroupedLabel: copy.sources.ungroupedLabel,
    }).then((next) => {
      if (!cancelled) {
        setGroups(next)
        setGroupsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale, entryIds, entries, vanilla, sourceMode, deferredSearch, copy.sources.ungroupedLabel])

  const hasRows =
    groups.project.length > 0 || groups.vanillaGroups.some((group) => group.rows.length > 0) || groups.placeholderRows.length > 0

  function resolveItem(row: ItemSourceRow): ItemWorkspaceEntry | null {
    return buildPreviewItem(row.key, row.inProject ? entries[row.key] : null, vanilla)
  }

  function handleSelectSource(row: ItemSourceRow) {
    if (!row.inProject) {
      draftPort.stage(OBJECT_DATA_ASSET_ID, row.key, parseAssetEntry(OBJECT_DATA_SCHEMA, vanilla.records[row.key] ?? {}))
    }
    draftPort.selectEntry(row.key)
    onOpenPatch(patch.id)
  }

  function handleCreate(objectId: string, seed: ObjectEntrySeed) {
    const result = addObjectEntry(entries, objectId, seed)
    if (!result.ok) return
    draftPort.stage(OBJECT_DATA_ASSET_ID, result.objectId, parseAssetEntry(OBJECT_DATA_SCHEMA, result.entries[result.objectId]))
    setAddOpen(false)
    draftPort.selectEntry(result.objectId)
    onOpenPatch(patch.id)
  }

  function handleSelectFamily(family: ItemAssetFamily) {
    requestOpenFamily(resolveItemFamilyTarget(family.kind))
  }

  const entryRows: WorkspaceEntryRow[] = entryIds.map((key) => {
    const meta = draftPort.readEntryMeta(OBJECT_DATA_ASSET_ID, key)
    const isVanilla = vanilla.entries.has(key.toLowerCase())
    return {
      key,
      displayName: groups.resolvedNames.get(key) ?? key,
      enabled: meta.enabled,
      badge: {
        tone: isVanilla ? 'warn' : 'ok',
        label: isVanilla ? copy.sources.overrideBadge : copy.sources.newBadge,
      },
    }
  })

  function handleOpenEntry(key: string) {
    draftPort.selectEntry(key)
    onOpenPatch(patch.id)
  }

  function handleDeleteEntry(key: string) {
    draftPort.stage(OBJECT_DATA_ASSET_ID, key, null)
  }

  function handleToggleEntry(key: string, next: boolean) {
    draftPort.stageEntryMeta(OBJECT_DATA_ASSET_ID, key, { enabled: next })
  }

  const modes: Array<{ id: ItemSourceMode; label: string }> = [
    { id: 'all', label: copy.sources.modeAll },
    { id: 'project', label: copy.sources.modeProject },
    { id: 'vanilla', label: copy.sources.modeVanilla },
  ]
  const normalizedActiveAsset = patch.target.trim().toLowerCase()

  const renderCards = (rows: ItemSourceRow[]) => (
    <div className="item-catalog-grid">
      {rows.map((row) => (
        <ItemCatalogCard
          key={row.key}
          row={row}
          item={resolveItem(row)}
          textureStates={referenceData.itemTextureStates}
          onSelect={handleSelectSource}
        />
      ))}
    </div>
  )

  return (
    <WorkspaceSplitView
      sidebarLabel={entryListCopy.regionLabel}
      mainToolbar={
        <>
          <label className="workspace-split-view-toolbar-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{copy.sources.searchPlaceholder}</span>
            <input
              type="search"
              className="control-input"
              value={search}
              placeholder={copy.sources.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="asset-source-modes" role="group">
            {modes.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === sourceMode}
                className={cx('asset-source-mode', option.id === sourceMode && 'is-active')}
                onClick={() => setSourceMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="control-button control-button-primary ml-auto" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copy.addEntryAction}</span>
          </button>
        </>
      }
      sidebar={
        <WorkspaceEntryList
          rows={entryRows}
          onOpen={handleOpenEntry}
          onDelete={handleDeleteEntry}
          onToggleEnabled={handleToggleEntry}
          title={entryListCopy.regionLabel}
        />
      }
    >
      <div className="item-catalog custom-scrollbar">
        <nav className="item-family-strip" aria-label={copy.families.title}>
          {ITEM_ASSET_FAMILIES.map((family) => (
            <button
              key={family.assetId}
              type="button"
              aria-pressed={family.assetId.toLowerCase() === normalizedActiveAsset}
              className={cx('item-family-button', family.assetId.toLowerCase() === normalizedActiveAsset && 'is-active')}
              title={family.assetId}
              onClick={() => handleSelectFamily(family)}
            >
              <span>{copy.families.labels[family.kind]}</span>
              <span className={family.editor === 'structured' ? 'asset-editor-badge is-ok' : 'asset-editor-badge'}>
                {family.editor === 'structured' ? copy.families.supportedBadge : copy.families.rawBadge}
              </span>
            </button>
          ))}
        </nav>

        <div className="item-catalog-content">
          {sourceMode !== 'vanilla' && groups.project.length > 0 ? (
            <section className="item-catalog-section">
              <div className="item-catalog-section-head">
                <h3>{copy.sources.projectGroup}</h3>
                <span>{copy.sources.groupCount(groups.project.length)}</span>
              </div>
              {renderCards(groups.project)}
            </section>
          ) : null}

          {sourceMode !== 'project'
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

          {sourceMode !== 'project' && groups.placeholderRows.length > 0 ? (
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
                {vanilla.loading || groupsLoading
                  ? copy.sources.vanillaLoading
                  : !vanilla.available && sourceMode !== 'project'
                    ? copy.sources.vanillaUnavailable
                    : search.trim()
                      ? copy.sources.searchEmpty
                      : copy.sources.projectEmpty}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <AddObjectDialog
        open={addOpen}
        existingIds={entryIds}
        textureSuggestions={referenceData.textureAssetNames}
        projectUniqueId={draftPort.draft.projectMetadata.projectUniqueId}
        gameRootPath={gameRootPath}
        locale={locale}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
    </WorkspaceSplitView>
  )
}
