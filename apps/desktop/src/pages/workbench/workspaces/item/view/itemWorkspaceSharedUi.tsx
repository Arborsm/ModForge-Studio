import { ArrowRight, Coins, Heart, Skull } from 'lucide-react'
import type { ReactNode } from 'react'
import { useItemsCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { getContainedItemSpriteScale, type ItemGiftTasteNpc, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../entities/item'
import { ItemSprite } from '../entities/item'
import { formatPrice } from './itemWorkspaceRows'
import { RenderKv } from './itemWorkspaceRenderKv'
import { getToneClass } from './itemWorkspaceUiClasses'
import type { AsideRow, HeroChip, SignalCard, SourceCard, Tone, UseCard } from './itemWorkspaceTypes'

export function EmptyNotice({ message }: { message: string }) {
  return <div className="panel-empty-state">{message}</div>
}

export function DetailSectionCard({ title, rows, children }: { title: string; rows?: AsideRow[]; children?: ReactNode }) {
  return (
    <section className="panel-section p-4">
      <p className="panel-section-title">{title}</p>
      {rows?.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={`${title}:${row.label}`} className="panel-section px-3 py-3">
              <RenderKv label={row.label} value={row.value} />
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function HeroStatChip({ chip }: { chip: HeroChip }) {
  const Icon = chip.icon === 'coins' ? Coins : chip.icon === 'skull' ? Skull : chip.icon === 'heart' ? Heart : null

  return (
    <div className={`rounded-2xl border px-3 py-3 ${getToneClass(chip.tone ?? 'neutral')}`}>
      <p className="text-[10px] tracking-[0.16em] uppercase opacity-70">{chip.label}</p>
      <div className="mt-2 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
        <p className="text-sm font-semibold">{chip.value}</p>
      </div>
    </div>
  )
}

export function WorkbenchSignalCard({ card }: { card: SignalCard }) {
  return (
    <article className="panel-section px-4 py-3">
      <p className="panel-section-title text-[10px]">{card.label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{card.value}</p>
        <p className="text-right text-[11px] text-[var(--text-tertiary)]">{card.detail}</p>
      </div>
    </article>
  )
}

export function TasteGroup({ title, entries, tone }: { title: string; entries: ItemGiftTasteNpc[]; tone: Tone }) {
  if (!entries.length) {
    return null
  }

  return (
    <div className="panel-section p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${getToneClass(tone)}`}>
          <Heart className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{entries.length}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {entries.map((npc) => (
          <div key={`${npc.taste}:${npc.internalName}`} className="panel-list-card flex items-center gap-3 px-3 py-2.5">
            <div
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-semibold uppercase ${getToneClass(tone)}`}
            >
              {npc.displayName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{npc.displayName}</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">{npc.internalName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RelatedVisual({
  itemId,
  itemLookup,
  textureStatesByAssetName,
  fallback,
}: {
  itemId?: string | null
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  fallback: string
}) {
  const relatedItem = itemId ? (itemLookup.get(itemId) ?? null) : null
  const textureState = relatedItem?.textureAssetName ? (textureStatesByAssetName[relatedItem.textureAssetName] ?? null) : null

  return relatedItem ? (
    <ItemSprite
      item={relatedItem}
      textureState={textureState}
      scale={getContainedItemSpriteScale(relatedItem, 56, 1.9)}
      className="h-14 w-14 shrink-0"
    />
  ) : (
    <div className="panel-list-card flex h-14 w-14 shrink-0 items-center justify-center text-sm font-semibold text-[var(--text-secondary)]">
      {fallback.slice(0, 1)}
    </div>
  )
}

export function SourceGrid({
  cards,
  itemLookup,
  textureStatesByAssetName,
}: {
  cards: SourceCard[]
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  const copy = useItemsCopy()
  return (
    <section className="panel-section p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="panel-section-title">{copy.sourceSectionTitle}</p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{cards.length ? `${cards.length}` : copy.noneLabel}</p>
        </div>
      </div>

      {cards.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <article key={card.key} className="panel-section-muted panel-section p-4">
              <div className="flex items-start gap-3">
                <RelatedVisual
                  itemId={card.relatedQualifiedItemId}
                  itemLookup={itemLookup}
                  textureStatesByAssetName={textureStatesByAssetName}
                  fallback={card.title}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="dock-chip">{card.badge}</span>
                    {card.chance ? <span className="dock-chip">{card.chance}</span> : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{card.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{card.detail}</p>
                  {card.meta.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.meta.map((meta) => (
                        <span
                          key={meta}
                          className="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                        >
                          {meta}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-empty-state">{copy.sourceSectionEmpty}</div>
      )}
    </section>
  )
}

function FormulaChip({
  ingredient,
  relatedItem,
  textureState,
}: {
  ingredient: UseCard['ingredients'][number]
  relatedItem: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
}) {
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-2xl border px-3 py-2',
        ingredient.isCurrent
          ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]'
          : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)]',
      )}
    >
      {relatedItem ? (
        <ItemSprite
          item={relatedItem}
          textureState={textureState}
          scale={getContainedItemSpriteScale(relatedItem, 40, 1.45)}
          className="h-10 w-10 shrink-0"
        />
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{ingredient.label}</p>
        <p className="text-xs text-[var(--text-secondary)]">x{ingredient.amount}</p>
      </div>
    </div>
  )
}

export function UseGrid({
  title,
  cards,
  itemLookup,
  textureStatesByAssetName,
}: {
  title: string
  cards: UseCard[]
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  const copy = useItemsCopy()
  return (
    <section className="panel-section p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="panel-section-title">{title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{cards.length}</p>
        </div>
      </div>

      {cards.length ? (
        <div className="mt-3 grid gap-3">
          {cards.map((card) => {
            const outputItem = card.outputQualifiedItemId ? (itemLookup.get(card.outputQualifiedItemId) ?? null) : null
            const outputTexture = outputItem?.textureAssetName ? (textureStatesByAssetName[outputItem.textureAssetName] ?? null) : null

            return (
              <article key={card.key} className="panel-section-muted panel-section p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="dock-chip">{card.badge}</span>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{card.title}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{card.subtitle}</p>
                  </div>
                  {outputItem ? (
                    <div className="shrink-0 text-right">
                      <ItemSprite
                        item={outputItem}
                        textureState={outputTexture}
                        scale={getContainedItemSpriteScale(outputItem, 56, 1.75)}
                        className="ml-auto h-14 w-14"
                      />
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">x{card.outputCount ?? 1}</p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {card.ingredients.map((ingredient, index) => {
                    const relatedItem = ingredient.qualifiedItemId ? (itemLookup.get(ingredient.qualifiedItemId) ?? null) : null
                    const textureState = relatedItem?.textureAssetName
                      ? (textureStatesByAssetName[relatedItem.textureAssetName] ?? null)
                      : null

                    return (
                      <div key={ingredient.key} className="flex items-center gap-2">
                        <FormulaChip ingredient={ingredient} relatedItem={relatedItem} textureState={textureState} />
                        {index < card.ingredients.length - 1 ? <span className="text-[var(--text-tertiary)]">+</span> : null}
                      </div>
                    )
                  })}
                  {outputItem ? (
                    <>
                      <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                      <div className="panel-list-card flex items-center gap-2 px-3 py-2">
                        <ItemSprite
                          item={outputItem}
                          textureState={outputTexture}
                          scale={getContainedItemSpriteScale(outputItem, 40, 1.45)}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{outputItem.displayName}</p>
                          <p className="text-xs text-[var(--text-secondary)]">x{card.outputCount ?? 1}</p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="panel-empty-state mt-3">{copy.noneLabel}</div>
      )}
    </section>
  )
}

export function ItemTooltip({ item }: { item: ItemWorkspaceEntry | null }) {
  const copy = useItemsCopy()
  if (!item) {
    return null
  }

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-10 w-[260px] rounded-2xl border border-white/10 bg-[rgba(10,12,16,0.88)] px-4 py-3 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="dock-chip">{copy.kindLabels[item.kind]}</span>
      </div>
      <p className="mt-3 text-base font-semibold">{item.displayName}</p>
      <div className="mt-3 space-y-1 text-xs text-white/80">
        <p>
          {copy.qualifiedIdLabel}: {item.qualifiedItemId}
        </p>
        <p>
          {copy.typeLabel}: {item.kindMetaLabel ?? copy.kindLabels[item.kind]}
        </p>
        <p>
          {copy.priceLabel}: {formatPrice(item.price ?? item.salePrice, copy)}
        </p>
      </div>
    </div>
  )
}
