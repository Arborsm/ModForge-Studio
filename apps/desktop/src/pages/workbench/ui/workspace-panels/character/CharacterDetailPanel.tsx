import { useState, type ReactNode } from 'react'
import { useCharactersCopy, useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ModSourceList } from '@shared/ui/ModSourceList'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { getScaleUpFrameCount } from '@pages/workbench/workspaces/mod'
import {
  buildSpriteStyle,
  type CharacterAppearanceVariant,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '../../../workspaces/character'

type DetailTab = 'info' | 'variants' | 'relations' | 'assets'

type CharacterDetailPanelProps = {
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
  modSources?: ModSourceEntry[]
  onSelectVariant: (variant: CharacterAppearanceVariant) => void
}

function KvRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-(--border-color)/50 py-2.5 last:border-b-0">
      <span className="shrink-0 text-xs text-(--text-secondary)">{label}</span>
      <span
        className={cx(
          'max-w-[58%] truncate text-right text-xs font-semibold text-(--text-primary)',
          mono && 'font-mono font-medium text-(--text-secondary)',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pb-2">
      <p className="panel-section-title mb-1">{title}</p>
      {children}
    </section>
  )
}

function PortraitHeroArt({ character, assetState }: { character: CharacterWorkspaceEntry; assetState: CharacterVisualAssetState }) {
  const portraitUrl = assetState.portraitUrl
  const sheetWidth = assetState.portraitSheetWidth
  const sheetHeight = assetState.portraitSheetHeight

  if (portraitUrl && sheetWidth && sheetHeight) {
    return (
      <div
        className="shrink-0"
        style={buildSpriteStyle({
          url: portraitUrl,
          sheetWidth,
          sheetHeight,
          sourceX: 0,
          sourceY: 0,
          width: 64,
          height: 64,
          scale: 1.5,
        })}
        aria-hidden="true"
      />
    )
  }

  const initial = character.displayName.trim().slice(0, 1) || character.internalName.slice(0, 1) || '?'
  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-(--bg-panel-muted) text-3xl font-bold text-(--text-secondary)"
      aria-hidden="true"
    >
      {initial}
    </div>
  )
}

/**
 * Right-rail character detail: hero identity + tabbed flat sections.
 * Merges former inspector / variants / relations panels; empty optional blocks stay hidden.
 */
export function CharacterDetailPanel({
  character,
  activeVariant,
  assetState,
  modSources = [],
  onSelectVariant,
}: CharacterDetailPanelProps) {
  const copy = useCharactersCopy()
  const { yes: yesLabel, no: noLabel, none: noneLabel } = useEditorCopy().common
  const [activeTab, setActiveTab] = useState<DetailTab>('info')

  if (!character) {
    return (
      <section className="item-workspace-pane h-full">
        <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm text-(--text-secondary)">{copy.inspectorEmpty}</p>
        </div>
      </section>
    )
  }

  const birthday = [character.birthSeason, character.birthDay].filter(Boolean).join(' ') || noneLabel
  const portraitFrameImages = {
    resultImage:
      assetState.portraitSheetWidth && assetState.portraitSheetHeight
        ? { width: assetState.portraitSheetWidth, height: assetState.portraitSheetHeight }
        : null,
    originalImage:
      assetState.portraitOriginalWidth && assetState.portraitOriginalHeight
        ? { width: assetState.portraitOriginalWidth, height: assetState.portraitOriginalHeight }
        : null,
  }
  const portraitCount = getScaleUpFrameCount(portraitFrameImages, { frameWidth: 64, frameHeight: 64 })
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'info', label: copy.detailInfoTab },
    { id: 'variants', label: copy.detailVariantsTab },
    { id: 'relations', label: copy.detailRelationsTab },
    { id: 'assets', label: copy.detailAssetsTab },
  ]

  return (
    <section className="item-workspace-pane h-full">
      <div className="flex gap-4 border-b border-(--border-color)/65 px-4 py-4">
        <PortraitHeroArt character={character} assetState={assetState} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <h2 className="text-[1.5rem] font-extrabold tracking-tight text-(--text-primary)">{character.displayName}</h2>
          <p className="truncate font-mono text-xs text-(--text-tertiary)">
            {character.internalName}
            {character.textureName ? ` · ${character.textureName}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {character.canBeRomanced ? (
              <span className="inline-flex items-center rounded-full bg-(--accent-soft) px-2.5 py-1 text-xs font-bold text-(--accent)">
                {copy.romanceLabel}
              </span>
            ) : null}
            {character.canReceiveGifts ? (
              <span className="inline-flex items-center rounded-full bg-(--success-soft) px-2.5 py-1 text-xs font-bold text-(--success)">
                {copy.receivesGiftsLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-(--bg-panel-muted) px-2.5 py-1 text-xs font-bold text-(--text-secondary)">
              {birthday}
            </span>
            {character.homeRegion ? (
              <span className="inline-flex items-center rounded-full bg-(--bg-panel-muted) px-2.5 py-1 text-xs font-bold text-(--text-secondary)">
                {character.homeRegion}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
            <span className="flex items-baseline gap-1.5 text-sm">
              <em className="text-[11px] text-(--text-tertiary) not-italic">{copy.variantsPanelTitle}</em>
              <strong className="font-bold text-(--text-primary)">{character.variants.length}</strong>
            </span>
            <span className="flex items-baseline gap-1.5 text-sm">
              <em className="text-[11px] text-(--text-tertiary) not-italic">{copy.expressions}</em>
              <strong className="font-bold text-(--text-primary)">{portraitCount || 0}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pt-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              tab.id === activeTab
                ? 'bg-(--accent-soft) text-(--accent)'
                : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar panel-body min-h-0 flex-1 overflow-auto px-3 py-3">
        {activeTab === 'info' ? (
          <div className="detail-sections-stack">
            <DetailSection title={copy.basics}>
              <div className="flex flex-col">
                <KvRow label={copy.displayNameLabel} value={character.displayName} />
                <KvRow label={copy.internalNameLabel} value={character.internalName} mono />
                <KvRow label={copy.textureLabel} value={character.textureName} mono />
                <KvRow label={copy.birthdayLabel} value={birthday} />
                <KvRow label={copy.homeRegionLabel} value={character.homeRegion ?? noneLabel} />
                <KvRow label={copy.romanceLabel} value={character.canBeRomanced ? yesLabel : noLabel} />
                <KvRow label={copy.loveInterestLabel} value={character.loveInterestDisplayName ?? character.loveInterest ?? noneLabel} />
              </div>
            </DetailSection>

            <DetailSection title={copy.metadata}>
              <div className="flex flex-col">
                <KvRow label={copy.languageLabel} value={character.language ?? noneLabel} />
                <KvRow label={copy.genderLabel} value={character.gender ?? noneLabel} />
                <KvRow label={copy.ageLabel} value={character.age ?? noneLabel} />
                <KvRow label={copy.mannerLabel} value={character.manner ?? noneLabel} />
                <KvRow label={copy.socialAnxietyLabel} value={character.socialAnxiety ?? noneLabel} />
                <KvRow label={copy.optimismLabel} value={character.optimism ?? noneLabel} />
                <KvRow label={copy.breatherLabel} value={character.breather ? yesLabel : noLabel} />
                <KvRow label={copy.receivesGiftsLabel} value={character.canReceiveGifts ? yesLabel : noLabel} />
              </div>
            </DetailSection>

            <DetailSection title={copy.flags}>
              <div className="flex flex-col">
                <KvRow label={copy.formerNamesLabel} value={character.formerCharacterNames.join(', ') || noneLabel} />
                <KvRow
                  label={copy.festivalActorIndexLabel}
                  value={character.festivalVanillaActorIndex != null ? String(character.festivalVanillaActorIndex) : noneLabel}
                  mono
                />
                <KvRow label={copy.darkSkinLabel} value={character.isDarkSkinned ? yesLabel : noLabel} />
                <KvRow label={copy.spawnIfMissingLabel} value={character.spawnIfMissing ? yesLabel : noLabel} />
                <KvRow label={copy.islandVisitLabel} value={character.canVisitIsland ?? noneLabel} mono />
              </div>
            </DetailSection>
          </div>
        ) : null}

        {activeTab === 'variants' ? (
          character.variants.length ? (
            <div className="flex flex-col">
              {character.variants.map((variant) => {
                const isActive = activeVariant?.key === variant.key
                return (
                  <button
                    key={variant.key}
                    type="button"
                    aria-pressed={isActive}
                    className={cx(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b border-(--border-color)/50 px-2.5 py-3 text-left transition-colors last:border-b-0',
                      isActive ? 'rounded-lg bg-(--accent-soft)' : 'hover:bg-(--bg-hover)',
                    )}
                    onClick={() => onSelectVariant(variant)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-(--text-primary)">{variant.label}</p>
                      <p className="mt-1 truncate font-mono text-[11px] text-(--text-tertiary)">{variant.id}</p>
                    </div>
                    <span className="dock-chip shrink-0 self-start">
                      {variant.kind === 'default' ? copy.defaultBadgeShort : copy.alternateBadgeShort}
                    </span>
                    <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-(--text-secondary)">
                      <span>
                        {copy.conditionLabel}:{' '}
                        <strong className="font-semibold text-(--text-primary)">{variant.condition ?? noneLabel}</strong>
                      </span>
                      <span>
                        {copy.seasonLabel}: <strong className="font-semibold text-(--text-primary)">{variant.season ?? noneLabel}</strong>
                      </span>
                      <span>
                        {copy.islandAttireLabel}:{' '}
                        <strong className="font-semibold text-(--text-primary)">{variant.isIslandAttire ? yesLabel : noLabel}</strong>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-(--text-secondary)">{copy.variantsPanelEmpty}</p>
          )
        ) : null}

        {activeTab === 'relations' ? (
          <div className="detail-sections-stack">
            <DetailSection title={copy.homes}>
              {character.homes.length ? (
                <div className="flex flex-col">
                  {character.homes.map((home, index) => (
                    <KvRow
                      key={`${home.Location ?? 'home'}:${home.Tile?.X ?? 0}:${home.Tile?.Y ?? 0}:${index}`}
                      label={home.Location ?? noneLabel}
                      value={[home.Tile ? `${home.Tile.X}, ${home.Tile.Y}` : null, home.Condition].filter(Boolean).join(' / ') || noneLabel}
                      mono
                    />
                  ))}
                </div>
              ) : (
                <p className="py-2 text-sm text-(--text-secondary)">{noneLabel}</p>
              )}
            </DetailSection>

            <DetailSection title={copy.relations}>
              {character.friendsAndFamilyEntries.length ? (
                <div className="flex flex-col">
                  {character.friendsAndFamilyEntries.map((entry) => (
                    <KvRow key={`${entry.internalName}:${entry.relation}`} label={entry.displayName} value={entry.relation} />
                  ))}
                </div>
              ) : (
                <p className="py-2 text-sm text-(--text-secondary)">{noneLabel}</p>
              )}
            </DetailSection>
          </div>
        ) : null}

        {activeTab === 'assets' ? (
          <div className="detail-sections-stack">
            <DetailSection title={copy.assets}>
              <div className="flex flex-col">
                <KvRow label={copy.variantLabel} value={activeVariant?.label ?? noneLabel} />
                <KvRow label={copy.portraitAssetLabel} value={activeVariant?.portraitPathLabel ?? noneLabel} mono />
                <KvRow label={copy.spriteAssetLabel} value={activeVariant?.spritePathLabel ?? noneLabel} mono />
                <KvRow
                  label={copy.portraitSizeLabel}
                  value={
                    assetState.portraitSheetWidth && assetState.portraitSheetHeight
                      ? `${assetState.portraitSheetWidth}x${assetState.portraitSheetHeight}`
                      : noneLabel
                  }
                  mono
                />
                <KvRow
                  label={copy.spriteSizeLabel}
                  value={
                    assetState.spriteSheetWidth && assetState.spriteSheetHeight
                      ? `${assetState.spriteSheetWidth}x${assetState.spriteSheetHeight}`
                      : noneLabel
                  }
                  mono
                />
              </div>
            </DetailSection>

            <DetailSection title={copy.assetSource}>
              <div className="flex flex-col">
                <KvRow label={copy.spriteAssetLabel} value={assetState.spritePath ?? activeVariant?.spritePathLabel ?? noneLabel} mono />
                <KvRow
                  label={copy.portraitAssetLabel}
                  value={assetState.portraitPath ?? activeVariant?.portraitPathLabel ?? noneLabel}
                  mono
                />
              </div>
            </DetailSection>

            {modSources.length > 0 ? (
              <DetailSection title={copy.modSourcesTitle}>
                <div className="mt-1">
                  <ModSourceList sources={modSources} variant="flat" />
                </div>
              </DetailSection>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
