import type { ItemsPanelCopy } from '../../../lib/editor-shell'
import { getContainedItemSpriteScale, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../../../lib/app/itemWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'
import { ItemSprite } from '../../ItemSprite'

type ItemInspectorPanelProps = {
  copy: ItemsPanelCopy
  noneLabel: string
  item: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
}

function renderKv(label: string, value: string) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <span className="max-w-[55%] truncate text-right">{value}</span>
    </div>
  )
}

export function ItemInspectorPanel({ copy, noneLabel, item, textureState }: ItemInspectorPanelProps) {
  return (
    <PanelFrame title={copy.inspectorTitle} subtitle={copy.inspectorSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!item ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
            {copy.inspectorEmpty}
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-[var(--border-color)] bg-[linear-gradient(155deg,color-mix(in_srgb,var(--bg-panel)_96%,transparent),color-mix(in_srgb,var(--accent)_10%,var(--bg-panel-muted)))] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-panel)]">
                  <ItemSprite item={item} textureState={textureState} scale={getContainedItemSpriteScale(item, 48, 1.8)} className="h-12 w-12 rounded-2xl" />
                </div>
                <div className="min-w-0">
                  <span className="dock-chip">{copy.kindLabels[item.kind]}</span>
                  <p className="mt-2 truncate text-base font-semibold text-[var(--text-primary)]">{item.displayName}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{item.qualifiedItemId}</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{copy.basicsTitle}</p>
              <div className="mt-3 space-y-2">
                {renderKv(copy.displayNameLabel, item.displayName)}
                {renderKv(copy.internalNameLabel, item.internalName)}
                {renderKv(copy.qualifiedIdLabel, item.qualifiedItemId)}
                {renderKv(copy.kindLabel, copy.kindLabels[item.kind])}
                {renderKv(copy.typeLabel, item.kindMetaLabel ?? noneLabel)}
                {renderKv(copy.priceLabel, String(item.price ?? item.salePrice ?? 0))}
                {renderKv(copy.edibilityLabel, item.edibility != null ? String(item.edibility) : noneLabel)}
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{copy.assetTitle}</p>
              <div className="mt-3 space-y-2">
                {renderKv(copy.textureLabel, item.texturePathLabel)}
                {renderKv(copy.spriteIndexLabel, item.menuSpriteIndex != null ? String(item.menuSpriteIndex) : noneLabel)}
                {renderKv('Sprite', `${item.spriteWidth}x${item.spriteHeight}`)}
                {renderKv(
                  copy.textureSizeLabel,
                  textureState?.width && textureState.height ? `${textureState.width}x${textureState.height}` : noneLabel,
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
