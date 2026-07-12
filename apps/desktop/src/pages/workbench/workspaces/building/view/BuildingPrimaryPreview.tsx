import { useEffect, useRef, useState } from 'react'
import { useBuildingsCopy } from '@locales/provider'
import { MapViewport } from '@entities/map'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import type { LocaleCode, ViewportLabels, ThemeMode } from '@locales/api'
import type { MapDocument, ViewportWorldPoint } from '@entities/map'
import { cx } from '@shared/lib/helper'
import { buildAbsoluteSpriteLayerStyle, getResolvedSourceRect } from './buildingViewHelpers'

export type BuildingPrimaryPreviewProps = {
  building: BuildingWorkspaceEntry
  activeTextureState: BuildingTextureAssetState | null
  activeExteriorMapDocument: MapDocument | null
  activeExteriorMapMessage: string
  activeExteriorFocusPoint: ViewportWorldPoint | null
  activeExteriorMapPath: string | null
  locale: LocaleCode
  viewportLabels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  showGrid: boolean
  exteriorVisibleLayerIds: number[]
  exteriorVisibleObjectGroupIds: number[]
  /** Fallback fit box when the container has not been measured yet. */
  fitSize?: number
  /**
   * Fill the parent pane and auto-fit the sprite to the measured box.
   * Use for both dual body pane and solo body-only canvas.
   */
  fillContainer?: boolean
}

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

/** Building body sprite or exterior map viewport content. */
export function BuildingPrimaryPreview({
  building,
  activeTextureState,
  activeExteriorMapDocument,
  activeExteriorMapMessage,
  activeExteriorFocusPoint,
  locale,
  theme,
  accentColor,
  showGrid,
  exteriorVisibleLayerIds,
  exteriorVisibleObjectGroupIds,
  fitSize = 280,
  fillContainer = false,
}: BuildingPrimaryPreviewProps) {
  const copy = useBuildingsCopy()
  const isConstructible = building.sourceKind === 'constructible'
  const { containerRef, fitBox } = useContainerFitSize(fillContainer, fitSize)
  const sourceRect = getResolvedSourceRect(building, activeTextureState)
  const previewScale =
    sourceRect && sourceRect.Width > 0 && sourceRect.Height > 0
      ? Math.max(1, Math.min(12, Math.min(fitBox / sourceRect.Width, fitBox / sourceRect.Height)))
      : 1

  if (!isConstructible && activeExteriorMapDocument) {
    const map = (
      <div className="building-workspace-square-map">
        <MapViewport
          key={`${building.key}:${activeExteriorMapDocument.relativePath}`}
          locale={locale}
          mapDocument={activeExteriorMapDocument}
          visibleLayerIds={exteriorVisibleLayerIds}
          visibleObjectGroupIds={exteriorVisibleObjectGroupIds}
          theme={theme}
          accentColor={accentColor}
          showGrid={showGrid}
          showStatsChips={false}
          focusWorldPoint={activeExteriorFocusPoint}
        />
      </div>
    )
    return fillContainer ? map : <div className="building-workspace-square relative h-full min-h-64 w-full max-w-xl">{map}</div>
  }

  if (!isConstructible) {
    return <p className="px-4 text-center text-sm text-(--text-secondary)">{activeExteriorMapMessage || copy.noExteriorMap}</p>
  }

  const sprite =
    sourceRect && activeTextureState?.url && activeTextureState.width && activeTextureState.height ? (
      <div
        style={{
          ...buildAbsoluteSpriteLayerStyle({
            url: activeTextureState.url,
            sheetWidth: activeTextureState.width,
            sheetHeight: activeTextureState.height,
            sourceX: sourceRect.X,
            sourceY: sourceRect.Y,
            width: sourceRect.Width,
            height: sourceRect.Height,
          }),
          transform: `scale(${previewScale})`,
          transformOrigin: 'center center',
        }}
      />
    ) : (
      <p className="text-sm text-(--text-secondary)">{copy.noTexture}</p>
    )

  return (
    <div
      ref={containerRef}
      className={cx(
        fillContainer ? 'building-workspace-square-inner' : 'relative flex items-center justify-center',
        !fillContainer && 'h-full w-full',
      )}
    >
      {sprite}
      {activeTextureState?.loading ? <ImageSkeleton overlay className="building-primary-skeleton" rounded={false} /> : null}
    </div>
  )
}
