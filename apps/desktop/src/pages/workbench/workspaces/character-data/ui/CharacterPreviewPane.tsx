/**
 * Right pane of the character authoring editor: what the entry looks like in
 * game, plus everything validation has to say about it.
 *
 * The preview is driven by the entry currently staged in the draft, so an
 * author sees a `TextureName` or `Appearance` edit take effect without saving.
 * Textures resolve against the connected game directory; when a variant points
 * at a texture the patch only adds virtually, the sprite stays empty and the
 * validation rail is the thing that explains why.
 */

import { useEffect, useState } from 'react'
import { getActorSpriteFrameHeight } from '@entities/event'
import { AssetValidationRail, type AssetIssue } from '@entities/asset-schema'
import {
  CharacterBreathingCanvas,
  CharacterWalkCycleGrid,
  EMPTY_CHARACTER_VISUAL_ASSET_STATE,
  loadCharacterImageState,
  resolveCharacterSpriteMetrics,
  resolveCharacterVariantPaths,
  type CharacterAppearanceVariant,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '@entities/character'
import type { LocaleCode } from '@locales'
import { useCharacterDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

/** Loads the sprite and portrait sheets of the selected appearance variant. */
function useVariantAssets(
  variant: CharacterAppearanceVariant | null,
  gameRootPath: string | null,
  locale: LocaleCode,
): CharacterVisualAssetState {
  const [state, setState] = useState<CharacterVisualAssetState>(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
  const { spritePath, portraitPath } = resolveCharacterVariantPaths(gameRootPath, variant)

  useEffect(() => {
    if (!spritePath && !portraitPath) {
      setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
      return
    }

    let cancelled = false
    setState((current) => ({ ...current, loading: true }))

    void Promise.all([loadCharacterImageState(spritePath, locale), loadCharacterImageState(portraitPath, locale)])
      .then(([sprite, portrait]) => {
        if (cancelled) {
          return
        }
        setState({
          ...EMPTY_CHARACTER_VISUAL_ASSET_STATE,
          loading: false,
          spritePath: sprite.path,
          spriteUrl: sprite.url,
          spriteSheetWidth: sprite.width,
          spriteSheetHeight: sprite.height,
          portraitPath: portrait.path,
          portraitUrl: portrait.url,
          portraitSheetWidth: portrait.width,
          portraitSheetHeight: portrait.height,
          portraitOriginalWidth: portrait.originalWidth,
          portraitOriginalHeight: portrait.originalHeight,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
        }
      })

    return () => {
      cancelled = true
    }
  }, [spritePath, portraitPath, locale])

  return state
}

export function CharacterPreviewPane({
  character,
  issues,
  gameRootPath,
  locale,
  onSelectIssue,
}: {
  character: CharacterWorkspaceEntry | null
  issues: AssetIssue[]
  gameRootPath: string | null
  locale: LocaleCode
  onSelectIssue: (issue: AssetIssue) => void
}) {
  const copy = useCharacterDataEditorCopy()
  const [variantKey, setVariantKey] = useState<string | null>(null)
  const variants = character?.variants ?? []
  const activeVariant = variants.find((variant) => variant.key === variantKey) ?? variants[0] ?? null
  const assetState = useVariantAssets(activeVariant, gameRootPath, locale)
  const metrics = resolveCharacterSpriteMetrics(character, assetState, character ? getActorSpriteFrameHeight(character.internalName) : 32)

  return (
    <aside className="asset-preview-pane">
      {character === null ? (
        <div className="asset-editor-card">
          <p className="asset-field-hint">{copy.preview.empty}</p>
        </div>
      ) : (
        <>
          <section className="asset-editor-card">
            <div className="asset-preview-head">
              <span className="asset-editor-card-title">{copy.preview.title}</span>
              <span className="asset-editor-badge is-ok">{`${metrics.frameWidth}x${metrics.frameHeight}`}</span>
            </div>

            {variants.length > 1 ? (
              <div className="character-preview-variants">
                {variants.map((variant) => (
                  <button
                    key={variant.key}
                    type="button"
                    aria-pressed={variant.key === activeVariant?.key}
                    className={cx('asset-editor-entry-chip', variant.key === activeVariant?.key && 'is-active')}
                    onClick={() => setVariantKey(variant.key)}
                  >
                    {variant.kind === 'default' ? copy.preview.variantDefault : variant.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="character-preview-canvas">
              <CharacterBreathingCanvas
                character={character}
                activeVariant={activeVariant}
                assetState={assetState}
                metrics={metrics}
                scale={4}
              />
            </div>

            <p className="asset-editor-asset-target">{activeVariant?.spritePathLabel ?? character.spriteAssetName}</p>
          </section>

          <section className="asset-editor-card">
            <div className="asset-editor-card-title">{copy.preview.walkingTitle}</div>
            <CharacterWalkCycleGrid character={character} assetState={assetState} metrics={metrics} className="character-preview-walk" />
          </section>
        </>
      )}

      <AssetValidationRail issues={issues} onSelectIssue={onSelectIssue} />
    </aside>
  )
}
