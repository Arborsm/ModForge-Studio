import { useEffect, useState, type CSSProperties } from 'react'
import { enumLabelKey, matchEnumValue, type AssetEntryDraft } from '@entities/asset-schema'
import {
  AGE_VALUES,
  CharacterBreathingCanvas,
  CharacterWalkCycleGrid,
  EMPTY_CHARACTER_VISUAL_ASSET_STATE,
  GENDER_VALUES,
  loadCharacterImageState,
  resolveCharacterSpriteMetrics,
  resolveCharacterVariantPaths,
  SEASON_VALUES,
  type CharacterAppearanceVariant,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '@entities/character'
import { getActorSpriteFrameHeight } from '@entities/event'
import type { LocaleCode } from '@locales'
import { useAssetAuthoringCopy, useCharacterDataEditorCopy } from '@locales/provider'

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
        if (!cancelled) {
          setState({
            ...EMPTY_CHARACTER_VISUAL_ASSET_STATE,
            loading: false,
            spritePath: sprite.path,
            spriteUrl: sprite.url,
            spriteSheetWidth: sprite.width,
            spriteSheetHeight: sprite.height,
            spriteImage: sprite.image ?? null,
            portraitPath: portrait.path,
            portraitUrl: portrait.url,
            portraitSheetWidth: portrait.width,
            portraitSheetHeight: portrait.height,
            portraitOriginalWidth: portrait.originalWidth,
            portraitOriginalHeight: portrait.originalHeight,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY_CHARACTER_VISUAL_ASSET_STATE)
      })

    return () => {
      cancelled = true
    }
  }, [spritePath, portraitPath, locale])

  return state
}

function useEnumLabel() {
  const authoring = useAssetAuthoringCopy()
  return (catalog: string, values: readonly string[], raw: unknown): string | null => {
    if (typeof raw !== 'string' || raw === '') return null
    const canonical = matchEnumValue(values, raw)
    return canonical === null ? raw : (authoring.enums[enumLabelKey(catalog, canonical)] ?? canonical)
  }
}

function CharacterSummary({ draft }: { draft: AssetEntryDraft }) {
  const copy = useCharacterDataEditorCopy()
  const enumLabel = useEnumLabel()
  const fields = draft.fields
  const birthDay = typeof fields['BirthDay'] === 'number' ? fields['BirthDay'] : undefined
  const season = enumLabel('character.season', SEASON_VALUES, fields['BirthSeason'])
  const identity = [
    enumLabel('character.gender', GENDER_VALUES, fields['Gender']),
    enumLabel('character.age', AGE_VALUES, fields['Age']),
  ].filter((part): part is string => part !== null)
  const rows = [
    { label: copy.summary.identity, value: identity.join(' · ') || null },
    {
      label: copy.summary.birthday,
      value: season !== null || birthDay !== undefined ? [season, birthDay].filter(Boolean).join(' ') : null,
    },
    { label: copy.summary.region, value: typeof fields['HomeRegion'] === 'string' ? fields['HomeRegion'] : null },
    {
      label: copy.summary.romance,
      value: fields['CanBeRomanced'] === true ? copy.summary.romanceYes : fields['CanBeRomanced'] === false ? copy.summary.romanceNo : null,
    },
  ]

  return (
    <dl className="asset-editor-summary-list character-preview-summary">
      {rows.map((row) => (
        <div key={row.label} className="asset-editor-summary-chip">
          <dt>{row.label}</dt>
          <dd className={row.value === null ? 'is-unset' : undefined}>{row.value ?? copy.summary.notSet}</dd>
        </div>
      ))}
    </dl>
  )
}

function portraitFrameStyle(state: CharacterVisualAssetState): CSSProperties | undefined {
  if (!state.portraitUrl || !state.portraitSheetWidth || !state.portraitSheetHeight) return undefined
  const resolutionScale = state.portraitOriginalWidth ? state.portraitSheetWidth / state.portraitOriginalWidth : 1
  const sourceFrame = 64 * resolutionScale
  const scale = 80 / sourceFrame
  return {
    width: '80px',
    height: '80px',
    backgroundImage: `url("${state.portraitUrl}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    backgroundSize: `${state.portraitSheetWidth * scale}px ${state.portraitSheetHeight * scale}px`,
    imageRendering: 'pixelated',
  }
}

/** Pure live result preview for the selected character. */
export function CharacterPreviewPane({
  character,
  draft,
  activeVariantKey,
  gameRootPath,
  locale,
}: {
  character: CharacterWorkspaceEntry | null
  draft: AssetEntryDraft | null
  activeVariantKey: string | null
  gameRootPath: string | null
  locale: LocaleCode
}) {
  const copy = useCharacterDataEditorCopy()
  const variants = character?.variants ?? []
  const activeVariant = variants.find((variant) => variant.key === activeVariantKey) ?? variants[0] ?? null
  const assetState = useVariantAssets(activeVariant, gameRootPath, locale)
  const metrics = resolveCharacterSpriteMetrics(character, assetState, character ? getActorSpriteFrameHeight(character.internalName) : 32)
  const portraitStyle = portraitFrameStyle(assetState)

  return (
    <aside className="asset-preview-pane character-preview-pane">
      {character === null ? (
        <p className="asset-field-hint">{copy.preview.empty}</p>
      ) : (
        <section className="character-preview-content">
          <div className="asset-preview-head">
            <span className="asset-editor-card-title">{copy.preview.title}</span>
            <span className="asset-editor-badge is-ok">{`${metrics.frameWidth}x${metrics.frameHeight}`}</span>
          </div>

          <div className="character-preview-stage">
            <CharacterBreathingCanvas
              character={character}
              activeVariant={activeVariant}
              assetState={assetState}
              metrics={metrics}
              scale={4}
            />
          </div>

          <div className="character-preview-secondary">
            <div className="character-preview-portrait">
              <span className="character-preview-section-title">{copy.preview.portraitTitle}</span>
              {portraitStyle ? (
                <span className="character-preview-portrait-frame" style={portraitStyle} />
              ) : (
                <span className="asset-field-hint">{copy.preview.empty}</span>
              )}
            </div>
            <div className="character-preview-walk-wrap">
              <span className="character-preview-section-title">{copy.preview.walkingTitle}</span>
              <CharacterWalkCycleGrid character={character} assetState={assetState} metrics={metrics} className="character-preview-walk" />
            </div>
          </div>

          {draft !== null ? <CharacterSummary draft={draft} /> : null}
          <p className="asset-editor-asset-target">{activeVariant?.spritePathLabel ?? character.spriteAssetName}</p>
        </section>
      )}
    </aside>
  )
}
