import { useDeferredValue, useEffect, useState } from 'react'
import { Building2, Plus, Search } from 'lucide-react'
import {
  addBuildingEntry,
  BUILDING_DATA_ASSET_ID,
  BUILDING_DATA_SCHEMA,
  BuildingSpritePreview,
  type BuildingFootprint,
  type BuildingWorkspaceEntry,
} from '@entities/building'
import { parseAssetEditorState, parseAssetEntry } from '@entities/asset-schema'
import { WorkspaceEntryList, type AssetDraftPort, type DraftPatch, type EditorResources, type WorkspaceEntryRow } from '@features/cp-maker'
import { useBuildingDataEditorCopy, useEditorCopy } from '@locales/provider'
import type { LocaleCode } from '@locales'
import { cx } from '@shared/lib/helper'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import {
  buildBuildingSourceGroups,
  buildPreviewEntry,
  useVanillaBuildingIndex,
  type BuildingSourceMode,
  type BuildingSourceRow,
} from '../state/useBuildingAuthoringSources'
import { useBuildingTexture } from '../state/useBuildingTexture'
import { AddBuildingDialog } from './AddBuildingDialog'

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

/**
 * Building authoring landing page: a two-column layout with the entry manager
 * on the left and the building library (project overrides + vanilla entries
 * layered by upgrade chain) on the right. Selecting a building stages it into
 * the singleton patch and opens the editor.
 */
export function BuildingCatalogPage({
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
  const copy = useBuildingDataEditorCopy()
  const entryListCopy = useEditorCopy().studioDesk.entryList
  const { gameRootPath, directoryInfo, locale } = resources
  const [sourceMode, setSourceMode] = useState<BuildingSourceMode>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [groups, setGroups] = useState<{
    project: BuildingSourceRow[]
    vanillaGroups: { key: string; label: string; stageCount: number; rows: BuildingSourceRow[] }[]
    resolvedNames: Map<string, string>
  }>({ project: [], vanillaGroups: [], resolvedNames: new Map() })
  const [groupsLoading, setGroupsLoading] = useState(true)
  const deferredSearch = useDeferredValue(search)
  const vanilla = useVanillaBuildingIndex(gameRootPath, directoryInfo, locale)

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(BUILDING_DATA_ASSET_ID)

  useEffect(() => {
    let cancelled = false
    setGroupsLoading(true)
    void buildBuildingSourceGroups({
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

  const hasRows = groups.project.length > 0 || groups.vanillaGroups.some((group) => group.rows.length > 0)

  function resolveBuilding(row: BuildingSourceRow): BuildingWorkspaceEntry | null {
    return buildPreviewEntry(row.key, row.inProject ? entries[row.key] : null, vanilla)
  }

  function handleSelectSource(row: BuildingSourceRow) {
    if (!row.inProject) {
      const record = vanilla.records[row.key]
      draftPort.stage(BUILDING_DATA_ASSET_ID, row.key, parseAssetEntry(BUILDING_DATA_SCHEMA, record ?? {}))
    }
    draftPort.selectEntry(row.key)
    onOpenPatch(patch.id)
  }

  function handleCreate(buildingId: string, footprint: BuildingFootprint) {
    const result = addBuildingEntry(entries, buildingId, footprint)
    if (!result.ok) return
    draftPort.stage(BUILDING_DATA_ASSET_ID, result.buildingId, parseAssetEntry(BUILDING_DATA_SCHEMA, result.entries[result.buildingId]))
    setAddOpen(false)
    draftPort.selectEntry(result.buildingId)
    onOpenPatch(patch.id)
  }

  const entryRows: WorkspaceEntryRow[] = entryIds.map((key) => {
    const meta = draftPort.readEntryMeta(BUILDING_DATA_ASSET_ID, key)
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
    draftPort.stage(BUILDING_DATA_ASSET_ID, key, null)
  }

  function handleToggleEntry(key: string, next: boolean) {
    draftPort.stageEntryMeta(BUILDING_DATA_ASSET_ID, key, { enabled: next })
  }

  const modes: Array<{ id: BuildingSourceMode; label: string }> = [
    { id: 'all', label: copy.sources.modeAll },
    { id: 'project', label: copy.sources.modeProject },
    { id: 'vanilla', label: copy.sources.modeVanilla },
  ]

  const renderCards = (rows: BuildingSourceRow[]) => (
    <div className="building-catalog-grid">
      {rows.map((row) => (
        <BuildingCatalogCard
          key={row.key}
          row={row}
          building={resolveBuilding(row)}
          gameRootPath={gameRootPath}
          locale={locale}
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
      <div className="building-catalog custom-scrollbar">
        <div className="building-catalog-content">
          {sourceMode !== 'vanilla' && groups.project.length > 0 ? (
            <section className="building-catalog-section">
              <div className="building-catalog-section-head">
                <h3>{copy.sources.projectGroup}</h3>
                <span>{copy.sources.groupCount(groups.project.length)}</span>
              </div>
              {renderCards(groups.project)}
            </section>
          ) : null}

          {sourceMode !== 'project'
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

      <AddBuildingDialog
        open={addOpen}
        existingIds={entryIds}
        projectUniqueId={draftPort.draft.projectMetadata.projectUniqueId}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
    </WorkspaceSplitView>
  )
}
