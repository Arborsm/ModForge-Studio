import { Heart } from 'lucide-react'
import type { ReactNode } from 'react'
import { useItemsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { getContainedItemSpriteScale, type ItemGiftTasteNpc, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../entities/item'
import { ItemSprite } from '../entities/item'
import type { AsideRow, SourceCard, UseCard } from './itemWorkspaceTypes'

export function EmptyNotice({ message }: { message: string }) {
  return <div className="panel-empty-state">{message}</div>
}

export function DetailSectionCard({ title, rows, children }: { title: string; rows?: AsideRow[]; children?: ReactNode }) {
  return (
    <section className="pb-2">
      <p className="panel-section-title mb-3">{title}</p>
      {rows?.length ? (
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={`${title}:${row.label}`}
              className="flex items-center justify-between gap-3 border-b border-(--border-color)/50 py-2.5 last:border-b-0"
            >
              <span className="text-xs text-(--text-secondary)">{row.label}</span>
              <span className="truncate text-xs font-semibold text-(--text-primary)">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function GiftTasteList({
  lovedBy,
  likedBy,
  loveTitle,
  likeTitle,
}: {
  lovedBy: ItemGiftTasteNpc[]
  likedBy: ItemGiftTasteNpc[]
  loveTitle: string
  likeTitle: string
}) {
  if (!lovedBy.length && !likedBy.length) {
    return null
  }

  return (
    <section className="py-2">
      <div className="space-y-3">
        {lovedBy.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold tracking-widest text-(--text-tertiary) uppercase">
              <Heart className="h-3.5 w-3.5 fill-current text-(--danger)" aria-hidden="true" />
              {loveTitle}
            </div>
            <div className="flex flex-wrap gap-2">
              {lovedBy.map((npc) => (
                <span
                  key={`love:${npc.internalName}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--danger-soft) px-2.5 py-1.5 text-xs font-bold text-(--danger)"
                >
                  <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
                  {npc.displayName}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {likedBy.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold tracking-widest text-(--text-tertiary) uppercase">
              <Heart className="h-3.5 w-3.5 text-(--success)" aria-hidden="true" />
              {likeTitle}
            </div>
            <div className="flex flex-wrap gap-2">
              {likedBy.map((npc) => (
                <span
                  key={`like:${npc.internalName}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--success-soft) px-2.5 py-1.5 text-xs font-bold text-(--success)"
                >
                  <Heart className="h-3 w-3" aria-hidden="true" />
                  {npc.displayName}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
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
      scale={getContainedItemSpriteScale(relatedItem, 40, 1.8)}
      className="h-10 w-10 shrink-0"
    />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem] text-xs font-semibold text-(--text-secondary)">
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
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="panel-section-title">{copy.sourceSectionTitle}</p>
        </div>
      </div>

      {cards.length ? (
        <div className="flex flex-col">
          {cards.map((card) => (
            <article
              key={card.key}
              className="grid grid-cols-[2.75rem_2fr_auto_1fr] items-center gap-3 border-b border-(--border-color)/50 py-2.5 transition-colors last:border-b-0 hover:bg-(--bg-hover)"
            >
              <div className="flex h-full items-center justify-center">
                <RelatedVisual
                  itemId={card.relatedQualifiedItemId}
                  itemLookup={itemLookup}
                  textureStatesByAssetName={textureStatesByAssetName}
                  fallback={card.title}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-(--text-primary)">{card.title}</p>
                <p className="truncate text-xs text-(--text-secondary)">{card.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="dock-chip">{card.badge}</span>
                {card.chance ? <span className="dock-chip">{card.chance}</span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {card.meta.length ? (
                  card.meta.map((meta) => (
                    <span
                      key={meta}
                      className="rounded-full border border-(--border-color) bg-(--bg-panel-muted) px-2 py-0.5 text-[11px] text-(--text-secondary)"
                    >
                      {meta}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-(--text-tertiary)">—</span>
                )}
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

function IngredientPill({
  ingredient,
  relatedItem,
  textureState,
}: {
  ingredient: UseCard['ingredients'][number]
  relatedItem: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
        ingredient.isCurrent
          ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-panel-muted))] text-(--text-primary)'
          : 'border-(--border-color) bg-(--bg-panel-muted) text-(--text-secondary)',
      )}
    >
      {relatedItem ? (
        <ItemSprite
          item={relatedItem}
          textureState={textureState}
          scale={getContainedItemSpriteScale(relatedItem, 24, 1.2)}
          className="h-5 w-5 shrink-0"
        />
      ) : null}
      <span className="truncate">
        {ingredient.label} ×{ingredient.amount}
      </span>
    </span>
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
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="panel-section-title">{title}</p>
        </div>
      </div>

      {cards.length ? (
        <div className="flex flex-col">
          {cards.map((card) => {
            const outputItem = card.outputQualifiedItemId ? (itemLookup.get(card.outputQualifiedItemId) ?? null) : null
            const outputTexture = outputItem?.textureAssetName ? (textureStatesByAssetName[outputItem.textureAssetName] ?? null) : null

            return (
              <article
                key={card.key}
                className="grid grid-cols-[2.75rem_2fr_1fr_auto] items-center gap-3 border-b border-(--border-color)/50 py-2.5 transition-colors last:border-b-0 hover:bg-(--bg-hover)"
              >
                <div className="flex h-full items-center justify-center">
                  {outputItem ? (
                    <ItemSprite
                      item={outputItem}
                      textureState={outputTexture}
                      scale={getContainedItemSpriteScale(outputItem, 40, 1.8)}
                      className="h-10 w-10 shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem] text-xs font-semibold text-(--text-secondary)">
                      {card.title.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="dock-chip">{card.badge}</span>
                  <p className="mt-0.5 truncate text-sm font-bold text-(--text-primary)">{card.title}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--text-secondary)">{card.subtitle}</p>
                </div>
                <div className="min-w-0">
                  {card.ingredients.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {card.ingredients.map((ingredient) => {
                        const relatedItem = ingredient.qualifiedItemId ? (itemLookup.get(ingredient.qualifiedItemId) ?? null) : null
                        const textureState = relatedItem?.textureAssetName
                          ? (textureStatesByAssetName[relatedItem.textureAssetName] ?? null)
                          : null
                        return (
                          <IngredientPill
                            key={ingredient.key}
                            ingredient={ingredient}
                            relatedItem={relatedItem}
                            textureState={textureState}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-(--text-tertiary)">—</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="panel-empty-state mt-3">—</div>
      )}
    </section>
  )
}
