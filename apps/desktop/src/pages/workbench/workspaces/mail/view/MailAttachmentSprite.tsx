import { useMemo } from 'react'
import { Coins } from 'lucide-react'
import { ItemSprite } from '@entities/item'
import type { MailAttachment } from '../entities/mail'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'

type MailAttachmentSpriteProps = {
  attachment: MailAttachment
  /** Scale multiplier for the sprite, default 2 (32px from 16px source). */
  scale?: number
}

/**
 * Renders one mail attachment in game style: item sprites with count badges,
 * coin icon for money, fallback chips for non-visual types.
 */
export function MailAttachmentSprite({ attachment, scale = 2 }: MailAttachmentSpriteProps) {
  const workspace = useMailWorkspaceContext()

  const label = useMemo(() => {
    switch (attachment.kind) {
      case 'id':
      case 'object':
        return attachment.items.map((item) => (item.count === null ? item.itemId : `${item.itemId}×${item.count}`)).join(', ')
      case 'bigobject':
      case 'furniture':
        return attachment.ids.join(', ')
      case 'tools':
        return attachment.tools.join(', ')
      case 'money':
        return attachment.max === null ? `${attachment.min ?? 0}g` : `${attachment.min ?? 0}-${attachment.max}g`
      case 'quest':
        return `Quest: ${attachment.questId}`
      case 'cookingRecipe':
        return attachment.recipeKey ? `Recipe: ${attachment.recipeKey}` : 'Cooking Recipe'
      case 'craftingRecipe':
        return `Recipe: ${attachment.recipeKey}`
      case 'conversationTopic':
        return `Topic: ${attachment.topicId}`
      case 'specialOrder':
        return `Order: ${attachment.orderId}`
      case 'itemRecovery':
        return 'Item Recovery'
      case 'unknown':
        return attachment.body
    }
  }, [attachment])

  // Render id/object attachments as item sprites with count badges
  if (attachment.kind === 'id' || attachment.kind === 'object') {
    const springobjects = workspace.itemTextures.springobjects
    if (springobjects && !springobjects.loading && springobjects.url && attachment.items.length > 0) {
      return (
        <div className="flex items-center gap-1.5">
          {attachment.items.map((item, index) => {
            const itemId = Number.parseInt(item.itemId, 10)
            if (!Number.isFinite(itemId)) {
              return (
                <div
                  key={index}
                  className="border-border-subtle bg-surface-panel text-text-primary flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-sm"
                  style={{ minHeight: `${16 * scale}px` }}
                >
                  <span>{item.itemId}</span>
                </div>
              )
            }

            return (
              <div key={index} className="relative inline-flex">
                <ItemSprite
                  item={{
                    displayName: item.itemId,
                    kind: 'object',
                    textureAssetName: 'Maps\\springobjects',
                    spriteIndex: itemId,
                    menuSpriteIndex: null,
                    spriteWidth: 16,
                    spriteHeight: 16,
                    apparelStats: null,
                  }}
                  textureState={springobjects}
                  scale={scale}
                  className="border-border-subtle rounded border shadow-sm"
                  fallbackClassName="text-xs"
                />
                {item.count !== null && item.count !== 1 ? (
                  <div
                    className="text-2xs border-border-subtle bg-surface-panel text-text-primary absolute right-0 bottom-0 flex items-center justify-center rounded-tl rounded-br border-t border-l px-1 py-0.5 font-bold shadow-sm"
                    style={{ minWidth: '1.25rem' }}
                  >
                    {item.count}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )
    }
  }

  // Money attachments with coin icon
  if (attachment.kind === 'money') {
    return (
      <div
        className="border-border-subtle bg-surface-panel text-text-primary flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-sm"
        style={{ minHeight: `${16 * scale}px` }}
      >
        <Coins className="text-accent h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </div>
    )
  }

  // Fallback chip for all other attachment types
  return (
    <div
      className="border-border-subtle bg-surface-panel text-text-primary flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-sm"
      style={{ minHeight: `${16 * scale}px` }}
    >
      <span>{label}</span>
    </div>
  )
}
