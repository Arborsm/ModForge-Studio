/**
 * The building body sprite, auto-fitted to whatever box it is given.
 *
 * Shared by the codex preview and the authoring preview so a building is
 * assembled exactly once: resolve the source rect, scale it to the measured
 * container, and cut it out of the loaded sheet. Callers own the surrounding
 * chrome (map viewport, footprint overlay, cards).
 *
 * When no sheet can be drawn a caller may still ask for an overlay box via
 * `overlayFallbackSource`, so the authoring footprint grid keeps working on a
 * building whose texture patch has not been added yet.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBuildingsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { buildAbsoluteSpriteLayerStyle, getResolvedSourceRect } from '../lib/buildingSprites'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../model/buildingIndex'

/** Largest zoom a single game pixel is blown up to before it reads as mush. */
const MAX_PREVIEW_SCALE = 12

/** Measures the pane so the sprite scales with it instead of a fixed guess. */
function useContainerFitSize(enabled: boolean, fallback: number) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [fitBox, setFitBox] = useState(fallback)

  useEffect(() => {
    if (!enabled) {
      setFitBox(fallback)
      return
    }

    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') {
      setFitBox(fallback)
      return
    }

    const update = (width: number, height: number) => {
      // Leave a little breathing room so the sprite never kisses the edges.
      const next = Math.floor(Math.min(width, height) * 0.88)
      if (next > 0) {
        setFitBox(next)
      }
    }

    update(element.clientWidth, element.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      update(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, fallback])

  return { containerRef, fitBox }
}

export type BuildingSpritePreviewProps = {
  building: Pick<BuildingWorkspaceEntry, 'sourceRect'>
  textureState: BuildingTextureAssetState | null
  /** Fallback fit box used until the container has been measured. */
  fitSize?: number
  /** Fill the parent pane and auto-fit the sprite to the measured box. */
  fillContainer?: boolean
  /**
   * Rendered on top of the scaled sprite, receiving the same transform box.
   * Used by the authoring preview for the footprint tile picker.
   */
  renderOverlay?: (geometry: BuildingSpriteGeometry) => ReactNode
  /**
   * Source-pixel box the overlay is laid over when no sheet can be drawn, so an
   * authoring surface can still work on a building whose texture patch does not
   * exist yet. Ignored once the sprite is drawable.
   */
  overlayFallbackSource?: { width: number; height: number } | null
}

/** Where the sprite ended up, so overlays can align with it exactly. */
export type BuildingSpriteGeometry = {
  sourceWidth: number
  sourceHeight: number
  scale: number
}

/** Building body sprite cut from the loaded texture and scaled to fit. */
export function BuildingSpritePreview({
  building,
  textureState,
  fitSize = 280,
  fillContainer = false,
  renderOverlay,
  overlayFallbackSource = null,
}: BuildingSpritePreviewProps) {
  const copy = useBuildingsCopy()
  const { containerRef, fitBox } = useContainerFitSize(fillContainer, fitSize)
  const sourceRect = getResolvedSourceRect(building, textureState)
  const drawable = sourceRect !== null && Boolean(textureState?.url) && Boolean(textureState?.width) && Boolean(textureState?.height)
  const fallbackSource =
    !drawable && overlayFallbackSource !== null && overlayFallbackSource.width > 0 && overlayFallbackSource.height > 0
      ? overlayFallbackSource
      : null

  const fitSource = drawable && sourceRect ? { width: sourceRect.Width, height: sourceRect.Height } : fallbackSource
  const scale =
    fitSource === null ? 1 : Math.max(1, Math.min(MAX_PREVIEW_SCALE, Math.min(fitBox / fitSource.width, fitBox / fitSource.height)))

  return (
    <div
      ref={containerRef}
      className={cx(
        fillContainer ? 'building-workspace-square-inner' : 'relative flex items-center justify-center',
        !fillContainer && 'h-full w-full',
      )}
    >
      {drawable && sourceRect && textureState?.url && textureState.width && textureState.height ? (
        <div
          className="building-sprite-stage"
          style={{
            ...buildAbsoluteSpriteLayerStyle({
              url: textureState.url,
              sheetWidth: textureState.width,
              sheetHeight: textureState.height,
              sourceX: sourceRect.X,
              sourceY: sourceRect.Y,
              width: sourceRect.Width,
              height: sourceRect.Height,
            }),
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {renderOverlay?.({ sourceWidth: sourceRect.Width, sourceHeight: sourceRect.Height, scale })}
        </div>
      ) : fallbackSource !== null ? (
        <div
          className="building-sprite-stage is-untextured"
          style={{
            width: `${fallbackSource.width}px`,
            height: `${fallbackSource.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {renderOverlay?.({ sourceWidth: fallbackSource.width, sourceHeight: fallbackSource.height, scale })}
        </div>
      ) : (
        <p className="text-sm text-(--text-secondary)">{copy.noTexture}</p>
      )}
      {textureState?.loading ? <ImageSkeleton overlay className="building-primary-skeleton" rounded={false} /> : null}
    </div>
  )
}
