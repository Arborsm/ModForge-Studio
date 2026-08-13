import { useEffect, useId, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, Building2, CheckCircle2, CircleDashed, Trash2 } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import { renderAssetResourcePicker } from '@features/resource-browser'
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
  BUILDING_DATA_ASSET_ID,
  BUILDING_DATA_SCHEMA,
  findBuildingTexturePatchState,
  useBuildingAuthoringHandoff,
  validateBuildingEntries,
} from '@entities/building'
import { useBuildingDataEditorCopy, useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { useEditModeStore } from '../../../model/editModeStore'
import { buildPreviewEntry, buildUpgradeChainStages, useVanillaBuildingIndex } from '../state/useBuildingAuthoringSources'
import { BuildingPreviewPane, type BuildingAuthoringToolRequest } from '../ui/BuildingPreviewPane'
import { BuildingGroupTools } from '../ui/BuildingGroupTools'
import type { FootprintPickTarget, FootprintRect, FootprintRectPickTarget, FootprintTilePickTarget } from '../ui/BuildingFootprintOverlay'
import { useBuildingAuthoringResources } from '../state/useBuildingAuthoringResources'
import {
  buildBuildingRefOptions,
  buildIndoorMapOptions,
  buildMaterialOptions,
  buildTextureRefOptions,
  findMapAssetByName,
} from '../state/buildingPickerOptions'
import {
  evaluateBuildingReadiness,
  type BuildingReadiness,
  type BuildingReadinessStepId,
  type BuildingReadinessStepStatus,
} from '../state/buildingReadiness'

const BUILDING_VISUAL_FIELD_KEYS = [
  'Size',
  'AdditionalPlacementTiles',
  'HumanDoor',
  'AnimalDoor',
  'UpgradeSignTile',
  'IndoorMap',
  'SourceRect',
  'SeasonOffset',
  'DrawOffset',
  'BuildMenuDrawOffset',
] as const

const BUILDING_TECHNICAL_FIELD_KEYS = [
  'NameForGeneralType',
  'MagicalConstruction',
  'DefaultAction',
  'BuildCondition',
  'AddMailOnBuild',
  'CollisionMap',
  'AdditionalTilePropertyRadius',
  'ActionTiles',
  'TileProperties',
  'AnimalDoorOpenDuration',
  'AnimalDoorOpenSound',
  'AnimalDoorCloseDuration',
  'AnimalDoorCloseSound',
  'UpgradeSignHeight',
  'IndoorMapType',
  'NonInstancedIndoorLocation',
  'IndoorItems',
  'IndoorItemMoves',
  'Chests',
  'SortTileOffset',
  'DrawLayers',
  'ItemConversions',
  'Metadata',
  'ModData',
  'CustomFields',
] as const

const BUILDING_BEGINNER_HIDDEN_FIELD_KEYS = [...BUILDING_VISUAL_FIELD_KEYS, ...BUILDING_TECHNICAL_FIELD_KEYS]

const TAB_READINESS_STEPS: Readonly<Record<string, readonly BuildingReadinessStepId[]>> = {
  basics: ['identity'],
  texture: ['artwork'],
  construction: ['construction', 'cost'],
  placement: ['placement'],
  indoor: ['interior'],
  upgrade: ['upgrade'],
}

function BuildingTabReadiness({ groupId, readiness }: { groupId: string; readiness: BuildingReadiness }) {
  const copy = useBuildingDataEditorCopy()
  const steps = TAB_READINESS_STEPS[groupId]
  if (steps === undefined) return null
  const statuses = steps.flatMap((id) => readiness.steps.find((step) => step.id === id)?.status ?? [])
  const status: BuildingReadinessStepStatus = statuses.includes('needs-attention')
    ? 'needs-attention'
    : statuses.every((value) => value === 'complete')
      ? 'complete'
      : 'optional'
  const Icon = status === 'complete' ? CheckCircle2 : status === 'needs-attention' ? AlertCircle : CircleDashed
  return (
    <span className={`building-tab-readiness is-${status}`} title={copy.workflow.status[status]}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{copy.workflow.status[status]}</span>
    </span>
  )
}

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
  const { gameRootPath, directoryInfo, locale, theme, accentColor } = environment
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const navigateToPatch = useEditModeStore((state) => state.navigateToPatch)
  const copy = useBuildingDataEditorCopy()
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const requestedBuildingKey = useBuildingAuthoringHandoff((state) => state.pendingBuildingKey)
  const consumePendingBuildingKey = useBuildingAuthoringHandoff((state) => state.consumePending)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  const [gsqRequest, setGsqRequest] = useState<GsqBuilderRequest | null>(null)
  const [toolRequest, setToolRequest] = useState<BuildingAuthoringToolRequest | null>(null)
  const [pickTarget, setPickTarget] = useState<FootprintPickTarget | null>(null)
  const [activeGroupId, setActiveGroupId] = useState('basics')
  const vanilla = useVanillaBuildingIndex(gameRootPath, directoryInfo, locale)
  const vanillaEntries = Array.from(vanilla.entries.values())
  const referenceData = useBuildingAuthoringResources({
    gameRootPath,
    directoryInfo,
    locale,
    patches: draft.patches,
    virtualAssets: draft.virtualAssets,
    vanillaTextureNames: vanillaEntries.map((entry) => entry.textureAssetName).filter((name): name is string => Boolean(name)),
  })

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
    }
  }, [requestedBuildingKey, consumePendingBuildingKey])

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(BUILDING_DATA_ASSET_ID)
  const activeId = selectedId !== null && entryIds.includes(selectedId) ? selectedId : null
  const activeDraft = activeId !== null ? draftPort.read(BUILDING_DATA_ASSET_ID, activeId) : null

  const issues = validateBuildingEntries(entries, {
    knownItemIds: referenceData.itemIds,
    knownBuildingKeys: vanillaEntries.map((entry) => entry.key),
    knownMapAssets: referenceData.mapAssetNames,
  })
  const indoorMapOptions = buildIndoorMapOptions({
    assetNames: referenceData.mapAssetNames,
    mapAssets: referenceData.mapAssets,
    projectCategory: copy.pickers.projectMaps,
    vanillaCategory: copy.pickers.vanillaMaps,
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
      item: buildMaterialOptions(referenceData.materials, referenceData.itemTextureStates),
      building: buildBuildingRefOptions({
        vanillaEntries,
        projectKeys: entryIds,
        projectCategory: copy.pickers.projectBuildings,
        stageDetail: copy.pickers.buildingStageDetail,
      }),
      map: indoorMapOptions,
      texture: buildTextureRefOptions(
        referenceData.textureAssetNames,
        copy.pickers.textureRoot,
        referenceData.texturePreviews,
        referenceData.projectTextureAssetNames,
      ),
    },
    gameRootPath,
    locale,
  }
  const previewBuilding = buildPreviewEntry(activeId, activeId === null ? null : entries[activeId], vanilla)
  const texturePatchState =
    previewBuilding === null
      ? null
      : findBuildingTexturePatchState(draft.patches, previewBuilding.textureAssetName ?? '', draft.virtualAssets)
  const activeErrorCount = activeId === null ? 0 : issues.filter((issue) => issue.severity === 'error' && issue.path[0] === activeId).length
  const activeTextureName =
    typeof activeDraft?.fields['Texture'] === 'string' ? activeDraft.fields['Texture'].replaceAll('\\', '/').toLowerCase() : ''
  const readiness =
    activeDraft === null
      ? null
      : evaluateBuildingReadiness(activeDraft, {
          textureAvailable: Boolean(referenceData.texturePreviews[activeTextureName]) || texturePatchState?.fileInDraft === true,
          errorCount: activeErrorCount,
        })

  function requestVisualTool(tool: BuildingAuthoringToolRequest['tool']) {
    setToolRequest((current) => ({ id: (current?.id ?? 0) + 1, tool }))
  }

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
    draftPort.stage(BUILDING_DATA_ASSET_ID, activeId, {
      ...activeDraft,
      fields: { ...activeDraft.fields, [field]: next },
    })
  }

  /** Replaces or clears one visually authored field without disturbing siblings. */
  function stageValue(field: string, value: unknown) {
    if (activeId === null || activeDraft === null) {
      return
    }
    const fields = { ...activeDraft.fields }
    if (value === undefined) {
      delete fields[field]
    } else {
      fields[field] = value
    }
    draftPort.stage(BUILDING_DATA_ASSET_ID, activeId, {
      ...activeDraft,
      fields,
    })
  }

  /** Writes a tile picked on the footprint grid back into the staged entry. */
  function handlePickTile(target: FootprintTilePickTarget, tile: { X: number; Y: number }) {
    stageField(target, { X: tile.X, Y: tile.Y })
    setPickTarget(null)
  }

  /** Writes a tile rectangle picked on the footprint grid, e.g. the animal door. */
  function handlePickRect(target: FootprintRectPickTarget, rect: FootprintRect) {
    stageField(target, {
      X: rect.X,
      Y: rect.Y,
      Width: rect.Width,
      Height: rect.Height,
    })
    setPickTarget(null)
  }

  /** Writes the region picked over the building sheet into `SourceRect`. */
  function handleApplySourceRect(rect: FootprintRect) {
    stageField('SourceRect', {
      X: rect.X,
      Y: rect.Y,
      Width: rect.Width,
      Height: rect.Height,
    })
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

  const chainStages = buildUpgradeChainStages({
    activeKey: activeId,
    projectKeys: entryIds,
    projectEntries: entries,
    vanilla,
  })
  const activeIssues = activeId === null ? [] : issues.filter((issue) => issue.path[0] === activeId)
  const entryKey = activeId !== null ? `${patch.id}:${activeId}` : patch.id

  return (
    <div className="asset-editor building-data-editor">
      {activeId === null ? (
        <div className="building-editor-empty">
          <Building2 className="h-8 w-8" aria-hidden="true" />
          <p>{copy.sources.projectEmpty}</p>
        </div>
      ) : (
        <div className="building-editor-detail">
          <div className="asset-editor-scroll building-editor-center">
            <div className="asset-editor-main building-editor-main">
              <section className="building-editor-entry-toolbar">
                <div className="building-editor-entry-identity">
                  <button
                    type="button"
                    className="icon-button h-8 w-8"
                    title={copy.sources.backToLibrary}
                    aria-label={copy.sources.backToLibrary}
                    onClick={() => navigateToPatch(null)}
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <strong className="building-editor-entry-name">{activeId}</strong>
                  <span className="asset-editor-entries-count">{copy.entries.count(entryIds.length)}</span>
                </div>
                <button type="button" className="control-button asset-editor-remove-entry" onClick={() => setRemoveCandidate(activeId)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{copy.removeEntryAction}</span>
                </button>
              </section>

              {activeDraft !== null ? (
                <AssetEntryCanvas
                  key={entryKey}
                  schema={BUILDING_DATA_SCHEMA}
                  draft={activeDraft}
                  onDraftChange={handleDraftChange}
                  resources={resources}
                  renderResourcePicker={renderAssetResourcePicker}
                  onOpenGsqBuilder={setGsqRequest}
                  hiddenFieldKeys={expertMode ? [] : BUILDING_BEGINNER_HIDDEN_FIELD_KEYS}
                  groupPresentation="tabs"
                  activeGroupId={activeGroupId}
                  onActiveGroupChange={setActiveGroupId}
                  renderGroupTabLead={(groupId) =>
                    readiness === null ? null : <BuildingTabReadiness groupId={groupId} readiness={readiness} />
                  }
                  renderGroupLead={(groupId) => (
                    <BuildingGroupTools
                      groupId={groupId}
                      draft={activeDraft}
                      issues={activeIssues}
                      texturePatchState={texturePatchState}
                      chainStages={chainStages}
                      indoorMapOptions={indoorMapOptions}
                      pickTarget={pickTarget}
                      onPickTargetChange={setPickTarget}
                      onOpenFootprint={() => requestVisualTool('footprint')}
                      onOpenSourceRect={() => requestVisualTool('source-rect')}
                      onOpenTextureEditor={handleOpenTextureEditor}
                      onApplyIndoorMap={(value) => stageValue('IndoorMap', value)}
                      onSelectStage={handleSelectStage}
                      onSelectIssue={(issue) => {
                        const target = issue.path[0]
                        if (typeof target === 'string') setSelectedId(target)
                      }}
                    />
                  )}
                />
              ) : null}
            </div>
          </div>

          <BuildingPreviewPane
            building={previewBuilding}
            draft={activeDraft}
            gameRootPath={gameRootPath}
            locale={locale}
            theme={theme}
            accentColor={accentColor}
            farmAsset={findMapAssetByName('Maps/Farm', referenceData.mapAssets)}
            pickTarget={pickTarget}
            onPickTile={handlePickTile}
            onPickRect={handlePickRect}
            onApplySourceRect={handleApplySourceRect}
            onApplyFootprint={({ width, height }) => stageField('Size', { X: width, Y: height })}
            toolRequest={toolRequest}
          />
        </div>
      )}

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
