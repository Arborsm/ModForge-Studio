import { cx } from '../../../lib/cx'
import { useCharactersCopy, useEditorCopy } from '../../../lib/app/localeContext'
import type { CharacterAppearanceVariant, CharacterWorkspaceEntry } from '../../../lib/app/characterWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'
import { PanelEmptyState } from '../../ui/PanelSection'

type CharacterVariantsPanelProps = {
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  onSelectVariant: (variant: CharacterAppearanceVariant) => void
}

export function CharacterVariantsPanel({
  character,
  activeVariant,
  onSelectVariant,
}: CharacterVariantsPanelProps) {
  const copy = useCharactersCopy()
  const { yes: yesLabel, no: noLabel, none: noneLabel } = useEditorCopy().common

  return (
    <PanelFrame title={copy.variantsPanelTitle} subtitle={copy.variantsPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 overflow-auto p-3">
        {!character || character.variants.length === 0 ? (
          <PanelEmptyState>{copy.variantsPanelEmpty}</PanelEmptyState>
        ) : (
          character.variants.map((variant) => {
            const isActive = activeVariant?.key === variant.key
            return (
              <button
                key={variant.key}
                type="button"
                className={cx(
                  'panel-list-card panel-list-card-interactive text-left',
                  isActive
                    ? 'panel-list-card-active'
                    : 'hover:bg-[color-mix(in_srgb,var(--bg-active)_66%,transparent)]',
                )}
                onClick={() => onSelectVariant(variant)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{variant.label}</p>
                    <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{variant.id}</p>
                  </div>
                  <span className="dock-chip shrink-0">
                    {variant.kind === 'default' ? copy.defaultBadgeShort : copy.alternateBadgeShort}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                  <p>{copy.conditionLabel}: {variant.condition ?? noneLabel}</p>
                  <p>{copy.seasonLabel}: {variant.season ?? noneLabel}</p>
                  <p>{copy.islandAttireLabel}: {variant.isIslandAttire ? yesLabel : noLabel}</p>
                  <p>{copy.portraitAssetLabel}: {variant.portraitPathLabel}</p>
                  <p>{copy.spriteAssetLabel}: {variant.spritePathLabel}</p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </PanelFrame>
  )
}
