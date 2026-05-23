import { useItemsCopy } from '@locales/localeContext'
import { getContainedItemSpriteScale, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../../../workspaces/item'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { ItemSprite } from '../../../workspaces/item'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'

type ItemInspectorPanelProps = {
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

export function ItemInspectorPanel({ noneLabel, item, textureState }: ItemInspectorPanelProps) {
  const copy = useItemsCopy()
  return (
    <PanelFrame title={copy.inspectorTitle} subtitle={copy.inspectorSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!item ? (
          <PanelEmptyState>{copy.inspectorEmpty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection variant="accent">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-panel)]">
                  <ItemSprite
                    item={item}
                    textureState={textureState}
                    scale={getContainedItemSpriteScale(item, 48, 1.8)}
                    className="h-12 w-12 rounded-2xl"
                  />
                </div>
                <div className="min-w-0">
                  <span className="dock-chip">{copy.kindLabels[item.kind]}</span>
                  <p className="mt-2 truncate text-base font-semibold text-[var(--text-primary)]">{item.displayName}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{item.qualifiedItemId}</p>
                </div>
              </div>
            </PanelSection>

            <PanelSection title={copy.basicsTitle} bodyClassName="space-y-2">
              {renderKv(copy.displayNameLabel, item.displayName)}
              {renderKv(copy.internalNameLabel, item.internalName)}
              {renderKv(copy.qualifiedIdLabel, item.qualifiedItemId)}
              {renderKv(copy.kindLabel, copy.kindLabels[item.kind])}
              {renderKv(copy.typeLabel, item.kindMetaLabel ?? noneLabel)}
              {renderKv(copy.priceLabel, String(item.price ?? item.salePrice ?? 0))}
              {renderKv(copy.edibilityLabel, item.edibility != null ? String(item.edibility) : noneLabel)}
            </PanelSection>

            <PanelSection title={copy.assetTitle} bodyClassName="space-y-2">
              {renderKv(copy.textureLabel, item.texturePathLabel)}
              {renderKv(copy.spriteIndexLabel, item.menuSpriteIndex != null ? String(item.menuSpriteIndex) : noneLabel)}
              {renderKv('Sprite', `${item.spriteWidth}x${item.spriteHeight}`)}
              {renderKv(
                copy.textureSizeLabel,
                textureState?.width && textureState.height ? `${textureState.width}x${textureState.height}` : noneLabel,
              )}
            </PanelSection>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
