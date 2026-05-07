import { useCharactersCopy, useEditorCopy } from '@locales/localeContext'
import type { CharacterWorkspaceEntry } from '../../../workspaces/character'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'

type CharacterRelationsPanelProps = {
  character: CharacterWorkspaceEntry | null
}

export function CharacterRelationsPanel({
  character,
}: CharacterRelationsPanelProps) {
  const copy = useCharactersCopy()
  const { yes: yesLabel, no: noLabel, none: noneLabel } = useEditorCopy().common

  return (
    <PanelFrame title={copy.detailsTitle} subtitle={copy.detailsSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 overflow-auto p-3">
        {!character ? (
          <PanelEmptyState>{copy.detailsEmpty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection title={copy.homes} bodyClassName="space-y-2">
                {character.homes.length ? (
                  character.homes.map((home, index) => (
                    <div
                      key={`${home.Location ?? 'home'}:${home.Tile?.X ?? 0}:${home.Tile?.Y ?? 0}:${index}`}
                      className="panel-list-card px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{home.Location ?? noneLabel}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {home.Tile ? `${home.Tile.X}, ${home.Tile.Y}` : noneLabel}
                        {home.Condition ? ` / ${home.Condition}` : ''}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">{noneLabel}</p>
                )}
            </PanelSection>

            <PanelSection title={copy.relations} bodyClassName="space-y-2">
                {character.friendsAndFamilyEntries.length ? (
                  character.friendsAndFamilyEntries.map((entry) => (
                    <div key={`${entry.internalName}:${entry.relation}`} className="kv-row">
                      <span title={entry.internalName}>{entry.displayName}</span>
                      <span>{entry.relation}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">{noneLabel}</p>
                )}
            </PanelSection>

            <PanelSection title={copy.flags}>
              <div className="space-y-2 text-sm text-[var(--text-primary)]">
                <p>{copy.formerNamesLabel}: {character.formerCharacterNames.join(', ') || noneLabel}</p>
                <p>{copy.festivalActorIndexLabel}: {character.festivalVanillaActorIndex ?? noneLabel}</p>
                <p>{copy.darkSkinLabel}: {character.isDarkSkinned ? yesLabel : noLabel}</p>
                <p>{copy.spawnIfMissingLabel}: {character.spawnIfMissing ? yesLabel : noLabel}</p>
                <p>{copy.islandVisitLabel}: {character.canVisitIsland ?? noneLabel}</p>
              </div>
            </PanelSection>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
