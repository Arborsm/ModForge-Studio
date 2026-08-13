import { useEffect, useId, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Package, Trash2 } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import { renderAssetResourcePicker, toItemResourceBrowserOptions } from '@features/resource-browser'
import {
  AssetEntryCanvas,
  findTexturePatchState,
  parseAssetEditorState,
  parseAssetEntry,
  type AssetEntryDraft,
  type AssetIssue,
  type AssetResources,
  type GsqBuilderRequest,
} from '@entities/asset-schema'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import { OBJECT_DATA_ASSET_ID, OBJECT_DATA_SCHEMA, useItemAuthoringHandoff, validateObjectEntries } from '@entities/item'
import { useEditorCopy, useItemDataEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { useEditModeStore } from '../../../model/editModeStore'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useItemAuthoringResources } from '../state/useItemAuthoringResources'
import { buildPreviewItem, useVanillaObjectIndex } from '../state/useItemAuthoringSources'
import { evaluateItemReadiness, type ItemReadiness, type ItemReadinessStatus } from '../state/itemReadiness'
import { buildItemTextureTarget, needsProjectItemTexture } from '../state/itemTextureTarget'
import { useItemTexture } from '../state/useItemTexture'
import { ItemGroupTools } from '../ui/ItemGroupTools'
import { ItemPreviewPane } from '../ui/ItemPreviewPane'

const ITEM_TECHNICAL_FIELD_KEYS = ['ArtifactSpotChances', 'CustomFields'] as const

function issueGroup(issue: AssetIssue): string {
  const fieldKey = issue.path[1]
  if (typeof fieldKey !== 'string') return 'basics'
  return OBJECT_DATA_SCHEMA.fields.find((field) => field.key === fieldKey)?.group ?? 'basics'
}

function ItemTabReadiness({ groupId, readiness }: { groupId: string; readiness: ItemReadiness }) {
  const copy = useItemDataEditorCopy()
  const status: ItemReadinessStatus = readiness.groups[groupId] ?? 'optional'
  const Icon = status === 'complete' ? CheckCircle2 : status === 'needs-attention' ? AlertCircle : CircleDashed
  return (
    <span className={`item-tab-readiness is-${status}`} title={copy.workflow.status[status]}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{copy.workflow.status[status]}</span>
    </span>
  )
}

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

/** Two-level item library and focused `Data/Objects` editor. */
export const ItemObjectPatchEditor: EditorComponent = ({ patch, draftPort, resources: environment }) => {
  const { draft } = draftPort
  const { gameRootPath, directoryInfo, locale } = environment
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const navigateToPatch = useEditModeStore((state) => state.navigateToPatch)
  const copy = useItemDataEditorCopy()
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const pendingEntry = useItemAuthoringHandoff((state) => state.pendingEntry)
  const consumePendingEntry = useItemAuthoringHandoff((state) => state.consumePendingEntry)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  const [gsqRequest, setGsqRequest] = useState<GsqBuilderRequest | null>(null)
  const [activeGroupId, setActiveGroupId] = useState('basics')
  const vanilla = useVanillaObjectIndex(gameRootPath, directoryInfo, locale)
  const referenceData = useItemAuthoringResources({
    gameRootPath,
    directoryInfo,
    locale,
    patches: draft.patches,
  })
  const itemOptions = useMemo(
    () => toItemResourceBrowserOptions(referenceData.items, referenceData.itemTextureStates, 'item-authoring'),
    [referenceData.itemTextureStates, referenceData.items],
  )

  useEffect(() => {
    setSelectedId(null)
    setRemoveCandidate(null)
    setGsqRequest(null)
    setActiveGroupId('basics')
  }, [patch.id])

  // The catalog page sets `selectedEntryKey` before opening this patch; adopt
  // it as the initial selection so the editor lands on the picked entry.
  useEffect(() => {
    if (draftPort.selectedEntryKey !== null) {
      setSelectedId(draftPort.selectedEntryKey)
    }
  }, [draftPort.selectedEntryKey])

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(OBJECT_DATA_ASSET_ID)

  useEffect(() => {
    if (pendingEntry === null) return
    const target = consumePendingEntry()
    if (target?.itemId == null) return
    const itemId = target.itemId
    const known = entryIds.find((id) => id.toLowerCase() === itemId.toLowerCase())
    if (known === undefined) {
      draftPort.stage(OBJECT_DATA_ASSET_ID, itemId, parseAssetEntry(OBJECT_DATA_SCHEMA, vanilla.records[itemId] ?? {}))
    }
    setSelectedId(known ?? itemId)
    setActiveGroupId('basics')
  }, [consumePendingEntry, draftPort, entryIds, pendingEntry, vanilla.records])

  const activeId = selectedId !== null && entryIds.includes(selectedId) ? selectedId : null
  const activeDraft = activeId !== null ? draftPort.read(OBJECT_DATA_ASSET_ID, activeId) : null
  const issues = validateObjectEntries(entries, {
    knownTextureAssets: referenceData.textureAssetNames,
  })
  const activeIssues = activeId === null ? [] : issues.filter((issue) => issue.path[0] === activeId)
  const resources: AssetResources = {
    npcs: [],
    items: referenceData.itemIds,
    locations: referenceData.locationNames,
    textures: referenceData.textureAssetNames,
    maps: [],
    buildings: [],
    options: { item: itemOptions },
    gameRootPath,
    locale,
  }
  const previewItem = buildPreviewItem(activeId, activeId === null ? null : entries[activeId], vanilla)
  const texturePatchState =
    previewItem === null ? null : findTexturePatchState(draft.patches, previewItem.textureAssetName ?? '', draft.virtualAssets)
  const previewTextureKey = previewItem?.textureAssetName?.replaceAll('\\', '/').toLowerCase() ?? ''
  const cachedTextureState = referenceData.itemTextureStates[previewTextureKey] ?? null
  const loadedTextureState = useItemTexture(cachedTextureState ? null : (previewItem?.textureAssetName ?? null), gameRootPath, locale)
  const textureState = cachedTextureState ?? loadedTextureState
  const readiness =
    activeDraft === null
      ? null
      : evaluateItemReadiness(activeDraft, {
          issueGroups: activeIssues.map(issueGroup),
        })
  const entryKey = activeId !== null ? `${patch.id}:${activeId}` : patch.id

  function handleOpenTextureEditor() {
    if (activeId === null || activeDraft === null) return
    const currentTarget = texturePatchState?.assetTarget ?? ''
    const assetTarget = needsProjectItemTexture(currentTarget)
      ? buildItemTextureTarget(draft.projectMetadata.projectUniqueId, activeId)
      : currentTarget.trim().replaceAll('\\', '/')
    if (assetTarget === '') return

    if (assetTarget !== currentTarget) {
      draftPort.stage(
        OBJECT_DATA_ASSET_ID,
        activeId,
        parseAssetEntry(OBJECT_DATA_SCHEMA, {
          ...activeDraft.unknown,
          ...activeDraft.fields,
          Texture: assetTarget,
        }),
      )
    }

    const wanted = assetTarget.toLowerCase()
    const existing = draft.patches.find(
      (candidate) =>
        (candidate.action === 'Load' || candidate.action === 'EditImage') &&
        candidate.target.trim().replaceAll('\\', '/').toLowerCase() === wanted,
    )
    const patchId = existing?.id ?? draftPort.addPatch('Load', assetTarget)
    if (patchId != null && draftPort.openPatch !== null) draftPort.openPatch(patchId)
  }

  function handleDraftChange(next: AssetEntryDraft) {
    if (activeId !== null) draftPort.stage(OBJECT_DATA_ASSET_ID, activeId, next)
  }

  function handleRemoveConfirmed() {
    if (removeCandidate === null) return
    draftPort.stage(OBJECT_DATA_ASSET_ID, removeCandidate, null)
    if (selectedId === removeCandidate) setSelectedId(null)
    setRemoveCandidate(null)
  }

  function handleSelectIssue(issue: AssetIssue) {
    const target = issue.path[0]
    if (typeof target === 'string' && entryIds.includes(target)) setSelectedId(target)
    setActiveGroupId(issueGroup(issue))
  }

  return (
    <div className="asset-editor item-data-editor">
      {activeId === null ? (
        <div className="item-editor-empty">
          <Package className="h-8 w-8" aria-hidden="true" />
          <p>{copy.sources.projectEmpty}</p>
        </div>
      ) : (
        <div className="item-editor-detail">
          <div className="asset-editor-scroll item-editor-center">
            <div className="asset-editor-main item-editor-main">
              <section className="item-editor-entry-toolbar">
                <div className="item-editor-entry-identity">
                  <button
                    type="button"
                    className="icon-button h-8 w-8"
                    title={copy.sources.backToLibrary}
                    aria-label={copy.sources.backToLibrary}
                    onClick={() => navigateToPatch(null)}
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <strong className="item-editor-entry-name">{activeId}</strong>
                  <span className="asset-editor-entries-count">{copy.entries.count(entryIds.length)}</span>
                </div>
                <button type="button" className="control-button asset-editor-remove-entry" onClick={() => setRemoveCandidate(activeId)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{copy.removeEntryAction}</span>
                </button>
              </section>

              {activeDraft !== null ? (
                <AssetEntryCanvas
                  key={entryKey}
                  schema={OBJECT_DATA_SCHEMA}
                  draft={activeDraft}
                  onDraftChange={handleDraftChange}
                  resources={resources}
                  renderResourcePicker={renderAssetResourcePicker}
                  onOpenGsqBuilder={setGsqRequest}
                  hiddenFieldKeys={expertMode ? [] : ITEM_TECHNICAL_FIELD_KEYS}
                  groupPresentation="tabs"
                  activeGroupId={activeGroupId}
                  onActiveGroupChange={setActiveGroupId}
                  renderGroupTabLead={(groupId) => (readiness ? <ItemTabReadiness groupId={groupId} readiness={readiness} /> : null)}
                  renderGroupLead={(groupId) => (
                    <ItemGroupTools
                      groupId={groupId}
                      issues={activeIssues}
                      texturePatchState={texturePatchState}
                      textureResolved={textureState.url !== null}
                      onOpenTextureEditor={handleOpenTextureEditor}
                      onSelectIssue={handleSelectIssue}
                    />
                  )}
                />
              ) : null}
            </div>
          </div>

          <ItemPreviewPane item={previewItem} draft={activeDraft} textureState={textureState} />
        </div>
      )}

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
