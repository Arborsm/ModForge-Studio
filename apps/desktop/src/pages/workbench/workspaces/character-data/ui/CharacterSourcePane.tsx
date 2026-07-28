/**
 * Left pane of the character authoring editor: where the NPC comes from.
 *
 * Rows are layered into "overridden by this project" and "vanilla only" so an
 * author can tell at a glance whether editing a name will change an existing
 * villager or introduce a new one. Vanilla rows carry a walking-sprite
 * thumbnail loaded from the game directory; picking one seeds an override.
 */

import { useEffect, useState } from 'react'
import { Plus, Search, UserPlus } from 'lucide-react'
import {
  CharacterSpriteThumbnail,
  EMPTY_CHARACTER_VISUAL_ASSET_STATE,
  loadCharacterImageState,
  resolveCharacterSpriteMetrics,
  resolveCharacterVariantPaths,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '@entities/character'
import type { LocaleCode } from '@locales'
import { useCharacterDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { CharacterSourceGroups, CharacterSourceMode, CharacterSourceRow } from '../state/useCharacterAuthoringSources'

const THUMBNAIL_SCALE = 1.5

/** Resolves the first walk frame of one vanilla entry, reusing the image cache. */
function useCharacterThumbnail(
  entry: CharacterWorkspaceEntry | null,
  gameRootPath: string | null,
  locale: LocaleCode,
): CharacterVisualAssetState {
  const [state, setState] = useState<CharacterVisualAssetState>(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
  const variant = entry?.variants[0] ?? null
  const { spritePath } = resolveCharacterVariantPaths(gameRootPath, variant)

  useEffect(() => {
    if (!spritePath) {
      setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
      return
    }

    let cancelled = false
    void loadCharacterImageState(spritePath, locale)
      .then((image) => {
        if (cancelled) {
          return
        }
        setState({
          ...EMPTY_CHARACTER_VISUAL_ASSET_STATE,
          spritePath: image.path,
          spriteUrl: image.url,
          spriteSheetWidth: image.width,
          spriteSheetHeight: image.height,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
        }
      })

    return () => {
      cancelled = true
    }
  }, [spritePath, locale])

  return state
}

function SourceRow({
  row,
  active,
  gameRootPath,
  locale,
  onSelect,
}: {
  row: CharacterSourceRow
  active: boolean
  gameRootPath: string | null
  locale: LocaleCode
  onSelect: (row: CharacterSourceRow) => void
}) {
  const copy = useCharacterDataEditorCopy()
  const assetState = useCharacterThumbnail(row.vanilla, gameRootPath, locale)
  const metrics = resolveCharacterSpriteMetrics(row.vanilla, assetState)

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx('asset-source-row', active && 'is-active')}
      onClick={() => onSelect(row)}
      title={row.inProject ? row.key : copy.sources.overrideHint}
    >
      <CharacterSpriteThumbnail
        assetState={assetState}
        metrics={metrics}
        scale={THUMBNAIL_SCALE}
        fallbackText={row.displayName.trim().slice(0, 1) || row.key.slice(0, 1)}
      />
      <span className="asset-source-row-text">
        <span className="asset-source-row-name">{row.displayName}</span>
        <span className="asset-source-row-key">{row.key}</span>
      </span>
      {row.inProject ? (
        <span className={cx('asset-editor-badge', row.vanilla ? 'is-warn' : 'is-ok')}>
          {row.vanilla ? copy.sources.overrideBadge : copy.sources.newBadge}
        </span>
      ) : (
        <UserPlus className="asset-source-row-action" aria-hidden="true" />
      )}
    </button>
  )
}

export function CharacterSourcePane({
  groups,
  mode,
  search,
  activeKey,
  vanillaLoading,
  vanillaAvailable,
  gameRootPath,
  locale,
  onModeChange,
  onSearchChange,
  onSelect,
  onAddEntry,
}: {
  groups: CharacterSourceGroups
  mode: CharacterSourceMode
  search: string
  activeKey: string | null
  vanillaLoading: boolean
  vanillaAvailable: boolean
  gameRootPath: string | null
  locale: LocaleCode
  onModeChange: (mode: CharacterSourceMode) => void
  onSearchChange: (search: string) => void
  onSelect: (row: CharacterSourceRow) => void
  onAddEntry: () => void
}) {
  const copy = useCharacterDataEditorCopy()
  const modes: Array<{ id: CharacterSourceMode; label: string }> = [
    { id: 'all', label: copy.sources.modeAll },
    { id: 'project', label: copy.sources.modeProject },
    { id: 'vanilla', label: copy.sources.modeVanilla },
  ]

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
        {mode !== 'vanilla' ? (
          <section className="asset-source-group">
            <header className="asset-source-group-head">
              <span>{copy.sources.projectGroup}</span>
              <span className="asset-source-group-count">{copy.sources.groupCount(groups.project.length)}</span>
            </header>
            {groups.project.length === 0 ? (
              <p className="asset-source-empty">{search.trim() ? copy.sources.searchEmpty : copy.sources.projectEmpty}</p>
            ) : (
              groups.project.map((row) => (
                <SourceRow
                  key={row.key}
                  row={row}
                  active={row.key === activeKey}
                  gameRootPath={gameRootPath}
                  locale={locale}
                  onSelect={onSelect}
                />
              ))
            )}
          </section>
        ) : null}

        {mode !== 'project' ? (
          <section className="asset-source-group">
            <header className="asset-source-group-head">
              <span>{copy.sources.vanillaGroup}</span>
              <span className="asset-source-group-count">{copy.sources.groupCount(groups.vanillaOnly.length)}</span>
            </header>
            {vanillaLoading ? <p className="asset-source-empty">{copy.sources.vanillaLoading}</p> : null}
            {!vanillaLoading && !vanillaAvailable ? <p className="asset-source-empty">{copy.sources.vanillaUnavailable}</p> : null}
            {!vanillaLoading && vanillaAvailable && groups.vanillaOnly.length === 0 ? (
              <p className="asset-source-empty">{copy.sources.searchEmpty}</p>
            ) : null}
            {groups.vanillaOnly.map((row) => (
              <SourceRow
                key={row.key}
                row={row}
                active={row.key === activeKey}
                gameRootPath={gameRootPath}
                locale={locale}
                onSelect={onSelect}
              />
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  )
}
