import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Plus, Search, UserRound } from 'lucide-react'
import {
  addCharacterEntry,
  CHARACTER_DATA_ASSET_ID,
  CHARACTER_DATA_SCHEMA,
  CharacterSpriteThumbnail,
  resolveCharacterSpriteMetrics,
  type CharacterHomePlacement,
  type CharacterWorkspaceEntry,
} from '@entities/character'
import { parseAssetEntry, parseAssetEditorState } from '@entities/asset-schema'
import { WorkspaceEntryList, type AssetDraftPort, type DraftPatch, type EditorResources, type WorkspaceEntryRow } from '@features/cp-maker'
import { useCharacterDataEditorCopy, useEditorCopy } from '@locales/provider'
import type { LocaleCode } from '@locales'
import { cx } from '@shared/lib/helper'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import {
  buildCharacterSourceGroups,
  buildPreviewEntry,
  useVanillaCharacterIndex,
  type CharacterSourceMode,
  type CharacterSourceRow,
} from '../state/useCharacterAuthoringSources'
import { useCharacterAuthoringResources } from '../state/useCharacterAuthoringResources'
import { useCharacterThumbnail } from '../state/useCharacterThumbnail'
import { AddCharacterDialog } from './AddCharacterDialog'

const THUMBNAIL_SCALE = 2

function CharacterCatalogCard({
  row,
  character,
  gameRootPath,
  locale,
  onSelect,
}: {
  row: CharacterSourceRow
  character: CharacterWorkspaceEntry | null
  gameRootPath: string | null
  locale: LocaleCode
  onSelect: (row: CharacterSourceRow) => void
}) {
  const copy = useCharacterDataEditorCopy()
  const assetState = useCharacterThumbnail(character, gameRootPath, locale)
  const metrics = resolveCharacterSpriteMetrics(character, assetState)

  return (
    <button
      type="button"
      className="character-catalog-card"
      title={copy.sources.openCharacter(row.displayName)}
      onClick={() => onSelect(row)}
    >
      <span className="character-catalog-preview" aria-hidden="true">
        {character === null ? (
          <UserRound className="h-8 w-8" />
        ) : (
          <CharacterSpriteThumbnail
            assetState={assetState}
            metrics={metrics}
            scale={THUMBNAIL_SCALE}
            fallbackText={row.displayName.trim().slice(0, 1) || row.key.slice(0, 1)}
          />
        )}
      </span>
      <span className="character-catalog-card-body">
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
 * Character authoring landing page: a two-column layout with the change manager
 * on the left and the character library (project overrides + vanilla entries)
 * on the right. Selecting a character stages it into the patch and opens the
 * independent editor page.
 */
export function CharacterCatalogPage({
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
  const copy = useCharacterDataEditorCopy()
  const entryListCopy = useEditorCopy().studioDesk.entryList
  const { gameRootPath, directoryInfo, locale } = resources
  const [sourceMode, setSourceMode] = useState<CharacterSourceMode>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [groups, setGroups] = useState<{
    project: CharacterSourceRow[]
    vanillaOnly: CharacterSourceRow[]
    resolvedNames: Map<string, string>
  }>({ project: [], vanillaOnly: [], resolvedNames: new Map() })
  const [groupsLoading, setGroupsLoading] = useState(true)
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
    patches: draftPort.draft.patches,
    vanillaTextureNames,
  })

  const entries = parseAssetEditorState(patch.editorState).entries
  const entryIds = draftPort.listEntries(CHARACTER_DATA_ASSET_ID)

  useEffect(() => {
    let cancelled = false
    setGroupsLoading(true)
    void buildCharacterSourceGroups({
      rootPath: gameRootPath,
      locale,
      projectKeys: entryIds,
      projectEntries: entries,
      vanilla,
      mode: sourceMode,
      search: deferredSearch,
    }).then((next) => {
      if (!cancelled) {
        setGroups(next)
        setGroupsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale, entryIds, entries, vanilla, sourceMode, deferredSearch])

  const hasRows = groups.project.length > 0 || groups.vanillaOnly.length > 0

  function resolveCharacter(row: CharacterSourceRow): CharacterWorkspaceEntry | null {
    return buildPreviewEntry(row.key, row.inProject ? entries[row.key] : null, vanilla)
  }

  function handleSelectSource(row: CharacterSourceRow) {
    if (!row.inProject) {
      draftPort.stage(CHARACTER_DATA_ASSET_ID, row.key, parseAssetEntry(CHARACTER_DATA_SCHEMA, vanilla.records[row.key] ?? {}))
    }
    draftPort.selectEntry(row.key)
    onOpenPatch(patch.id)
  }

  function handleCreate(npcId: string, home: CharacterHomePlacement) {
    const result = addCharacterEntry(entries, npcId, home)
    if (!result.ok) return
    draftPort.stage(CHARACTER_DATA_ASSET_ID, result.npcId, parseAssetEntry(CHARACTER_DATA_SCHEMA, result.entries[result.npcId]))
    setAddOpen(false)
    draftPort.selectEntry(result.npcId)
    onOpenPatch(patch.id)
  }

  const entryRows: WorkspaceEntryRow[] = entryIds.map((key) => {
    const meta = draftPort.readEntryMeta(CHARACTER_DATA_ASSET_ID, key)
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
    draftPort.stage(CHARACTER_DATA_ASSET_ID, key, null)
  }

  function handleToggleEntry(key: string, next: boolean) {
    draftPort.stageEntryMeta(CHARACTER_DATA_ASSET_ID, key, { enabled: next })
  }

  const modes: Array<{ id: CharacterSourceMode; label: string }> = [
    { id: 'all', label: copy.sources.modeAll },
    { id: 'project', label: copy.sources.modeProject },
    { id: 'vanilla', label: copy.sources.modeVanilla },
  ]

  const renderCards = (rows: CharacterSourceRow[]) => (
    <div className="character-catalog-grid">
      {rows.map((row) => (
        <CharacterCatalogCard
          key={row.key}
          row={row}
          character={resolveCharacter(row)}
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
      <div className="character-catalog custom-scrollbar">
        <div className="character-catalog-content">
          {sourceMode !== 'vanilla' && groups.project.length > 0 ? (
            <section className="character-catalog-section">
              <div className="character-catalog-section-head">
                <h3>{copy.sources.projectGroup}</h3>
                <span>{copy.sources.groupCount(groups.project.length)}</span>
              </div>
              {renderCards(groups.project)}
            </section>
          ) : null}

          {sourceMode !== 'project' && groups.vanillaOnly.length > 0 ? (
            <section className="character-catalog-section">
              <div className="character-catalog-section-head">
                <h3>{copy.sources.vanillaGroup}</h3>
                <span>{copy.sources.groupCount(groups.vanillaOnly.length)}</span>
              </div>
              {renderCards(groups.vanillaOnly)}
            </section>
          ) : null}

          {!hasRows ? (
            <div className="character-catalog-empty">
              <UserRound className="h-8 w-8" aria-hidden="true" />
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

      <AddCharacterDialog
        open={addOpen}
        existingIds={entryIds}
        projectUniqueId={draftPort.draft.projectMetadata.projectUniqueId}
        locationNames={referenceData.locationNames}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
    </WorkspaceSplitView>
  )
}
