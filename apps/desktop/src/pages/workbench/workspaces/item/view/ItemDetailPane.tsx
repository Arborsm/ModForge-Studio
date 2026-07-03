import { useItemsCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { ModSourceList } from '@shared/ui/ModSourceList'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { getContainedItemSpriteFrame, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../entities/item'
import { ItemSprite } from '../entities/item'
import { getWorkspaceText } from './itemWorkspaceRows'
import { DetailSectionCard, EmptyNotice, HeroStatChip, SourceGrid, TasteGroup, UseGrid, WorkbenchSignalCard } from './itemWorkspaceSharedUi'
import { getPillClass } from './itemWorkspaceUiClasses'
import { RenderKv } from './itemWorkspaceRenderKv'
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
}) {
  const copy = useItemsCopy()
  const detailTabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'info', label: text.infoTab },
    { id: 'relations', label: text.relationsTab },
    { id: 'resources', label: text.resourcesTab },
  ]

  if (!item) {
    return (
      <section className="panel-surface h-full">
        <div className="panel-header">
          <div>
            <p className="panel-title">{text.detailTitle}</p>
            <p className="panel-subtitle">{copy.workspaceEmpty}</p>
          </div>
        </div>
        <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm text-[var(--text-secondary)]">{copy.workspaceEmpty}</p>
        </div>
      </section>
    )
  }

  const hasRelations = sourceCards.length > 0 || recipeUseCards.length > 0 || machineUseCards.length > 0 || recipeOutputCards.length > 0
  const giftCount = item.lovedBy.length + item.likedBy.length
  const customFields = Object.entries(item.customFields)
  const heroSpriteFrame = getContainedItemSpriteFrame(item, 128, 6, 12, 80)

  return (
    <section className="panel-surface h-full">
      <div className="panel-header">
        <div>
          <p className="panel-title">{text.detailTitle}</p>
          <p className="panel-subtitle">{item.displayName}</p>
        </div>
        <span className="dock-chip">{item.qualifiedItemId}</span>
      </div>
      <div className="mx-5 mb-5 overflow-hidden rounded-[24px] border border-[var(--border-color)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--accent)_12%,var(--bg-panel)))] px-5 py-5">
        <div className="grid gap-5 lg:grid-cols-[160px_minmax(0,1fr)]">
          <div className="panel-section flex min-h-[160px] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_38%),radial-gradient(circle_at_70%_78%,rgba(255,255,255,0.08),transparent_34%),var(--bg-panel)] p-5">
            <ItemSprite
              item={item}
              textureState={textureState}
              scale={heroSpriteFrame.scale}
              className="border-white/10 bg-transparent"
              style={{ width: `${heroSpriteFrame.width}px`, height: `${heroSpriteFrame.height}px` }}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dock-chip">{copy.kindLabels[item.kind]}</span>
              {item.kindMetaLabel ? <span className="dock-chip">{item.kindMetaLabel}</span> : null}
              {giftCount ? <span className="dock-chip">{copy.giftSectionTitle}</span> : null}
            </div>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{item.displayName}</h2>
            <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">{item.internalName}</p>
            <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{item.qualifiedItemId}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {heroChips.map((chip) => (
                <HeroStatChip key={chip.key} chip={chip} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {signalCards.map((card) => (
                <WorkbenchSignalCard key={card.key} card={card} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-body min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="flex flex-wrap gap-2">
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cx(
                'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                getPillClass(tab.id === activeDetailTab),
              )}
              onClick={() => onDetailTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {activeDetailTab === 'info' ? (
            <div className="space-y-4">
              <DetailSectionCard title={copy.basicsTitle} rows={infoRows} />

              <DetailSectionCard title={text.descriptionTitle}>
                <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{item.description ?? copy.noDescription}</p>
              </DetailSectionCard>

              <DetailSectionCard title={copy.giftSectionTitle}>
                <div className="mt-3 space-y-3">
                  {giftCount ? (
                    <>
                      <TasteGroup title={copy.giftLoveTitle} entries={item.lovedBy} tone="danger" />
                      <TasteGroup title={copy.giftLikeTitle} entries={item.likedBy} tone="positive" />
                    </>
                  ) : (
                    <EmptyNotice message={text.giftsEmpty} />
                  )}
                </div>
              </DetailSectionCard>

              {specificSections.map((section) => (
                <DetailSectionCard key={section.key} title={section.title} rows={section.rows} />
              ))}
            </div>
          ) : null}

          {activeDetailTab === 'relations' ? (
            <div className="space-y-4">
              {hasRelations ? (
                <>
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
            <div className="space-y-4">
              <DetailSectionCard title={copy.assetTitle} rows={resourceRows} />

              <DetailSectionCard title={copy.objectDataTitle}>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {objectDataCards.length ? (
                    objectDataCards.map((card) => (
                      <div key={card.key} className="panel-section px-3 py-3">
                        <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{card.title}</p>
                        <div className="grid gap-2">
                          {card.rows.map((row) => (
                            <RenderKv key={`${card.key}:${row.label}`} label={row.label} value={row.value} />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyNotice message={copy.objectDataEmpty} />
                  )}
                </div>
              </DetailSectionCard>

              <DetailSectionCard title={copy.modSourcesTitle}>
                <div className="mt-3">
                  <ModSourceList sources={modSources} />
                </div>
              </DetailSectionCard>

              <DetailSectionCard title={text.customFieldsTitle}>
                <div className="mt-3 space-y-2">
                  {customFields.length ? (
                    customFields.map(([key, value]) => (
                      <div key={key} className="panel-section px-3 py-3">
                        <RenderKv label={key} value={value} />
                      </div>
                    ))
                  ) : (
                    <EmptyNotice message={text.customFieldsEmpty} />
                  )}
                </div>
              </DetailSectionCard>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
