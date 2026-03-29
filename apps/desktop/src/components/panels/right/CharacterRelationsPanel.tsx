import type { CharactersPanelCopy } from '../../../lib/editor-shell'
import type { CharacterWorkspaceEntry } from '../../../lib/app/characterWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'

type CharacterRelationsPanelProps = {
  copy: CharactersPanelCopy
  yesLabel: string
  noLabel: string
  noneLabel: string
  character: CharacterWorkspaceEntry | null
}

export function CharacterRelationsPanel({
  copy,
  yesLabel,
  noLabel,
  noneLabel,
  character,
}: CharacterRelationsPanelProps) {
  return (
    <PanelFrame title={copy.detailsTitle} subtitle={copy.detailsSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 overflow-auto p-3">
        {!character ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
            {copy.detailsEmpty}
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                {copy.homes}
              </p>
              <div className="mt-3 space-y-2">
                {character.homes.length ? (
                  character.homes.map((home, index) => (
                    <div
                      key={`${home.Location ?? 'home'}:${home.Tile?.X ?? 0}:${home.Tile?.Y ?? 0}:${index}`}
                      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-2"
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
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                {copy.relations}
              </p>
              <div className="mt-3 space-y-2">
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
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                {copy.flags}
              </p>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-primary)]">
                <p>{copy.formerNamesLabel}: {character.formerCharacterNames.join(', ') || noneLabel}</p>
                <p>{copy.festivalActorIndexLabel}: {character.festivalVanillaActorIndex ?? noneLabel}</p>
                <p>{copy.darkSkinLabel}: {character.isDarkSkinned ? yesLabel : noLabel}</p>
                <p>{copy.spawnIfMissingLabel}: {character.spawnIfMissing ? yesLabel : noLabel}</p>
                <p>{copy.islandVisitLabel}: {character.canVisitIsland ?? noneLabel}</p>
              </div>
            </section>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
