import { PenLine } from 'lucide-react'
import { useItemsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ModSourceList } from '@shared/ui/ModSourceList'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { findItemAssetFamily, getContainedItemSpriteFrame, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import { ItemSprite } from '@entities/item'
import { getWorkspaceText } from './itemWorkspaceRows'
import { DetailSectionCard, EmptyNotice, GiftTasteList, SourceGrid, UseGrid } from './itemWorkspaceSharedUi'
import type { AsideRow, AsideSection, DetailTab, HeroChip, ObjectDataCard, SignalCard, SourceCard, UseCard } from './itemWorkspaceTypes'

export function DetailPane({
  text,
  item,
  textureState,
  heroChips,
  signalCards,
  infoRows,
  resourceRows,
  objectDataCards,
  modSources,
  sourceCards,
  recipeUseCards,
  machineUseCards,
  recipeOutputCards,
  specificSections,
  activeDetailTab,
  onDetailTabChange,
  itemLookup,
  textureStatesByAssetName,
  onOpenItemInAuthoring,
}: {
  text: ReturnType<typeof getWorkspaceText>
  item: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
  heroChips: HeroChip[]
  signalCards: SignalCard[]
  infoRows: AsideRow[]
  resourceRows: AsideRow[]
  objectDataCards: ObjectDataCard[]
  modSources: ModSourceEntry[]
  sourceCards: SourceCard[]
  recipeUseCards: UseCard[]
  machineUseCards: UseCard[]
  recipeOutputCards: UseCard[]
  specificSections: AsideSection[]
  activeDetailTab: DetailTab
  onDetailTabChange: (tab: DetailTab) => void
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  onOpenItemInAuthoring?: (item: ItemWorkspaceEntry) => void
}) {
  const copy = useItemsCopy()
  const detailTabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'info', label: text.infoTab },
    { id: 'relations', label: text.relationsTab },
    { id: 'resources', label: text.resourcesTab },
  ]

  if (!item) {
    return (
      <section className="item-workspace-pane h-full">
        <div className="panel-header">
          <div>
            <p className="panel-title">{text.detailTitle}</p>
            <p className="panel-subtitle">{copy.workspaceEmpty}</p>
          </div>
        </div>
        <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
          <p className="text-text-secondary max-w-md text-sm">{copy.workspaceEmpty}</p>
        </div>
      </section>
    )
  }

  const giftCount = item.lovedBy.length + item.likedBy.length
  const hasRelations =
    sourceCards.length > 0 || recipeUseCards.length > 0 || machineUseCards.length > 0 || recipeOutputCards.length > 0 || giftCount > 0
  const customFields = Object.entries(item.customFields)
  const heroSpriteFrame = getContainedItemSpriteFrame(item, 144, 8, 16, 96)

  return (
    <section className="item-workspace-pane h-full">
      <div className="border-border-subtle/65 flex gap-6 border-b px-6 py-7">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl">
          <ItemSprite
            item={item}
            textureState={textureState}
            scale={heroSpriteFrame.scale}
            fallbackClassName="text-6xl"
            className="bg-transparent"
            style={{ width: `${heroSpriteFrame.width}px`, height: `${heroSpriteFrame.height}px` }}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <h2 className="text-text-primary text-[1.75rem] font-extrabold tracking-tight">{item.displayName}</h2>
          <p className="text-text-tertiary truncate font-mono text-xs">{item.qualifiedItemId}</p>

          <div className="flex flex-wrap items-center gap-2">
            {item.kindMetaLabel ? (
              <span className="bg-accent-soft text-accent inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                {item.kindMetaLabel}
              </span>
            ) : (
              <span className="bg-surface-panel-muted text-text-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                {copy.kindLabels[item.kind]}
              </span>
            )}
            {giftCount ? (
              <span className="bg-success-soft text-success inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                {copy.giftSectionTitle}
              </span>
            ) : null}
            {heroChips.map((chip) => (
              <span
                key={chip.key}
                className="bg-surface-panel-muted text-text-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              >
                {chip.label}
                <span className="text-text-primary">{chip.value}</span>
              </span>
            ))}
          </div>

          {signalCards.length > 0 ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              {signalCards.map((card) => (
                <span key={card.key} className="flex items-baseline gap-1.5 text-sm">
                  <em className="text-text-tertiary text-meta-px not-italic">{card.label}</em>
                  <strong className="text-text-primary font-bold">{card.value}</strong>
                </span>
              ))}
            </div>
          ) : null}

          {onOpenItemInAuthoring ? (
            <button
              type="button"
              className="control-button control-button-primary mt-1 self-start"
              // Families with no structured editor still jump — into the raw JSON
              // escape hatch — so the hint says which one the author will land in.
              title={findItemAssetFamily(item.kind).editor === 'structured' ? copy.openInAuthoringHint : copy.openInAuthoringRawHint}
              onClick={() => onOpenItemInAuthoring(item)}
            >
              <PenLine className="h-3.5 w-3.5" />
              <span>{copy.openInAuthoringAction}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel-body min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                tab.id === activeDetailTab
                  ? 'bg-accent-soft text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
              onClick={() => onDetailTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeDetailTab === 'info' ? (
            <div className="detail-sections-stack">
              <DetailSectionCard title={copy.basicsTitle} rows={infoRows} />

              <DetailSectionCard title={text.descriptionTitle}>
                <p className="text-text-secondary mt-2 text-sm leading-7">{item.description ?? copy.noDescription}</p>
              </DetailSectionCard>

              {specificSections.map((section) => (
                <DetailSectionCard key={section.key} title={section.title} rows={section.rows} />
              ))}
            </div>
          ) : null}

          {activeDetailTab === 'relations' ? (
            <div className="detail-sections-stack">
              {hasRelations ? (
                <>
                  {giftCount ? (
                    <section>
                      <p className="panel-section-title mb-3">{copy.giftSectionTitle}</p>
                      <GiftTasteList
                        lovedBy={item.lovedBy}
                        likedBy={item.likedBy}
                        loveTitle={copy.giftLoveTitle}
                        likeTitle={copy.giftLikeTitle}
                      />
                    </section>
                  ) : null}
                  {sourceCards.length ? (
                    <SourceGrid cards={sourceCards} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} />
                  ) : null}
                  {recipeUseCards.length ? (
                    <UseGrid
                      title={copy.recipeInputTitle}
                      cards={recipeUseCards}
                      itemLookup={itemLookup}
                      textureStatesByAssetName={textureStatesByAssetName}
                    />
                  ) : null}
                  {machineUseCards.length ? (
                    <UseGrid
                      title={copy.machineSectionTitle}
                      cards={machineUseCards}
                      itemLookup={itemLookup}
                      textureStatesByAssetName={textureStatesByAssetName}
                    />
                  ) : null}
                  {recipeOutputCards.length ? (
                    <UseGrid
                      title={copy.recipeOutputTitle}
                      cards={recipeOutputCards}
                      itemLookup={itemLookup}
                      textureStatesByAssetName={textureStatesByAssetName}
                    />
                  ) : null}
                </>
              ) : (
                <EmptyNotice message={text.relationsEmpty} />
              )}
            </div>
          ) : null}

          {activeDetailTab === 'resources' ? (
            <div className="detail-sections-stack">
              <DetailSectionCard title={copy.assetTitle} rows={resourceRows} />

              {objectDataCards.length > 0
                ? objectDataCards.map((card) => <DetailSectionCard key={card.key} title={card.title} rows={card.rows} />)
                : null}

              {modSources.length > 0 ? (
                <DetailSectionCard title={copy.modSourcesTitle}>
                  <div className="mt-2">
                    <ModSourceList sources={modSources} variant="flat" />
                  </div>
                </DetailSectionCard>
              ) : null}

              {customFields.length > 0 ? (
                <DetailSectionCard
                  title={text.customFieldsTitle}
                  rows={customFields.map(([key, value]) => ({ label: key, value: String(value) }))}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
