import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Trash2 } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import { renderAssetResourcePicker, toItemResourceBrowserOptions } from '@features/resource-browser'
import {
  AssetEntryCanvas,
  parseAssetEditorState,
  parseAssetEntry,
  type AssetEntryDraft,
  type AssetIssue,
  type AssetResources,
  type GsqBuilderRequest,
} from '@entities/asset-schema'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import {
  addCharacterEntry,
  CHARACTER_DATA_ASSET_ID,
  CHARACTER_DATA_SCHEMA,
  findCharacterAssetPatchState,
  loadVanillaGiftTasteEntries,
  NPC_GIFT_TASTES_ASSET_ID,
  useCharacterAuthoringHandoff,
  validateCharacterEntries,
  validateGiftTasteEntries,
  type CharacterAssetPatchState,
  type CharacterHomePlacement,
} from '@entities/character'
import { useCharacterDataEditorCopy, useEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import {
  buildCharacterSourceGroups,
  buildPreviewEntry,
  useVanillaCharacterIndex,
  type CharacterSourceMode,
  type CharacterSourceRow,
} from '../state/useCharacterAuthoringSources'
import { useCharacterAuthoringResources } from '../state/useCharacterAuthoringResources'
import { evaluateCharacterReadiness, type CharacterReadiness, type CharacterReadinessStatus } from '../state/characterReadiness'
import { AddCharacterDialog } from '../ui/AddCharacterDialog'
import { CharacterCatalog } from '../ui/CharacterCatalog'
import { CharacterGiftTasteEditor } from '../ui/CharacterGiftTasteEditor'
import { CharacterGroupTools } from '../ui/CharacterGroupTools'
import { CharacterPreviewPane } from '../ui/CharacterPreviewPane'

const CHARACTER_TECHNICAL_FIELD_KEYS = [
  'CanGreetNearbyCharacters',
  'CanCommentOnPurchasedShopItems',
  'CanVisitIsland',
  'ItemDeliveryQuests',
  'PerfectionScore',
  'EndSlideShow',
  'FriendsAndFamily',
  'DumpsterDiveFriendshipEffect',
  'DumpsterDiveEmote',
  'Size',
  'BreathChestRect',
  'BreathChestPosition',
  'Shadow',
  'EmoteOffset',
  'ShakePortraits',
  'KissSpriteIndex',
  'KissSpriteFacingRight',
  'MugShotSourceRect',
  'HiddenProfileEmoteSound',
  'HiddenProfileEmoteDuration',
  'HiddenProfileEmoteStartFrame',
  'HiddenProfileEmoteFrameCount',
  'HiddenProfileEmoteFrameDuration',
  'Language',
  'IsDarkSkinned',
  'FormerCharacterNames',
  'FestivalVanillaActorIndex',
  'SpouseAdopts',
  'SpouseWantsChildren',
  'SpouseGiftJealousy',
  'SpouseGiftJealousyFriendshipChange',
  'SpouseRoom',
  'SpousePatio',
  'SpouseFloors',
  'SpouseWallpapers',
  'CustomFields',
] as const

function issueGroup(issue: AssetIssue): string {
  if (issue.code.startsWith('giftTaste')) return 'festival'
  const fieldKey = issue.path[1]
  if (typeof fieldKey !== 'string') return 'core'
  return CHARACTER_DATA_SCHEMA.fields.find((field) => field.key === fieldKey)?.group ?? 'core'
}

function CharacterTabReadiness({ groupId, readiness }: { groupId: string; readiness: CharacterReadiness }) {
  const copy = useCharacterDataEditorCopy()
  const status: CharacterReadinessStatus = readiness.groups[groupId] ?? 'optional'
  const Icon = status === 'complete' ? CheckCircle2 : status === 'needs-attention' ? AlertCircle : CircleDashed
  return (
    <span className={`character-tab-readiness is-${status}`} title={copy.workflow.status[status]}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{copy.workflow.status[status]}</span>
    </span>
  )
}

function RemoveEntryDialog({ npcId, onClose, onConfirm }: { npcId: string | null; onClose: () => void; onConfirm: () => void }) {
  const copy = useCharacterDataEditorCopy()
  const titleId = useId()
  return (
    <Dialog open={npcId !== null} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        id={titleId}
        title={copy.entries.removeConfirmTitle}
        tone="danger"
        icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.entries.closeLabel}
      />
      <DialogBody>
        <p className="asset-editor-remove-message">{npcId !== null ? copy.entries.removeConfirmMessage(npcId) : ''}</p>
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

/** Two-level visual library and focused editor for `Data/Characters`. */
export const CharacterDataPatchEditor: EditorComponent = ({ patch, draftPort, resources: environment }) => {
  const { draft } = draftPort
  const { gameRootPath, directoryInfo, locale } = environment
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const copy = useCharacterDataEditorCopy()
  const hubCopy = useEditorCopy().studioDesk.eventPatchHub
  const requestedNpcKey = useCharacterAuthoringHandoff((state) => state.pendingNpcKey)
  const consumePendingNpcKey = useCharacterAuthoringHandoff((state) => state.consumePending)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState<CharacterSourceMode>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  const [gsqRequest, setGsqRequest] = useState<GsqBuilderRequest | null>(null)
  const [vanillaGiftTastes, setVanillaGiftTastes] = useState<Record<string, string>>({})
  const [activeGroupId, setActiveGroupId] = useState('core')
  const [activeVariantKey, setActiveVariantKey] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search)
  const vanilla = useVanillaCharacterIndex(gameRootPath, directoryInfo, locale)
  const vanillaTextureNames = useMemo(() => {
    const names: string[] = []
    for (const entry of vanilla.entries.values()) {
      names.push(entry.spriteAssetName, entry.portraitAssetName, entry.textureName)
    }
    return names.filter((name) => name !== '')
  }, [vanilla.entries])
  const referenceData = useCharacterAuthoringResources({
    gameRootPath,
    directoryInfo,
    locale,
    patches: draft.patches,
    vanillaTextureNames,
  })
  const itemOptions = useMemo(
    () => toItemResourceBrowserOptions(referenceData.items, referenceData.itemTextureStates, 'character-gift'),
    [referenceData.itemTextureStates, referenceData.items],
  )

  useEffect(() => {
    setSelectedId(null)
    setAddOpen(false)
    setRemoveCandidate(null)
    setGsqRequest(null)
    setActiveGroupId('core')
    setActiveVariantKey(null)
  }, [patch.id])

  useEffect(() => {
    if (requestedNpcKey === null || vanilla.loading) return
    const pending = consumePendingNpcKey()
    if (pending === null) return
    const existing = draftPort.listEntries(CHARACTER_DATA_ASSET_ID).find((key) => key.toLowerCase() === pending.toLowerCase())
    const vanillaEntry = vanilla.entries.get(pending.toLowerCase()) ?? null
    const resolvedKey = existing ?? vanillaEntry?.key ?? null
    if (resolvedKey === null) return
    if (existing === undefined) {
      draftPort.stage(CHARACTER_DATA_ASSET_ID, resolvedKey, parseAssetEntry(CHARACTER_DATA_SCHEMA, vanilla.records[resolvedKey] ?? {}))
    }
    setSelectedId(resolvedKey)
    setSourceMode('all')
    setActiveGroupId('core')
  }, [consumePendingNpcKey, draftPort, requestedNpcKey, vanilla.entries, vanilla.loading, vanilla.records])

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setVanillaGiftTastes({})
      return
    }
    let cancelled = false
    void loadVanillaGiftTasteEntries(gameRootPath, locale)
      .then((entries) => {
        if (!cancelled) setVanillaGiftTastes(entries)
      })
      .catch(() => {
        if (!cancelled) setVanillaGiftTastes({})
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, directoryInfo, locale])

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(CHARACTER_DATA_ASSET_ID)
  const activeId = selectedId !== null && entryIds.includes(selectedId) ? selectedId : null
  const activeDraft = activeId !== null ? draftPort.read(CHARACTER_DATA_ASSET_ID, activeId) : null
  const giftTastePatchExists = draftPort.hasAsset(NPC_GIFT_TASTES_ASSET_ID)
  const giftTasteEntries = Object.fromEntries(
    draftPort.listEntries(NPC_GIFT_TASTES_ASSET_ID).map((key) => [key, draftPort.readValue(NPC_GIFT_TASTES_ASSET_ID, key)]),
  )
  const issues = [...validateCharacterEntries(entries), ...validateGiftTasteEntries(giftTasteEntries, Object.keys(entries))]
  const activeIssues = activeId === null ? [] : issues.filter((issue) => issue.path[0] === activeId)
  const resources: AssetResources = {
    npcs: entryIds,
    items: referenceData.itemIds,
    locations: referenceData.locationNames,
    textures: referenceData.textureAssetNames,
    maps: [],
    buildings: [],
    options: { item: itemOptions },
    gameRootPath,
    locale,
  }
  const groups = buildCharacterSourceGroups({
    projectKeys: entryIds,
    projectEntries: entries,
    vanilla,
    mode: sourceMode,
    search: deferredSearch,
  })
  const previewCharacter = buildPreviewEntry(activeId, activeId === null ? null : entries[activeId], vanilla)
  const portraitState = activeId !== null ? findCharacterAssetPatchState(draft.patches, 'Portraits', activeId, draft.virtualAssets) : null
  const spriteState = activeId !== null ? findCharacterAssetPatchState(draft.patches, 'Characters', activeId, draft.virtualAssets) : null
  const rawGiftTaste = activeId === null ? undefined : draftPort.readValue(NPC_GIFT_TASTES_ASSET_ID, activeId)
  const readiness =
    activeDraft === null
      ? null
      : evaluateCharacterReadiness(activeDraft, {
          issueGroups: activeIssues.map(issueGroup),
          hasGiftTastes: typeof rawGiftTaste === 'string',
        })
  const entryKey = activeId !== null ? `${patch.id}:${activeId}` : patch.id

  function handleDraftChange(next: AssetEntryDraft) {
    if (activeId !== null) draftPort.stage(CHARACTER_DATA_ASSET_ID, activeId, next)
  }

  function handleCreate(npcId: string, home: CharacterHomePlacement) {
    const result = addCharacterEntry(entries, npcId, home)
    if (!result.ok) return
    draftPort.stage(CHARACTER_DATA_ASSET_ID, result.npcId, parseAssetEntry(CHARACTER_DATA_SCHEMA, result.entries[result.npcId]))
    setSelectedId(result.npcId)
    setActiveGroupId('core')
    setActiveVariantKey(null)
    setAddOpen(false)
  }

  function handleSelectSource(row: CharacterSourceRow) {
    if (!row.inProject) {
      draftPort.stage(CHARACTER_DATA_ASSET_ID, row.key, parseAssetEntry(CHARACTER_DATA_SCHEMA, vanilla.records[row.key] ?? {}))
    }
    setSelectedId(row.key)
    setActiveGroupId('core')
    setActiveVariantKey(null)
  }

  function handleRemoveConfirmed() {
    if (removeCandidate === null) return
    draftPort.stage(CHARACTER_DATA_ASSET_ID, removeCandidate, null)
    if (giftTastePatchExists && typeof draftPort.readValue(NPC_GIFT_TASTES_ASSET_ID, removeCandidate) === 'string') {
      draftPort.stageValue(NPC_GIFT_TASTES_ASSET_ID, removeCandidate, null)
    }
    if (selectedId === removeCandidate) setSelectedId(null)
    setRemoveCandidate(null)
  }

  function openAssetPatch(state: CharacterAssetPatchState) {
    const wanted = state.assetTarget.trim().replaceAll('\\', '/').toLowerCase()
    const existing = draft.patches.find(
      (candidate) =>
        (candidate.action === 'Load' || candidate.action === 'EditImage') &&
        candidate.target.trim().replaceAll('\\', '/').toLowerCase() === wanted,
    )
    const patchId = existing?.id ?? draftPort.addPatch('EditImage', state.assetTarget)
    if (patchId != null && draftPort.openPatch !== null) draftPort.openPatch(patchId)
  }

  function handleSelectIssue(issue: AssetIssue) {
    const target = issue.path[0]
    if (typeof target === 'string' && entryIds.includes(target)) setSelectedId(target)
    setActiveGroupId(issueGroup(issue))
  }

  return (
    <div className="asset-editor character-data-editor">
      {activeId === null ? (
        <CharacterCatalog
          groups={groups}
          mode={sourceMode}
          search={search}
          vanillaLoading={vanilla.loading}
          vanillaAvailable={vanilla.available}
          gameRootPath={gameRootPath}
          locale={locale}
          resolveCharacter={(row) => buildPreviewEntry(row.key, row.inProject ? entries[row.key] : null, vanilla)}
          onModeChange={setSourceMode}
          onSearchChange={setSearch}
          onSelect={handleSelectSource}
          onAddEntry={() => setAddOpen(true)}
        />
      ) : (
        <div className="character-editor-detail">
          <div className="asset-editor-scroll character-editor-center">
            <div className="asset-editor-main character-editor-main">
              <section className="character-editor-entry-toolbar">
                <div className="character-editor-entry-identity">
                  <button
                    type="button"
                    className="icon-button h-8 w-8"
                    title={copy.sources.backToLibrary}
                    aria-label={copy.sources.backToLibrary}
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <strong className="character-editor-entry-name">{activeId}</strong>
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
                  schema={CHARACTER_DATA_SCHEMA}
                  draft={activeDraft}
                  onDraftChange={handleDraftChange}
                  resources={resources}
                  renderResourcePicker={renderAssetResourcePicker}
                  onOpenGsqBuilder={setGsqRequest}
                  hiddenFieldKeys={expertMode ? [] : CHARACTER_TECHNICAL_FIELD_KEYS}
                  groupPresentation="tabs"
                  activeGroupId={activeGroupId}
                  onActiveGroupChange={setActiveGroupId}
                  renderGroupTabLead={(groupId) =>
                    readiness === null ? null : <CharacterTabReadiness groupId={groupId} readiness={readiness} />
                  }
                  renderGroupLead={(groupId) => (
                    <CharacterGroupTools
                      groupId={groupId}
                      issues={activeIssues}
                      portraitState={portraitState}
                      spriteState={spriteState}
                      variants={previewCharacter?.variants ?? []}
                      activeVariantKey={activeVariantKey}
                      giftTasteEditor={
                        <CharacterGiftTasteEditor
                          npcId={activeId}
                          rawValue={rawGiftTaste}
                          patchExists={giftTastePatchExists}
                          vanillaRow={vanillaGiftTastes[activeId] ?? null}
                          itemOptions={itemOptions}
                          onCreatePatch={() => draftPort.addPatch('EditData', NPC_GIFT_TASTES_ASSET_ID)}
                          onChange={(row) => draftPort.stageValue(NPC_GIFT_TASTES_ASSET_ID, activeId, row)}
                          onRemove={() => draftPort.stageValue(NPC_GIFT_TASTES_ASSET_ID, activeId, null)}
                        />
                      }
                      onOpenPortrait={() => {
                        if (portraitState !== null) openAssetPatch(portraitState)
                      }}
                      onOpenSprite={() => {
                        if (spriteState !== null) openAssetPatch(spriteState)
                      }}
                      onSelectVariant={setActiveVariantKey}
                      onSelectIssue={handleSelectIssue}
                    />
                  )}
                />
              ) : null}
            </div>
          </div>

          <CharacterPreviewPane
            character={previewCharacter}
            draft={activeDraft}
            activeVariantKey={activeVariantKey}
            gameRootPath={gameRootPath}
            locale={locale}
          />
        </div>
      )}

      <AddCharacterDialog
        open={addOpen}
        existingIds={entryIds}
        projectUniqueId={draft.projectMetadata.projectUniqueId}
        locationNames={referenceData.locationNames}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
      <RemoveEntryDialog npcId={removeCandidate} onClose={() => setRemoveCandidate(null)} onConfirm={handleRemoveConfirmed} />
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
