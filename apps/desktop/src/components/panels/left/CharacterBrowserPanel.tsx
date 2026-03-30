import { Search } from 'lucide-react'
import type { BrowserSourceMode, ModBrowserGroup } from '../../../lib/app/modAssetIndex'
import type { CharactersPanelCopy } from '../../../lib/editor-shell'
import { cx } from '../../../lib/cx'
import type { CharacterWorkspaceEntry } from '../../../lib/app/characterWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'
import { BrowserSourceSwitch } from '../../ui/BrowserSourceSwitch'

type CharacterBrowserPanelProps = {
  copy: CharactersPanelCopy
  noneLabel: string
  characters: CharacterWorkspaceEntry[]
  filteredCharacters: CharacterWorkspaceEntry[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modCharacterGroups: ModBrowserGroup<CharacterWorkspaceEntry>[]
  activeCharacterId: string | null
  characterFilter: string
  onCharacterFilterChange: (value: string) => void
  onSelectCharacter: (characterKey: string) => void
}

export function CharacterBrowserPanel({
  copy,
  noneLabel,
  characters,
  filteredCharacters,
  browserSourceMode,
  onBrowserSourceModeChange,
  modCharacterGroups,
  activeCharacterId,
  characterFilter,
  onCharacterFilterChange,
  onSelectCharacter,
}: CharacterBrowserPanelProps) {
  return (
    <PanelFrame
      hideHeader
      title={copy.browserTitle}
      subtitle={copy.browserSubtitle}
      className="h-full"
      headerAction={
        <span className="dock-chip">
          {browserSourceMode === 'mod'
            ? modCharacterGroups.reduce((total, group) => total + group.items.length, 0)
            : filteredCharacters.length}
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={characterFilter}
            onChange={(event) => onCharacterFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {browserSourceMode === 'mod' ? (
            modCharacterGroups.length ? (
              modCharacterGroups.map((group) => (
                <section
                  key={group.modPath}
                  className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
                >
                  <div className="border-b border-[var(--border-color)] px-3 py-2">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                      {group.modName}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">{group.items.length}</p>
                  </div>
                  <div className="space-y-2 p-2">
                    {group.items.map(({ value: character, targets }) => {
                      const isActive = character.key === activeCharacterId
                      return (
                        <button
                          key={`${group.modId}:${character.key}`}
                          type="button"
                          className={cx('asset-row text-left', isActive && 'asset-row-active')}
                          onClick={() => onSelectCharacter(character.key)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{character.displayName}</p>
                              <p className="truncate text-xs text-[var(--text-secondary)]">{targets[0] ?? character.internalName}</p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                              <p>{character.variants.length}</p>
                              <p>{character.homeRegion ?? noneLabel}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                No modded characters match the current filter.
              </div>
            )
          ) : filteredCharacters.length ? (
            filteredCharacters.map((character) => {
              const isActive = character.key === activeCharacterId
              return (
                <button
                  key={character.key}
                  type="button"
                  className={cx('asset-row text-left', isActive && 'asset-row-active')}
                  onClick={() => onSelectCharacter(character.key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{character.displayName}</p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">{character.internalName}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                      <p>{character.variants.length}</p>
                      <p>{character.homeRegion ?? noneLabel}</p>
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
              {characters.length ? copy.browserFilteredEmpty : copy.browserUnloadedEmpty}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
