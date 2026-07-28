import { useDeferredValue, useEffect, useId, useState } from 'react'
import { AlertTriangle, Building2, Plus, Trash2 } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import {
  AssetEntryCanvas,
  isPlainObject,
  parseAssetEditorState,
  parseAssetEntry,
  type AssetEntryDraft,
  type AssetResources,
  type GsqBuilderRequest,
} from '@entities/asset-schema'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import {
  addBuildingEntry,
  BUILDING_DATA_ASSET_ID,
  BUILDING_DATA_SCHEMA,
  findBuildingTexturePatchState,
  useBuildingAuthoringHandoff,
  validateBuildingEntries,
  type BuildingFootprint,
} from '@entities/building'
import { useBuildingDataEditorCopy, useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import {
  buildBuildingSourceGroups,
  buildPreviewEntry,
  buildUpgradeChainStages,
  useVanillaBuildingIndex,
  type BuildingSourceMode,
  type BuildingSourceRow,
} from '../state/useBuildingAuthoringSources'
import { AddBuildingDialog } from '../ui/AddBuildingDialog'
import { BuildingPreviewPane } from '../ui/BuildingPreviewPane'
import { BuildingSourcePane } from '../ui/BuildingSourcePane'
import type { FootprintRect, FootprintRectPickTarget, FootprintTilePickTarget } from '../ui/BuildingFootprintOverlay'
import { useBuildingAuthoringResources } from '../state/useBuildingAuthoringResources'
import {
  buildBuildingRefOptions,
  buildIndoorMapOptions,
  buildMaterialOptions,
  buildTextureRefOptions,
} from '../state/buildingPickerOptions'

function RemoveEntryDialog({ buildingId, onClose, onConfirm }: { buildingId: string | null; onClose: () => void; onConfirm: () => void }) {
  const copy = useBuildingDataEditorCopy()
  const titleId = useId()
  return (
    <Dialog open={buildingId !== null} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        id={titleId}
        title={copy.entries.removeConfirmTitle}
        tone="danger"
        icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.entries.closeLabel}
      />
      <DialogBody>
        <p className="asset-editor-remove-message">{buildingId !== null ? copy.entries.removeConfirmMessage(buildingId) : ''}</p>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.entries.cancelAction}</DialogAction>
        <DialogAction tone="danger" onClick={onConfirm}>
          {copy.entries.removeConfirmAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}

/** Keys `BuildingToUpgrade` may reference, project entries taking precedence. */
function sortedBuildingKeys(projectKeys: readonly string[], vanillaKeys: readonly string[]): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const key of [...projectKeys, ...vanillaKeys]) {
    const normalized = key.trim()
    if (normalized === '' || seen.has(normalized.toLowerCase())) {
      continue
    }
    seen.add(normalized.toLowerCase())
    keys.push(normalized)
  }
  return keys.sort((left, right) => left.localeCompare(right))
}

/**
 * Three-pane authoring editor for `Data/Buildings`.
 *
 * Left picks the building — from this patch or from the vanilla build menu,
 * layered by upgrade chain; centre is the schema-driven form covering
 * construction, skins, placement, the upgrade chain, the interior map and the
 * texture; right assembles the sprite the entry describes, overlays the
 * footprint it claims, and lists every validation issue.
 */
export const BuildingDataPatchEditor: EditorComponent = ({ patch, draftPort, resources: environment }) => {
  const { draft } = draftPort
  const { gameRootPath, directoryInfo, locale } = environment
  const copy = useBuildingDataEditorCopy()
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const requestedBuildingKey = useBuildingAuthoringHandoff((state) => state.pendingBuildingKey)
  const consumePendingBuildingKey = useBuildingAuthoringHandoff((state) => state.consumePending)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState<BuildingSourceMode>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  const [gsqRequest, setGsqRequest] = useState<GsqBuilderRequest | null>(null)
  const deferredSearch = useDeferredValue(search)
  const vanilla = useVanillaBuildingIndex(gameRootPath, directoryInfo, locale)
  const vanillaEntries = Array.from(vanilla.entries.values())
  const referenceData = useBuildingAuthoringResources({
    gameRootPath,
    directoryInfo,
    locale,
    patches: draft.patches,
    vanillaTextureNames: vanillaEntries.map((entry) => entry.textureAssetName).filter((name): name is string => Boolean(name)),
  })

  useEffect(() => {
    setSelectedId(null)
    setAddOpen(false)
    setRemoveCandidate(null)
    setGsqRequest(null)
  }, [patch.id])

  // The codex page hands over a building key when the author picks "open in
  // building authoring"; consuming it here keeps a later remount from
  // re-selecting a building the author has since moved away from.
  useEffect(() => {
    if (requestedBuildingKey === null) {
      return
    }
    const pending = consumePendingBuildingKey()
    if (pending !== null) {
      setSelectedId(pending)
      setSourceMode('all')
    }
  }, [requestedBuildingKey, consumePendingBuildingKey])

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(BUILDING_DATA_ASSET_ID)
  const activeId = selectedId !== null && entryIds.includes(selectedId) ? selectedId : (entryIds[0] ?? null)
  const activeDraft = activeId !== null ? draftPort.read(BUILDING_DATA_ASSET_ID, activeId) : null

  const issues = validateBuildingEntries(entries, {
    knownItemIds: referenceData.itemIds,
    knownBuildingKeys: vanillaEntries.map((entry) => entry.key),
    knownMapAssets: referenceData.mapAssetNames,
  })
  const resources: AssetResources = {
    npcs: [],
    items: referenceData.itemIds,
    locations: referenceData.locationNames,
    textures: referenceData.textureAssetNames,
    maps: referenceData.mapAssetNames,
    buildings: sortedBuildingKeys(
      entryIds,
      vanillaEntries.map((entry) => entry.key),
    ),
    // A material id or a chain stage is unpickable as a bare string, so each
    // reference kind gets the browsable catalog the picker dialog renders.
    options: {
      item: buildMaterialOptions(referenceData.materials, referenceData.objectSheet),
      building: buildBuildingRefOptions({
        vanillaEntries,
        projectKeys: entryIds,
        projectCategory: copy.pickers.projectBuildings,
        stageDetail: copy.pickers.buildingStageDetail,
      }),
      map: buildIndoorMapOptions({
        assetNames: referenceData.mapAssetNames,
        mapAssets: referenceData.mapAssets,
        projectCategory: copy.pickers.projectMaps,
        vanillaCategory: copy.pickers.vanillaMaps,
      }),
      texture: buildTextureRefOptions(referenceData.textureAssetNames, copy.pickers.textureRoot),
    },
    gameRootPath,
    locale,
  }
  const groups = buildBuildingSourceGroups({
    projectKeys: entryIds,
    projectEntries: entries,
    vanilla,
    mode: sourceMode,
    search: deferredSearch,
    ungroupedLabel: copy.sources.ungroupedLabel,
  })
  const previewBuilding = buildPreviewEntry(activeId, activeId === null ? null : entries[activeId], vanilla)
  const texturePatchState =
    previewBuilding === null
      ? null
      : findBuildingTexturePatchState(draft.patches, previewBuilding.textureAssetName ?? '', draft.virtualAssets)

  /** Opens the image patch providing the entry's texture, creating the Load patch on first use. */
  function handleOpenTextureEditor() {
    if (texturePatchState === null || texturePatchState.assetTarget.trim() === '') {
      return
    }
    const wanted = texturePatchState.assetTarget.trim().replaceAll('\\', '/').toLowerCase()
    const existing = draft.patches.find(
      (candidate) =>
        (candidate.action === 'Load' || candidate.action === 'EditImage') &&
        candidate.target.trim().replaceAll('\\', '/').toLowerCase() === wanted,
    )
    const patchId = existing?.id ?? draftPort.addPatch('Load', texturePatchState.assetTarget)
    if (patchId != null && draftPort.openPatch !== null) {
      draftPort.openPatch(patchId)
    }
  }

  function handleDraftChange(next: AssetEntryDraft) {
    if (activeId === null) {
      return
    }
    draftPort.stage(BUILDING_DATA_ASSET_ID, activeId, next)
  }

  function handleCreate(buildingId: string, footprint: BuildingFootprint) {
    const result = addBuildingEntry(entries, buildingId, footprint)
    if (!result.ok) {
      // The dialog validates before calling; reaching this branch means the
      // draft changed underneath, so keep the dialog open with its own error.
      return
    }
    draftPort.stage(BUILDING_DATA_ASSET_ID, result.buildingId, parseAssetEntry(BUILDING_DATA_SCHEMA, result.entries[result.buildingId]))
    setSelectedId(result.buildingId)
    setAddOpen(false)
  }

  /** Selecting a vanilla-only row seeds an override from the untouched record. */
  function handleSelectSource(row: BuildingSourceRow) {
    if (row.inProject) {
      setSelectedId(row.key)
      return
    }
    const record = vanilla.records[row.key]
    draftPort.stage(BUILDING_DATA_ASSET_ID, row.key, parseAssetEntry(BUILDING_DATA_SCHEMA, record ?? {}))
    setSelectedId(row.key)
  }

  function handleRemoveConfirmed() {
    if (removeCandidate === null) {
      return
    }
    draftPort.stage(BUILDING_DATA_ASSET_ID, removeCandidate, null)
    if (selectedId === removeCandidate) {
      setSelectedId(null)
    }
    setRemoveCandidate(null)
  }

  /** Merges a visually picked value into one field of the staged entry. */
  function stageField(field: string, value: Record<string, number>) {
    if (activeId === null || activeDraft === null) {
      return
    }
    const current = activeDraft.fields[field]
    const next = isPlainObject(current) ? { ...current, ...value } : value
    draftPort.stage(BUILDING_DATA_ASSET_ID, activeId, { ...activeDraft, fields: { ...activeDraft.fields, [field]: next } })
  }

  /** Writes a tile picked on the footprint grid back into the staged entry. */
  function handlePickTile(target: FootprintTilePickTarget, tile: { X: number; Y: number }) {
    stageField(target, { X: tile.X, Y: tile.Y })
  }

  /** Writes a tile rectangle picked on the footprint grid, e.g. the animal door. */
  function handlePickRect(target: FootprintRectPickTarget, rect: FootprintRect) {
    stageField(target, { X: rect.X, Y: rect.Y, Width: rect.Width, Height: rect.Height })
  }

  /** Writes the region picked over the building sheet into `SourceRect`. */
  function handleApplySourceRect(rect: FootprintRect) {
    stageField('SourceRect', { X: rect.X, Y: rect.Y, Width: rect.Width, Height: rect.Height })
  }

  /**
   * Jumping to another chain stage from the preview strip.
   *
   * A vanilla stage the patch has not touched yet is seeded the same way the
   * source pane seeds an override, so the chain stays walkable end to end.
   */
  function handleSelectStage(key: string) {
    if (entryIds.includes(key)) {
      setSelectedId(key)
      return
    }
    const record = vanilla.records[key] ?? vanilla.entries.get(key.toLowerCase())?.rawEntry
    draftPort.stage(BUILDING_DATA_ASSET_ID, key, parseAssetEntry(BUILDING_DATA_SCHEMA, record ?? {}))
    setSelectedId(key)
  }

  const chainStages = buildUpgradeChainStages({ activeKey: activeId, projectKeys: entryIds, projectEntries: entries, vanilla })
  const entryKey = activeId !== null ? `${patch.id}:${activeId}` : patch.id

  return (
    <div className="asset-editor">
      <header className="asset-editor-header">
        <div>
          <div className="asset-editor-title">{copy.title}</div>
          <div className="asset-editor-subtitle">{copy.subtitle}</div>
        </div>
        <div className="asset-editor-subtitle">{patch.target}</div>
      </header>

      <div className="asset-editor-body">
        <BuildingSourcePane
          groups={groups}
          mode={sourceMode}
          search={search}
          activeKey={activeId}
          vanillaLoading={vanilla.loading}
          vanillaAvailable={vanilla.available}
          onModeChange={setSourceMode}
          onSearchChange={setSearch}
          onSelect={handleSelectSource}
          onAddEntry={() => setAddOpen(true)}
        />

        <div className="asset-editor-scroll custom-scrollbar">
          {entryIds.length === 0 ? (
            <div className="asset-editor-empty">
              <Building2 className="asset-editor-empty-icon" aria-hidden="true" />
              <div className="asset-editor-empty-title">{copy.emptyTitle}</div>
              <div className="asset-editor-empty-hint">{copy.emptyHint}</div>
              <button type="button" className="control-button control-button-primary" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                <span>{copy.addEntryAction}</span>
              </button>
            </div>
          ) : (
            <div className="asset-editor-main">
              <section className="asset-editor-card">
                <div className="asset-editor-entries">
                  <div className="asset-editor-entries-head">
                    <span className="asset-field-label">{copy.entries.label}</span>
                    <span className="asset-editor-entries-count">{copy.entries.count(entryIds.length)}</span>
                  </div>
                  <div className="asset-editor-entry-chips">
                    <span className="asset-editor-entry-chip is-active">{activeId ?? ''}</span>
                    {activeId !== null ? (
                      <button
                        type="button"
                        className="control-button asset-editor-remove-entry"
                        onClick={() => setRemoveCandidate(activeId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{copy.removeEntryAction}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              {activeDraft !== null ? (
                <AssetEntryCanvas
                  key={entryKey}
                  schema={BUILDING_DATA_SCHEMA}
                  draft={activeDraft}
                  onDraftChange={handleDraftChange}
                  resources={resources}
                  onOpenGsqBuilder={setGsqRequest}
                />
              ) : null}
            </div>
          )}
        </div>

        <BuildingPreviewPane
          building={previewBuilding}
          draft={activeDraft}
          issues={issues}
          texturePatchState={texturePatchState}
          chainStages={chainStages}
          gameRootPath={gameRootPath}
          locale={locale}
          onPickTile={handlePickTile}
          onPickRect={handlePickRect}
          onApplySourceRect={handleApplySourceRect}
          onSelectStage={handleSelectStage}
          onOpenTextureEditor={handleOpenTextureEditor}
          onSelectIssue={(issue) => {
            const target = issue.path[0]
            if (typeof target === 'string') {
              setSelectedId(target)
            }
          }}
        />
      </div>

      <AddBuildingDialog
        open={addOpen}
        existingIds={entryIds}
        projectUniqueId={draft.projectMetadata.projectUniqueId}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
      <RemoveEntryDialog buildingId={removeCandidate} onClose={() => setRemoveCandidate(null)} onConfirm={handleRemoveConfirmed} />
      {gsqRequest !== null ? (
        <EventGameStateQueryBuilderModal
          copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
          hubCopy={hubCopy}
          initialQuery={gsqRequest.initialQuery || undefined}
          onApply={(result) => {
            gsqRequest.apply(result.query)
            setGsqRequest(null)
          }}
          onCancel={() => setGsqRequest(null)}
        />
      ) : null}
    </div>
  )
}
