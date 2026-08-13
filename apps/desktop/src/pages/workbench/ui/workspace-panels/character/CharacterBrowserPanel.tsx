import { PenLine, Search } from 'lucide-react'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useCharactersCopy, useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { CharacterWorkspaceEntry } from '@entities/character'
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
  /** Opens an NPC in the character authoring module; omitted when unavailable. */
  onOpenInAuthoring?: (characterKey: string) => void
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
    <div className="border-border-subtle bg-surface-panel-muted flex gap-px rounded-lg border p-px">
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
              'flex-1 rounded-button py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-surface-panel text-text-primary shadow-[inset_0_-1.5px_0_0_var(--accent)]'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
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
      className="bg-surface-panel-muted text-text-secondary rounded-field flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_70%,transparent)]"
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
  onOpenInAuthoring,
  revealIndex,
}: {
  character: CharacterWorkspaceEntry
  isActive: boolean
  metaPrimary: string
  metaSecondary: string
  onSelect: () => void
  onOpenInAuthoring?: () => void
  revealIndex: number
}) {
  const copy = useCharactersCopy()
  const revealProps = getLoadingMotionChildRevealProps({
    index: revealIndex,
    className: cx(
      'group relative flex items-center rounded-xl border border-transparent transition-colors',
      isActive
        ? 'border-[color-mix(in_srgb,var(--accent)_16%,transparent)] bg-accent-soft shadow-[inset_2px_0_0_0_var(--accent)]'
        : 'hover:bg-surface-hover',
    ),
  })

  return (
    <div {...revealProps}>
      <button
        type="button"
        className="grid min-w-0 flex-1 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-2 text-left"
        aria-pressed={isActive}
        onClick={onSelect}
      >
        <CharacterGlyph character={character} />
        <span className="min-w-0">
          <span
            className={cx(
              'block truncate text-body-px font-semibold tracking-tight',
              isActive ? 'text-[color-mix(in_srgb,var(--accent)_72%,var(--text-primary))]' : 'text-text-primary',
            )}
          >
            {character.displayName}
          </span>
          <span className="text-text-tertiary text-meta-px mt-0.5 block truncate font-mono">{metaPrimary}</span>
        </span>
        <span className="text-text-tertiary text-meta-px shrink-0 text-right leading-tight">
          <span className="text-text-secondary text-meta-px block font-mono font-semibold tabular-nums">{character.variants.length}</span>
          <span className="mt-0.5 block max-w-20 truncate">{metaSecondary}</span>
        </span>
      </button>
      {onOpenInAuthoring ? (
        <button
          type="button"
          className={cx(
            'icon-button mr-1.5 shrink-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
            isActive ? 'opacity-100' : 'opacity-0',
          )}
          aria-label={copy.openInAuthoringAction}
          title={copy.openInAuthoringHint}
          onClick={onOpenInAuthoring}
        >
          <PenLine className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
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
  onOpenInAuthoring,
}: CharacterBrowserPanelProps) {
  const copy = useCharactersCopy()
  const noneLabel = useEditorCopy().common.none

  return (
    <aside className="item-workspace-pane h-full">
      <div className="custom-scrollbar flex h-full min-h-0 flex-col overflow-auto p-4">
        <div className="relative mb-3">
          <Search className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            className="control-input bg-surface-panel-muted pl-9"
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
                    <p className="text-text-secondary truncate text-xs font-semibold">{group.modName}</p>
                    <span className="text-text-tertiary text-meta-px font-mono tabular-nums">{group.items.length}</span>
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
                          onOpenInAuthoring={onOpenInAuthoring ? () => onOpenInAuthoring(character.key) : undefined}
                        />
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
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
                onOpenInAuthoring={onOpenInAuthoring ? () => onOpenInAuthoring(character.key) : undefined}
              />
            ))
          ) : (
            <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
              {characters.length ? copy.browserFilteredEmpty : copy.browserUnloadedEmpty}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
