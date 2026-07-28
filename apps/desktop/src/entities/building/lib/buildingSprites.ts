/**
 * Sprite assembly for building textures.
 *
 * One implementation shared by the codex preview and the authoring preview, so
 * a building looks identical in both: the same source rectangle resolution and
 * the same background-position maths against the loaded sheet.
 */

import type { CSSProperties } from 'react'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, ResolvedBuildingRectangle } from '../model/buildingIndex'

/** Absolutely positioned sprite layer cut out of a loaded texture sheet. */
export function buildAbsoluteSpriteLayerStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
}): CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX}px -${sourceY}px`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    imageRendering: 'pixelated',
  }
}

/**
 * The rectangle a building actually draws from.
 *
 * `SourceRect` is optional in `Data/Buildings`; when it is omitted the game
 * draws the whole texture, so the loaded sheet's own size stands in for it.
 */
export function getResolvedSourceRect(
  entry: Pick<BuildingWorkspaceEntry, 'sourceRect'>,
  textureState: BuildingTextureAssetState | null,
): ResolvedBuildingRectangle | null {
  if (entry.sourceRect) {
    return entry.sourceRect
  }

  if (textureState?.width && textureState.height) {
    return {
      X: 0,
      Y: 0,
      Width: textureState.width,
      Height: textureState.height,
    }
  }

  return null
}
