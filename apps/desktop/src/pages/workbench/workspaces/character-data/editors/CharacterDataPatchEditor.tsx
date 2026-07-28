import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, ImageIcon, Plus, Trash2, UserRound, Users } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import {
  AssetEntryCanvas,
  enumLabelKey,
  matchEnumValue,
  parseAssetEditorState,
  parseAssetEntry,
  type AssetEntryDraft,
  type AssetResources,
  type GsqBuilderRequest,
} from '@entities/asset-schema'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import { useAssetAuthoringCopy, useCharacterDataEditorCopy, useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import {
  addCharacterEntry,
  AGE_VALUES,
  CHARACTER_DATA_ASSET_ID,
  CHARACTER_DATA_SCHEMA,
  findCharacterAssetPatchState,
  GENDER_VALUES,
  loadVanillaGiftTasteEntries,
  NPC_GIFT_TASTES_ASSET_ID,
  SEASON_VALUES,
  useCharacterAuthoringHandoff,
  validateCharacterEntries,
  validateGiftTasteEntries,
  type CharacterAssetPatchState,
  type CharacterHomePlacement,
} from '@entities/character'
import {
  buildCharacterSourceGroups,
  buildPreviewEntry,
  useVanillaCharacterIndex,
  type CharacterSourceMode,
  type CharacterSourceRow,
} from '../state/useCharacterAuthoringSources'
import { useCharacterAuthoringResources } from '../state/useCharacterAuthoringResources'
import { AddCharacterDialog } from '../ui/AddCharacterDialog'
import { CharacterGiftTasteEditor } from '../ui/CharacterGiftTasteEditor'
import { CharacterPreviewPane } from '../ui/CharacterPreviewPane'
import { CharacterSourcePane } from '../ui/CharacterSourcePane'

function AssetCard({ title, state, onOpenEditor }: { title: string; state: CharacterAssetPatchState; onOpenEditor: () => void }) {
  const copy = useCharacterDataEditorCopy()
  return (
    <div className="asset-editor-asset-card">
      <div className="asset-editor-asset-head">
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        <span className="asset-editor-asset-title">{title}</span>
        <span className={state.patchFound ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-missing'}>
          {state.patchFound ? copy.assets.patchFound : copy.assets.patchMissing}
        </span>
      </div>
      <div className="asset-editor-asset-target">{state.assetTarget}</div>
      {state.patchFound ? (
        <div className="asset-editor-asset-file">
          <span className="asset-editor-asset-file-label">{copy.assets.fromFileLabel}</span>
          <span className="asset-editor-asset-file-value">{state.fromFile ?? copy.assets.noFromFile}</span>
          {state.fromFile ? (
            <span className={state.fileInDraft ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
              {state.fileInDraft ? copy.assets.fileInDraft : copy.assets.fileNotInDraft}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className="asset-editor-asset-hint">{copy.assets.manageHint}</p>
      <button type="button" className="control-button mt-2" onClick={onOpenEditor}>
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{copy.assets.openEditorAction}</span>
      </button>
    </div>
  )
}

/** Resolves an enum value to its localized label, keeping unknown spellings visible. */
function useEnumLabel() {
  const authoring = useAssetAuthoringCopy()
  return (catalog: string, values: readonly string[], raw: unknown): string | null => {
    if (typeof raw !== 'string' || raw === '') {
      return null
    }
    const canonical = matchEnumValue(values, raw)
    return canonical === null ? raw : (authoring.enums[enumLabelKey(catalog, canonical)] ?? canonical)
  }
}

function SummaryCard({ draft }: { draft: AssetEntryDraft }) {
  const copy = useCharacterDataEditorCopy()
  const enumLabel = useEnumLabel()
  const fields = draft.fields
  const birthDay = typeof fields['BirthDay'] === 'number' ? fields['BirthDay'] : undefined
  const homeRegion = typeof fields['HomeRegion'] === 'string' ? fields['HomeRegion'] : null
  const loveInterest = typeof fields['LoveInterest'] === 'string' ? fields['LoveInterest'] : ''

  const identityParts = [
    enumLabel('character.gender', GENDER_VALUES, fields['Gender']),
    enumLabel('character.age', AGE_VALUES, fields['Age']),
  ].filter((part): part is string => part !== null)
  const seasonLabel = enumLabel('character.season', SEASON_VALUES, fields['BirthSeason'])
  const birthday = seasonLabel !== null || birthDay !== undefined ? [seasonLabel, birthDay].filter((part) => part != null).join(' ') : null
  const romance =
    fields['CanBeRomanced'] === true ? copy.summary.romanceYes : fields['CanBeRomanced'] === false ? copy.summary.romanceNo : null

  const chips: Array<{ label: string; value: string | null }> = [
    { label: copy.summary.identity, value: identityParts.length > 0 ? identityParts.join(' · ') : null },
    { label: copy.summary.birthday, value: birthday },
    { label: copy.summary.region, value: homeRegion },
    { label: copy.summary.romance, value: romance },
  ]
  if (loveInterest) {
    chips.push({ label: copy.summary.loveInterest, value: loveInterest })
  }

  return (
    <div className="asset-editor-card">
      <div className="asset-editor-card-title">
        <UserRound className="h-4 w-4" aria-hidden="true" />
        <span>{copy.summary.title}</span>
      </div>
      <dl className="asset-editor-summary-list">
        {chips.map((chip) => (
          <div key={chip.label} className="asset-editor-summary-chip">
            <dt>{chip.label}</dt>
            <dd className={chip.value === null ? 'is-unset' : undefined}>{chip.value ?? copy.summary.notSet}</dd>
          </div>
        ))}
      </dl>
    </div>
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

/**
 * Three-pane authoring editor for `Data/Characters`.
 *
 * Left picks the NPC — from this patch or from the vanilla roster; center is
 * the schema-driven form plus the gift-taste rows that live in a separate
 * asset; right previews the sprite the entry actually describes and lists every
 * validation issue across both assets.
 */
export const CharacterDataPatchEditor: EditorComponent = ({ patch, draftPort, resources: environment }) => {
  const { draft } = draftPort
  const { gameRootPath, directoryInfo, locale } = environment
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
  const deferredSearch = useDeferredValue(search)
  const vanilla = useVanillaCharacterIndex(gameRootPath, directoryInfo, locale)
  // Portrait/sprite sheets the vanilla roster uses; the hook folds in this
  // draft's own `Load`/`EditImage` targets so project-only art is browsable too.
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
  const locationNames = referenceData.locationNames

  useEffect(() => {
    setSelectedId(null)
    setAddOpen(false)
    setRemoveCandidate(null)
    setGsqRequest(null)
  }, [patch.id])

  // The codex page hands over an NPC key when the author picks "open in
  // character authoring"; consuming it here keeps a later remount from
  // re-selecting a character the author has since moved away from.
  useEffect(() => {
    if (requestedNpcKey === null) {
      return
    }
    const pending = consumePendingNpcKey()
    if (pending !== null) {
      setSelectedId(pending)
      setSourceMode('all')
    }
  }, [requestedNpcKey, consumePendingNpcKey])

  // Vanilla gift-taste rows back the "import vanilla tastes" action.
  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setVanillaGiftTastes({})
      return
    }
    let cancelled = false
    void loadVanillaGiftTasteEntries(gameRootPath, locale)
      .then((entries) => {
        if (!cancelled) {
          setVanillaGiftTastes(entries)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVanillaGiftTastes({})
        }
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, directoryInfo, locale])

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(CHARACTER_DATA_ASSET_ID)
  const activeId = selectedId !== null && entryIds.includes(selectedId) ? selectedId : (entryIds[0] ?? null)
  const activeDraft = activeId !== null ? draftPort.read(CHARACTER_DATA_ASSET_ID, activeId) : null
  const giftTastePatchExists = draftPort.hasAsset(NPC_GIFT_TASTES_ASSET_ID)
  const giftTasteEntries = Object.fromEntries(
    draftPort.listEntries(NPC_GIFT_TASTES_ASSET_ID).map((key) => [key, draftPort.readValue(NPC_GIFT_TASTES_ASSET_ID, key)]),
  )
  const issues = [...validateCharacterEntries(entries), ...validateGiftTasteEntries(giftTasteEntries, Object.keys(entries))]
  const resources: AssetResources = {
    npcs: entryIds,
    items: referenceData.itemIds,
    locations: locationNames,
    textures: referenceData.textureAssetNames,
    maps: [],
    buildings: [],
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

  function handleDraftChange(next: AssetEntryDraft) {
    if (activeId === null) {
      return
    }
    draftPort.stage(CHARACTER_DATA_ASSET_ID, activeId, next)
  }

  function handleCreate(npcId: string, home: CharacterHomePlacement) {
    const result = addCharacterEntry(entries, npcId, home)
    if (!result.ok) {
      // The dialog validates before calling; reaching this branch means the
      // draft changed underneath, so keep the dialog open with its own error.
      return
    }
    draftPort.stage(CHARACTER_DATA_ASSET_ID, result.npcId, parseAssetEntry(CHARACTER_DATA_SCHEMA, result.entries[result.npcId]))
    setSelectedId(result.npcId)
    setAddOpen(false)
  }

  /** Selecting a vanilla-only row seeds an override from the untouched record. */
  function handleSelectSource(row: CharacterSourceRow) {
    if (row.inProject) {
      setSelectedId(row.key)
      return
    }
    const record = vanilla.records[row.key]
    draftPort.stage(CHARACTER_DATA_ASSET_ID, row.key, parseAssetEntry(CHARACTER_DATA_SCHEMA, record ?? {}))
    setSelectedId(row.key)
  }

  function handleRemoveConfirmed() {
    if (removeCandidate === null) {
      return
    }
    draftPort.stage(CHARACTER_DATA_ASSET_ID, removeCandidate, null)
    if (giftTastePatchExists && typeof draftPort.readValue(NPC_GIFT_TASTES_ASSET_ID, removeCandidate) === 'string') {
      draftPort.stageValue(NPC_GIFT_TASTES_ASSET_ID, removeCandidate, null)
    }
    if (selectedId === removeCandidate) {
      setSelectedId(null)
    }
    setRemoveCandidate(null)
  }

  const portraitState = activeId !== null ? findCharacterAssetPatchState(draft.patches, 'Portraits', activeId, draft.virtualAssets) : null
  const spriteState = activeId !== null ? findCharacterAssetPatchState(draft.patches, 'Characters', activeId, draft.virtualAssets) : null
  const entryKey = activeId !== null ? `${patch.id}:${activeId}` : patch.id

  /** Opens the image patch backing one NPC asset, creating the EditImage patch on first use. */
  function openAssetPatch(state: CharacterAssetPatchState) {
    const wanted = state.assetTarget.trim().replaceAll('\\', '/').toLowerCase()
    const existing = draft.patches.find(
      (candidate) =>
        (candidate.action === 'Load' || candidate.action === 'EditImage') &&
        candidate.target.trim().replaceAll('\\', '/').toLowerCase() === wanted,
    )
    const patchId = existing?.id ?? draftPort.addPatch('EditImage', state.assetTarget)
    if (patchId != null && draftPort.openPatch !== null) {
      draftPort.openPatch(patchId)
    }
  }

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
        <CharacterSourcePane
          groups={groups}
          mode={sourceMode}
          search={search}
          activeKey={activeId}
          vanillaLoading={vanilla.loading}
          vanillaAvailable={vanilla.available}
          gameRootPath={gameRootPath}
          locale={locale}
          onModeChange={setSourceMode}
          onSearchChange={setSearch}
          onSelect={handleSelectSource}
          onAddEntry={() => setAddOpen(true)}
        />

        <div className="asset-editor-scroll custom-scrollbar">
          {entryIds.length === 0 ? (
            <div className="asset-editor-empty">
              <Users className="asset-editor-empty-icon" aria-hidden="true" />
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

              {activeDraft !== null ? <SummaryCard draft={activeDraft} /> : null}

              {portraitState !== null && spriteState !== null ? (
                <div className="asset-editor-assets">
                  <AssetCard title={copy.assets.portraitTitle} state={portraitState} onOpenEditor={() => openAssetPatch(portraitState)} />
                  <AssetCard title={copy.assets.spriteTitle} state={spriteState} onOpenEditor={() => openAssetPatch(spriteState)} />
                </div>
              ) : null}

              {activeDraft !== null ? (
                <AssetEntryCanvas
                  key={entryKey}
                  schema={CHARACTER_DATA_SCHEMA}
                  draft={activeDraft}
                  onDraftChange={handleDraftChange}
                  resources={resources}
                  onOpenGsqBuilder={setGsqRequest}
                />
              ) : null}

              <CharacterGiftTasteEditor
                npcId={activeId}
                rawValue={activeId === null ? undefined : draftPort.readValue(NPC_GIFT_TASTES_ASSET_ID, activeId)}
                patchExists={giftTastePatchExists}
                vanillaRow={activeId === null ? null : (vanillaGiftTastes[activeId] ?? null)}
                onCreatePatch={() => draftPort.addPatch('EditData', NPC_GIFT_TASTES_ASSET_ID)}
                onChange={(row) => {
                  if (activeId !== null) {
                    draftPort.stageValue(NPC_GIFT_TASTES_ASSET_ID, activeId, row)
                  }
                }}
                onRemove={() => {
                  if (activeId !== null) {
                    draftPort.stageValue(NPC_GIFT_TASTES_ASSET_ID, activeId, null)
                  }
                }}
              />
            </div>
          )}
        </div>

        <CharacterPreviewPane
          character={previewCharacter}
          issues={issues}
          gameRootPath={gameRootPath}
          locale={locale}
          onSelectIssue={(issue) => {
            const target = issue.path[0]
            if (typeof target === 'string') {
              setSelectedId(target)
            }
          }}
        />
      </div>

      <AddCharacterDialog
        open={addOpen}
        existingIds={entryIds}
        projectUniqueId={draft.projectMetadata.projectUniqueId}
        locationNames={locationNames}
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
