import type { CSSProperties } from 'react'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import type { BuildingsPanelCopy } from '@locales/api'
import type { MapDocument } from '@entities/map'

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

export function getResolvedSourceRect(entry: BuildingWorkspaceEntry, textureState: BuildingTextureAssetState | null) {
  if (entry.sourceRect) {
    return entry.sourceRect
  }

  if (textureState?.width && textureState?.height) {
    return {
      X: 0,
      Y: 0,
      Width: textureState.width,
      Height: textureState.height,
    }
  }

  return null
}

export function getStageBadge(copy: BuildingsPanelCopy, stage: BuildingWorkspaceEntry, currentKey: string | null) {
  if (stage.key === currentKey) {
    return copy.currentBadge
  }

  if (stage.stageIndex === 0) {
    return copy.baseBadge
  }

  if (stage.stageIndex === stage.stageCount - 1) {
    return copy.finalBadge
  }

  return copy.upgradeBadge
}

export function getVisibleLayerIds(document: MapDocument | null) {
  return document?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []
}

export function getVisibleObjectGroupIds(document: MapDocument | null) {
  return document?.objectGroups.filter((group) => group.visible).map((group) => group.id) ?? []
}
