import { Image as ImageIcon } from 'lucide-react'
import { AssetValidationRail, type AssetIssue, type AssetTexturePatchState } from '@entities/asset-schema'
import { useItemDataEditorCopy } from '@locales/provider'

/** Item-specific actions injected into the relevant schema tab. */
export function ItemGroupTools({
  groupId,
  issues,
  texturePatchState,
  textureResolved,
  onOpenTextureEditor,
  onSelectIssue,
}: {
  groupId: string
  issues: readonly AssetIssue[]
  texturePatchState: AssetTexturePatchState | null
  textureResolved: boolean
  onOpenTextureEditor: () => void
  onSelectIssue: (issue: AssetIssue) => void
}) {
  const copy = useItemDataEditorCopy()
  if (groupId === 'basics') {
    return issues.length > 0 ? <AssetValidationRail issues={issues} onSelectIssue={onSelectIssue} /> : null
  }
  if (groupId !== 'sprite' || texturePatchState === null) return null

  const status = texturePatchState.patchFound
    ? copy.texture.patchFound
    : textureResolved
      ? copy.texture.vanillaSheet
      : copy.texture.patchMissing
  return (
    <div className="item-tab-tools">
      <div className="item-tab-tool-status">
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{texturePatchState.assetTarget}</span>
        <span className={texturePatchState.patchFound || textureResolved ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
          {status}
        </span>
      </div>
      <button type="button" className="control-button" onClick={onOpenTextureEditor}>
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{copy.texture.openEditorAction}</span>
      </button>
    </div>
  )
}
