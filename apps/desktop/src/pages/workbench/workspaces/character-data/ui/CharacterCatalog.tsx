import { Plus, Search, UserRound } from 'lucide-react'
import { CharacterSpriteThumbnail, resolveCharacterSpriteMetrics, type CharacterWorkspaceEntry } from '@entities/character'
import type { LocaleCode } from '@locales'
import { useCharacterDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { CharacterSourceGroups, CharacterSourceMode, CharacterSourceRow } from '../state/useCharacterAuthoringSources'
import { useCharacterThumbnail } from '../state/useCharacterThumbnail'

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

/** First-level visual library for choosing which character to edit. */
export function CharacterCatalog({
  groups,
  mode,
  search,
  vanillaLoading,
  vanillaAvailable,
  gameRootPath,
  locale,
  resolveCharacter,
  onModeChange,
  onSearchChange,
  onSelect,
  onAddEntry,
}: {
  groups: CharacterSourceGroups
  mode: CharacterSourceMode
  search: string
  vanillaLoading: boolean
  vanillaAvailable: boolean
  gameRootPath: string | null
  locale: LocaleCode
  resolveCharacter: (row: CharacterSourceRow) => CharacterWorkspaceEntry | null
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
  const hasRows = groups.project.length > 0 || groups.vanillaOnly.length > 0

  const renderCards = (rows: CharacterSourceRow[]) => (
    <div className="character-catalog-grid">
      {rows.map((row) => (
        <CharacterCatalogCard
          key={row.key}
          row={row}
          character={resolveCharacter(row)}
          gameRootPath={gameRootPath}
          locale={locale}
          onSelect={onSelect}
        />
      ))}
    </div>
  )

  return (
    <div className="character-catalog custom-scrollbar">
      <header className="character-catalog-toolbar">
        <div className="character-catalog-intro">
          <h2>{copy.sources.libraryTitle}</h2>
          <p>{copy.sources.libraryHint}</p>
        </div>
        <label className="character-catalog-search">
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
        <button type="button" className="control-button control-button-primary" onClick={onAddEntry}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copy.addEntryAction}</span>
        </button>
      </header>

      <div className="character-catalog-content">
        {mode !== 'vanilla' && groups.project.length > 0 ? (
          <section className="character-catalog-section">
            <div className="character-catalog-section-head">
              <h3>{copy.sources.projectGroup}</h3>
              <span>{copy.sources.groupCount(groups.project.length)}</span>
            </div>
            {renderCards(groups.project)}
          </section>
        ) : null}

        {mode !== 'project' && groups.vanillaOnly.length > 0 ? (
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
              {vanillaLoading
                ? copy.sources.vanillaLoading
                : !vanillaAvailable && mode !== 'project'
                  ? copy.sources.vanillaUnavailable
                  : search.trim()
                    ? copy.sources.searchEmpty
                    : copy.sources.projectEmpty}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
