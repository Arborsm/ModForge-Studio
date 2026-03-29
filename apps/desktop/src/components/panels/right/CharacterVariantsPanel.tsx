import { cx } from '../../../lib/cx'
import type { CharactersPanelCopy } from '../../../lib/editor-shell'
import type { CharacterAppearanceVariant, CharacterWorkspaceEntry } from '../../../lib/app/characterWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'

type CharacterVariantsPanelProps = {
  copy: CharactersPanelCopy
  yesLabel: string
  noLabel: string
  noneLabel: string
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  onSelectVariant: (variant: CharacterAppearanceVariant) => void
}

export function CharacterVariantsPanel({
  copy,
  yesLabel,
  noLabel,
  noneLabel,
  character,
  activeVariant,
  onSelectVariant,
}: CharacterVariantsPanelProps) {
  return (
    <PanelFrame title={copy.variantsPanelTitle} subtitle={copy.variantsPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 overflow-auto p-3">
        {!character || character.variants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
            {copy.variantsPanelEmpty}
          </div>
        ) : (
          character.variants.map((variant) => {
            const isActive = activeVariant?.key === variant.key
            return (
              <button
                key={variant.key}
                type="button"
                className={cx(
                  'rounded-3xl border p-3 text-left transition-colors',
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--bg-active)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)]',
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
