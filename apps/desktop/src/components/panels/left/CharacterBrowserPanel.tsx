import { Search } from 'lucide-react'
import type { CharactersPanelCopy } from '../../../lib/editor-shell'
import { cx } from '../../../lib/cx'
import type { CharacterWorkspaceEntry } from '../../../lib/app/characterWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'

type CharacterBrowserPanelProps = {
  copy: CharactersPanelCopy
  noneLabel: string
  characters: CharacterWorkspaceEntry[]
  filteredCharacters: CharacterWorkspaceEntry[]
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
      headerAction={<span className="dock-chip">{filteredCharacters.length}</span>}
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

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {filteredCharacters.length ? (
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
