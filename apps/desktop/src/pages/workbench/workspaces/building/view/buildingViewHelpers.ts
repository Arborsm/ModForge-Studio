import type { CSSProperties } from 'react'
import type { BuildingWorkspaceEntry } from '@entities/building'
import type { BuildingsPanelCopy, ThemeMode } from '@locales/api'
import type { MapDocument } from '@entities/map'
import { rgbaFromHex } from '@shared/lib/color/rgbaFromHex'

/**
 * Same editor backdrop as MapViewport so body + map read as one continuous canvas.
 */
export function buildBuildingCanvasBackdropStyle(theme: ThemeMode, accentColor: string): CSSProperties {
  if (theme === 'light') {
    return {
      backgroundColor: 'var(--bg-viewport)',
      backgroundImage: [
        `linear-gradient(${rgbaFromHex(accentColor, 0.15)} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.15)} 1px, transparent 1px)`,
        `linear-gradient(${rgbaFromHex(accentColor, 0.04)} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.04)} 1px, transparent 1px)`,
      ].join(', '),
      backgroundSize: ['6.25rem 6.25rem', '6.25rem 6.25rem', '1.25rem 1.25rem', '1.25rem 1.25rem'].join(', '),
      backgroundPosition: ['-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem'].join(', '),
    }
  }

  return {
    backgroundColor: 'var(--bg-viewport)',
    backgroundImage: [
      `linear-gradient(${rgbaFromHex(accentColor, 0.16)} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.16)} 1px, transparent 1px)`,
      `linear-gradient(${rgbaFromHex(accentColor, 0.05)} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.05)} 1px, transparent 1px)`,
    ].join(', '),
    backgroundSize: ['6.25rem 6.25rem', '6.25rem 6.25rem', '1.25rem 1.25rem', '1.25rem 1.25rem'].join(', '),
    backgroundPosition: ['-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem'].join(', '),
  }
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
