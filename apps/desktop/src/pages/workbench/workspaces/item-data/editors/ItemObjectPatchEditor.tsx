import { useDeferredValue, useEffect, useId, useState } from 'react'
import { AlertTriangle, Package, Plus, Trash2 } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import {
  AssetEntryCanvas,
  findTexturePatchState,
  parseAssetEditorState,
  parseAssetEntry,
  type AssetEntryDraft,
  type AssetResources,
  type GsqBuilderRequest,
} from '@entities/asset-schema'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import {
  addObjectEntry,
  OBJECT_DATA_ASSET_ID,
  OBJECT_DATA_SCHEMA,
  resolveItemFamilyTarget,
  useItemAuthoringHandoff,
  validateObjectEntries,
  type ItemAssetFamily,
  type ObjectEntrySeed,
} from '@entities/item'
import { useEditorCopy, useItemDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useItemAuthoringResources } from '../state/useItemAuthoringResources'
import {
  buildItemSourceGroups,
  buildPreviewItem,
  useVanillaObjectIndex,
  type ItemSourceMode,
  type ItemSourceRow,
} from '../state/useItemAuthoringSources'
import { AddObjectDialog } from '../ui/AddObjectDialog'
import { ItemPreviewPane } from '../ui/ItemPreviewPane'
import { ItemSourcePane } from '../ui/ItemSourcePane'

function RemoveEntryDialog({ objectId, onClose, onConfirm }: { objectId: string | null; onClose: () => void; onConfirm: () => void }) {
  const copy = useItemDataEditorCopy()
  const titleId = useId()
  return (
    <Dialog open={objectId !== null} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        id={titleId}
        title={copy.entries.removeConfirmTitle}
        tone="danger"
        icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.entries.closeLabel}
      />
      <DialogBody>
        <p className="asset-editor-remove-message">{objectId !== null ? copy.entries.removeConfirmMessage(objectId) : ''}</p>
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

/**
 * Three-pane authoring editor for `Data/Objects`.
 *
 * Left picks the asset family and the object — from this patch or from the ~800
 * vanilla objects, layered by `Type`; centre is the schema-driven form covering
 * basics, economy, food buffs, the sprite and geode drops; right assembles the
 * sprite the entry resolves to and lists every validation issue.
 *
 * Only `Data/Objects` has a structured form this round. The other item families
 * are still listed on the left and picking one routes to its raw JSON patch, so
 * the page never hides an asset it cannot yet model.
 */
export const ItemObjectPatchEditor: EditorComponent = ({ patch, draftPort, resources: environment }) => {
  const { draft } = draftPort
  const { gameRootPath, directoryInfo, locale } = environment
  const copy = useItemDataEditorCopy()
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const pendingEntry = useItemAuthoringHandoff((state) => state.pendingEntry)
  const consumePendingEntry = useItemAuthoringHandoff((state) => state.consumePendingEntry)
  const requestOpenFamily = useItemAuthoringHandoff((state) => state.requestOpen)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState<ItemSourceMode>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  const [gsqRequest, setGsqRequest] = useState<GsqBuilderRequest | null>(null)
  const deferredSearch = useDeferredValue(search)
  const vanilla = useVanillaObjectIndex(gameRootPath, directoryInfo, locale)
  const referenceData = useItemAuthoringResources({ gameRootPath, directoryInfo, locale, patches: draft.patches })

  useEffect(() => {
    setSelectedId(null)
    setAddOpen(false)
    setRemoveCandidate(null)
    setGsqRequest(null)
  }, [patch.id])

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(OBJECT_DATA_ASSET_ID)

  // The codex page hands over an object id once the workbench has opened this
  // patch; consuming it here keeps a later remount from re-selecting an item the
  // author has since moved away from.
  useEffect(() => {
    if (pendingEntry === null) {
      return
    }
    const target = consumePendingEntry()
    if (target?.itemId == null) {
      return
    }
    const itemId = target.itemId
    const known = entryIds.find((id) => id.toLowerCase() === itemId.toLowerCase())
    if (known === undefined) {
      // The codex can reach an object this patch does not touch yet, so the jump
      // seeds the override instead of landing on an empty selection.
      draftPort.stage(OBJECT_DATA_ASSET_ID, itemId, parseAssetEntry(OBJECT_DATA_SCHEMA, vanilla.records[itemId] ?? {}))
    }
    setSelectedId(known ?? itemId)
    setSourceMode('all')
  }, [pendingEntry, consumePendingEntry, entryIds, draftPort, vanilla.records])

  const activeId = selectedId !== null && entryIds.includes(selectedId) ? selectedId : (entryIds[0] ?? null)
  const activeDraft = activeId !== null ? draftPort.read(OBJECT_DATA_ASSET_ID, activeId) : null

  const issues = validateObjectEntries(entries, { knownTextureAssets: referenceData.textureAssetNames })
  const resources: AssetResources = {
    npcs: [],
    items: referenceData.itemIds,
    locations: referenceData.locationNames,
    textures: referenceData.textureAssetNames,
    maps: [],
    buildings: [],
    gameRootPath,
    locale,
  }
  const groups = buildItemSourceGroups({
    projectKeys: entryIds,
    projectEntries: entries,
    vanilla,
    mode: sourceMode,
    search: deferredSearch,
    ungroupedLabel: copy.sources.ungroupedLabel,
  })
  const previewItem = buildPreviewItem(activeId, activeId === null ? null : entries[activeId], vanilla)
  const texturePatchState =
    previewItem === null ? null : findTexturePatchState(draft.patches, previewItem.textureAssetName ?? '', draft.virtualAssets)

  /** Opens the image patch providing the entry's sheet, creating the Load patch on first use. */
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
    draftPort.stage(OBJECT_DATA_ASSET_ID, activeId, next)
  }

  function handleCreate(objectId: string, seed: ObjectEntrySeed) {
    const result = addObjectEntry(entries, objectId, seed)
    if (!result.ok) {
      // The dialog validates before calling; reaching this branch means the
      // draft changed underneath, so keep the dialog open with its own error.
      return
    }
    draftPort.stage(OBJECT_DATA_ASSET_ID, result.objectId, parseAssetEntry(OBJECT_DATA_SCHEMA, result.entries[result.objectId]))
    setSelectedId(result.objectId)
    setAddOpen(false)
  }

  /** Selecting a vanilla-only row seeds an override from the untouched record. */
  function handleSelectSource(row: ItemSourceRow) {
    if (row.inProject) {
      setSelectedId(row.key)
      return
    }
    draftPort.stage(OBJECT_DATA_ASSET_ID, row.key, parseAssetEntry(OBJECT_DATA_SCHEMA, vanilla.records[row.key] ?? {}))
    setSelectedId(row.key)
  }

  /**
   * Routing between item asset families is patch-level, so it goes through the
   * handoff store the module runtime drains — the editor cannot navigate itself.
   */
  function handleSelectFamily(family: ItemAssetFamily) {
    requestOpenFamily(resolveItemFamilyTarget(family.kind))
  }

  function handleRemoveConfirmed() {
    if (removeCandidate === null) {
      return
    }
    draftPort.stage(OBJECT_DATA_ASSET_ID, removeCandidate, null)
    if (selectedId === removeCandidate) {
      setSelectedId(null)
    }
    setRemoveCandidate(null)
  }

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
        <ItemSourcePane
          groups={groups}
          activeAssetId={patch.target}
          mode={sourceMode}
          search={search}
          activeKey={activeId}
          vanillaLoading={vanilla.loading}
          vanillaAvailable={vanilla.available}
          onSelectFamily={handleSelectFamily}
          onModeChange={setSourceMode}
          onSearchChange={setSearch}
          onSelect={handleSelectSource}
          onAddEntry={() => setAddOpen(true)}
        />

        <div className="asset-editor-scroll custom-scrollbar">
          {entryIds.length === 0 ? (
            <div className="asset-editor-empty">
              <Package className="asset-editor-empty-icon" aria-hidden="true" />
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
                  schema={OBJECT_DATA_SCHEMA}
                  draft={activeDraft}
                  onDraftChange={handleDraftChange}
                  resources={resources}
                  onOpenGsqBuilder={setGsqRequest}
                />
              ) : null}
            </div>
          )}
        </div>

        <ItemPreviewPane
          item={previewItem}
          draft={activeDraft}
          issues={issues}
          texturePatchState={texturePatchState}
          gameRootPath={gameRootPath}
          locale={locale}
          onOpenTextureEditor={handleOpenTextureEditor}
          onSelectIssue={(issue) => {
            const target = issue.path[0]
            if (typeof target === 'string') {
              setSelectedId(target)
            }
          }}
        />
      </div>

      <AddObjectDialog
        open={addOpen}
        existingIds={entryIds}
        textureSuggestions={referenceData.textureAssetNames}
        projectUniqueId={draft.projectMetadata.projectUniqueId}
        gameRootPath={gameRootPath}
        locale={locale}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
      <RemoveEntryDialog objectId={removeCandidate} onClose={() => setRemoveCandidate(null)} onConfirm={handleRemoveConfirmed} />
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
