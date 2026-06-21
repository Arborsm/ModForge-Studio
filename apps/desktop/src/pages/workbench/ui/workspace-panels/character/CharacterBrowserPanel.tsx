import { Search } from 'lucide-react'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useCharactersCopy, useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { CharacterWorkspaceEntry } from '../../../workspaces/character'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { BrowserSourceSwitch } from '@shared/ui/BrowserSourceSwitch'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

type CharacterBrowserPanelProps = {
  characters: CharacterWorkspaceEntry[]
  filteredCharacters: CharacterWorkspaceEntry[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modCharacterGroups: ModBrowserGroup<CharacterWorkspaceEntry>[]
  activeModCharacterSelectionId: string | null
  activeCharacterId: string | null
  characterFilter: string
  onCharacterFilterChange: (value: string) => void
  onSelectCharacter: (characterKey: string) => void
  onSelectModCharacter: (entry: ModBrowserEntry<CharacterWorkspaceEntry>) => void
}

export function CharacterBrowserPanel({
  characters,
  filteredCharacters,
  browserSourceMode,
  onBrowserSourceModeChange,
  modCharacterGroups,
  activeModCharacterSelectionId,
  activeCharacterId,
  characterFilter,
  onCharacterFilterChange,
  onSelectCharacter,
  onSelectModCharacter,
}: CharacterBrowserPanelProps) {
  const copy = useCharactersCopy()
  const noneLabel = useEditorCopy().common.none

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
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
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
              modCharacterGroups.map((group, groupIndex) => (
                <section
                  key={group.modPath}
                  {...getLoadingMotionChildRevealProps({
                    index: groupIndex,
                    className: 'overflow-hidden rounded-xl border border-(--border-color) bg-(--bg-panel-muted)',
                  })}
                >
                  <div className="border-b border-(--border-color) px-3 py-2">
                    <p className="truncate text-xs font-semibold tracking-[0.16em] text-(--text-primary) uppercase">{group.modName}</p>
                    <p className="truncate text-[11px] text-(--text-secondary)">{group.items.length}</p>
                  </div>
                  <div className="space-y-2 p-2">
                    {group.items.map((entry, itemIndex) => {
                      const { value: character, targets } = entry
                      const isActive = entry.selectionId === activeModCharacterSelectionId
                      const revealProps = getLoadingMotionChildRevealProps({
                        index: groupIndex + itemIndex + 1,
                        className: cx('asset-row text-left', isActive && 'asset-row-active'),
                      })
                      return (
                        <button
                          key={`${group.modId}:${character.key}`}
                          type="button"
                          {...revealProps}
                          onClick={() => onSelectModCharacter(entry)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-(--text-primary)">{character.displayName}</p>
                              <p className="truncate text-xs text-(--text-secondary)">{targets[0] ?? character.internalName}</p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-(--text-secondary)">
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
              <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
                No modded characters match the current filter.
              </div>
            )
          ) : filteredCharacters.length ? (
            filteredCharacters.map((character, index) => {
              const isActive = character.key === activeCharacterId
              const revealProps = getLoadingMotionChildRevealProps({
                index,
                className: cx('asset-row text-left', isActive && 'asset-row-active'),
              })
              return (
                <button key={character.key} type="button" {...revealProps} onClick={() => onSelectCharacter(character.key)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">{character.displayName}</p>
                      <p className="truncate text-xs text-(--text-secondary)">{character.internalName}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-(--text-secondary)">
                      <p>{character.variants.length}</p>
                      <p>{character.homeRegion ?? noneLabel}</p>
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
              {characters.length ? copy.browserFilteredEmpty : copy.browserUnloadedEmpty}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
