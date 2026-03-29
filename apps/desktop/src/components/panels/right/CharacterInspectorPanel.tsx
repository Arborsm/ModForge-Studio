import type { CharactersPanelCopy } from '../../../lib/editor-shell'
import type {
  CharacterAppearanceVariant,
  CharacterVisualAssetState,
  CharacterWorkspaceEntry,
} from '../../../lib/app/characterWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '../../ui/PanelSection'

type CharacterInspectorPanelProps = {
  copy: CharactersPanelCopy
  yesLabel: string
  noLabel: string
  noneLabel: string
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
}

function renderKv(label: string, value: string) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <span className="max-w-[55%] truncate text-right">{value}</span>
    </div>
  )
}

export function CharacterInspectorPanel({
  copy,
  yesLabel,
  noLabel,
  noneLabel,
  character,
  activeVariant,
  assetState,
}: CharacterInspectorPanelProps) {
  return (
    <PanelFrame title={copy.inspectorTitle} subtitle={copy.inspectorSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!character ? (
          <PanelEmptyState>{copy.inspectorEmpty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection title={copy.basics} bodyClassName="space-y-2">
                {renderKv(copy.displayNameLabel, character.displayName)}
                {renderKv(copy.internalNameLabel, character.internalName)}
                {renderKv(copy.textureLabel, character.textureName)}
                {renderKv(copy.birthdayLabel, [character.birthSeason, character.birthDay].filter(Boolean).join(' ') || noneLabel)}
                {renderKv(copy.homeRegionLabel, character.homeRegion ?? noneLabel)}
                {renderKv(copy.romanceLabel, character.canBeRomanced ? yesLabel : noLabel)}
                {renderKv(copy.loveInterestLabel, character.loveInterestDisplayName ?? character.loveInterest ?? noneLabel)}
            </PanelSection>

            <PanelSection title={copy.metadata} bodyClassName="space-y-2">
                {renderKv(copy.languageLabel, character.language ?? noneLabel)}
                {renderKv(copy.genderLabel, character.gender ?? noneLabel)}
                {renderKv(copy.ageLabel, character.age ?? noneLabel)}
                {renderKv(copy.mannerLabel, character.manner ?? noneLabel)}
                {renderKv(copy.socialAnxietyLabel, character.socialAnxiety ?? noneLabel)}
                {renderKv(copy.optimismLabel, character.optimism ?? noneLabel)}
                {renderKv(copy.breatherLabel, character.breather ? yesLabel : noLabel)}
                {renderKv(copy.receivesGiftsLabel, character.canReceiveGifts ? yesLabel : noLabel)}
            </PanelSection>

            <PanelSection title={copy.assets} bodyClassName="space-y-2">
                {renderKv(copy.variantLabel, activeVariant?.label ?? noneLabel)}
                {renderKv(copy.portraitAssetLabel, activeVariant?.portraitPathLabel ?? noneLabel)}
                {renderKv(copy.spriteAssetLabel, activeVariant?.spritePathLabel ?? noneLabel)}
                {renderKv(
                  copy.portraitSizeLabel,
                  assetState.portraitSheetWidth && assetState.portraitSheetHeight
                    ? `${assetState.portraitSheetWidth}x${assetState.portraitSheetHeight}`
                    : noneLabel,
                )}
                {renderKv(
                  copy.spriteSizeLabel,
                  assetState.spriteSheetWidth && assetState.spriteSheetHeight
                    ? `${assetState.spriteSheetWidth}x${assetState.spriteSheetHeight}`
                    : noneLabel,
                )}
              <div className="mt-4 border-t border-[var(--border-color)] pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  {copy.assetSource}
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      {copy.spriteAssetLabel}
                    </p>
                    <p className="mt-1 break-all text-sm text-[var(--text-primary)]">
                      {assetState.spritePath ?? activeVariant?.spritePathLabel ?? noneLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      {copy.portraitAssetLabel}
                    </p>
                    <p className="mt-1 break-all text-sm text-[var(--text-primary)]">
                      {assetState.portraitPath ?? activeVariant?.portraitPathLabel ?? noneLabel}
                    </p>
                  </div>
                </div>
              </div>
            </PanelSection>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
