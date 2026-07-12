import { Search } from 'lucide-react'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useCharactersCopy, useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { CharacterWorkspaceEntry } from '../../../workspaces/character'
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

function SourceSwitch({
  value,
  onChange,
  originalLabel,
  modLabel,
}: {
  value: BrowserSourceMode
  onChange: (mode: BrowserSourceMode) => void
  originalLabel: string
  modLabel: string
}) {
  return (
    <div className="flex gap-px rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-px">
      {(
        [
          ['original', originalLabel],
          ['mod', modLabel],
        ] as const
      ).map(([mode, label]) => {
        const isActive = value === mode
        return (
          <button
            key={mode}
            type="button"
            className={cx(
              'flex-1 rounded-[0.4375rem] py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-(--bg-panel) text-(--text-primary) shadow-[inset_0_-1.5px_0_0_var(--accent)]'
                : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
            )}
            onClick={() => onChange(mode)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function CharacterGlyph({ character }: { character: CharacterWorkspaceEntry }) {
  const initial = character.displayName.trim().slice(0, 1) || character.internalName.slice(0, 1) || '?'
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem] bg-(--bg-panel-muted) text-sm font-bold text-(--text-secondary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_70%,transparent)]"
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

function CharacterRow({
  character,
  isActive,
  metaPrimary,
  metaSecondary,
  onSelect,
  revealIndex,
}: {
  character: CharacterWorkspaceEntry
  isActive: boolean
  metaPrimary: string
  metaSecondary: string
  onSelect: () => void
  revealIndex: number
}) {
  const revealProps = getLoadingMotionChildRevealProps({
    index: revealIndex,
    className: cx(
      'grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left transition-colors',
      isActive
        ? 'border-[color-mix(in_srgb,var(--accent)_16%,transparent)] bg-(--accent-soft) shadow-[inset_2px_0_0_0_var(--accent)]'
        : 'hover:bg-(--bg-hover)',
    ),
  })

  return (
    <button type="button" {...revealProps} aria-pressed={isActive} onClick={onSelect}>
      <CharacterGlyph character={character} />
      <span className="min-w-0">
        <span
          className={cx(
            'block truncate text-[13px] font-semibold tracking-tight',
            isActive ? 'text-[color-mix(in_srgb,var(--accent)_72%,var(--text-primary))]' : 'text-(--text-primary)',
          )}
        >
          {character.displayName}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-(--text-tertiary)">{metaPrimary}</span>
      </span>
      <span className="shrink-0 text-right text-[11px] leading-tight text-(--text-tertiary)">
        <span className="block font-mono text-[11px] font-semibold text-(--text-secondary) tabular-nums">{character.variants.length}</span>
        <span className="mt-0.5 block max-w-20 truncate">{metaSecondary}</span>
      </span>
    </button>
  )
}

/**
 * Character catalog rail: search, source switch, and flat list rows.
 * Uses item-workspace pane chrome; no duplicate panel header title bar.
 */
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
    <aside className="item-workspace-pane h-full">
      <div className="custom-scrollbar flex h-full min-h-0 flex-col overflow-auto p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
          <input
            className="control-input bg-(--bg-panel-muted) pl-9"
            value={characterFilter}
            onChange={(event) => onCharacterFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mb-4">
          <SourceSwitch
            value={browserSourceMode}
            onChange={onBrowserSourceModeChange}
            originalLabel={copy.sourceOriginalLabel}
            modLabel={copy.sourceModLabel}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-0.5">
          {browserSourceMode === 'mod' ? (
            modCharacterGroups.length ? (
              modCharacterGroups.map((group, groupIndex) => (
                <section key={group.modPath} className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2 px-2">
                    <p className="truncate text-xs font-semibold text-(--text-secondary)">{group.modName}</p>
                    <span className="font-mono text-[11px] text-(--text-tertiary) tabular-nums">{group.items.length}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((entry, itemIndex) => {
                      const { value: character, targets } = entry
                      return (
                        <CharacterRow
                          key={`${group.modId}:${character.key}:${entry.selectionId}`}
                          character={character}
                          isActive={entry.selectionId === activeModCharacterSelectionId}
                          metaPrimary={targets[0] ?? character.internalName}
                          metaSecondary={character.homeRegion ?? noneLabel}
                          revealIndex={groupIndex + itemIndex + 1}
                          onSelect={() => onSelectModCharacter(entry)}
                        />
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
                {copy.browserModEmpty}
              </div>
            )
          ) : filteredCharacters.length ? (
            filteredCharacters.map((character, index) => (
              <CharacterRow
                key={character.key}
                character={character}
                isActive={character.key === activeCharacterId}
                metaPrimary={character.internalName}
                metaSecondary={character.homeRegion ?? noneLabel}
                revealIndex={index}
                onSelect={() => onSelectCharacter(character.key)}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
              {characters.length ? copy.browserFilteredEmpty : copy.browserUnloadedEmpty}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
