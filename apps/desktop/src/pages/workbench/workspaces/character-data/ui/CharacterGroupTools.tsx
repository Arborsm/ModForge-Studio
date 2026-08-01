import type { ReactNode } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { AssetValidationRail, type AssetIssue } from '@entities/asset-schema'
import type { CharacterAppearanceVariant, CharacterAssetPatchState } from '@entities/character'
import { useCharacterDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

function CharacterAssetTool({ title, state, onOpen }: { title: string; state: CharacterAssetPatchState; onOpen: () => void }) {
  const copy = useCharacterDataEditorCopy()
  return (
    <div className="character-asset-tool">
      <div className="character-tab-tool-status">
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <strong>{title}</strong>
        <span>{state.fromFile ?? state.assetTarget}</span>
        <span className={state.patchFound && state.fileInDraft ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
          {state.patchFound && state.fileInDraft ? copy.assets.patchFound : copy.assets.patchMissing}
        </span>
      </div>
      <button type="button" className="control-button" onClick={onOpen}>
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{copy.assets.openEditorAction}</span>
      </button>
    </div>
  )
}

/** Character-specific actions injected into the relevant schema tab. */
export function CharacterGroupTools({
  groupId,
  issues,
  portraitState,
  spriteState,
  variants,
  activeVariantKey,
  giftTasteEditor,
  onOpenPortrait,
  onOpenSprite,
  onSelectVariant,
  onSelectIssue,
}: {
  groupId: string
  issues: readonly AssetIssue[]
  portraitState: CharacterAssetPatchState | null
  spriteState: CharacterAssetPatchState | null
  variants: readonly CharacterAppearanceVariant[]
  activeVariantKey: string | null
  giftTasteEditor: ReactNode
  onOpenPortrait: () => void
  onOpenSprite: () => void
  onSelectVariant: (key: string) => void
  onSelectIssue: (issue: AssetIssue) => void
}) {
  const copy = useCharacterDataEditorCopy()

  if (groupId === 'core') {
    return issues.length > 0 ? <AssetValidationRail issues={issues} onSelectIssue={onSelectIssue} /> : null
  }

  if (groupId === 'festival') {
    return giftTasteEditor
  }

  if (groupId !== 'render') return null

  const resolvedVariantKey = variants.find((variant) => variant.key === activeVariantKey)?.key ?? variants[0]?.key ?? null
  return (
    <div className="character-tab-tools">
      {variants.length > 1 ? (
        <div className="character-variant-tools">
          <span className="character-tab-tools-title">{copy.preview.variantLabel}</span>
          <div className="character-preview-variants" role="group" aria-label={copy.preview.variantLabel}>
            {variants.map((variant) => (
              <button
                key={variant.key}
                type="button"
                aria-pressed={variant.key === resolvedVariantKey}
                className={cx('asset-editor-entry-chip', variant.key === resolvedVariantKey && 'is-active')}
                onClick={() => onSelectVariant(variant.key)}
              >
                {variant.kind === 'default' ? copy.preview.variantDefault : variant.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="character-asset-tools">
        {portraitState !== null ? (
          <CharacterAssetTool title={copy.assets.portraitTitle} state={portraitState} onOpen={onOpenPortrait} />
        ) : null}
        {spriteState !== null ? <CharacterAssetTool title={copy.assets.spriteTitle} state={spriteState} onOpen={onOpenSprite} /> : null}
      </div>
    </div>
  )
}
