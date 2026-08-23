import { useEffect, useRef, useState } from 'react'
import type { MapDocument, MapTileset } from '@entities/map'
import { resolveTilesetImagePath } from '@entities/map/lib/assets'
import { loadImage } from '@entities/map/ui/mapViewportHelpers'
import type { LocaleCode } from '@locales/api'
import { appEvent } from '@platform/observability'
import type { AnimationGroup } from '@entities/map/lib/animationGroups'

/**
 * Renders a live-cycling animated tile preview. Loads the tileset image,
 * crops each frame region, and cycles through them at the group's duration.
 * Used in animation lists so users can see animations actually playing.
 */
export function AnimatedTilePreview({
  document,
  tileset,
  group,
  locale,
  gameRootPath,
  scale = 1,
  playing = true,
}: {
  document: MapDocument
  tileset: MapTileset
  group: AnimationGroup
  locale: LocaleCode
  gameRootPath: string | null
  scale?: number
  playing?: boolean
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const columns = tileset.columns
  const spacing = tileset.spacing ?? 0
  const margin = tileset.margin ?? 0

  // Load tileset image.
  useEffect(() => {
    const imagePath = resolveTilesetImagePath(document, tileset, gameRootPath)
    if (!imagePath) {
      setImage(null)
      return
    }
    let cancelled = false
    void loadImage(imagePath, locale, (p) => `Failed: ${p}`)
      .then((img) => {
        if (!cancelled) setImage(img)
      })
      .catch((error) => {
        if (!cancelled) {
          appEvent('warning', 'Failed to load animated tile preview')
            .error(error)
            .context({ source: 'map-animation-preview', operation: 'load-image', path: imagePath })
            .emit({ notify: false })
          setImage(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [document, tileset, gameRootPath, locale])

  // Playback loop.
  useEffect(() => {
    if (!playing || !image || group.frameCount <= 1) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(
      () => {
        setFrameIndex((p) => (p + 1) % group.frameCount)
      },
      Math.max(1, group.duration),
    )
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [playing, image, group.frameCount, group.duration, frameIndex])

  // Reset frame when group changes.
  useEffect(() => {
    setFrameIndex(0)
  }, [group.ownerTileId, group.frameCount])

  if (!image) return <i className="map-anim-preview-loading" aria-hidden="true" />

  const origin = group.frameOrigins[frameIndex] ?? group.frameOrigins[0]
  const sourceX = margin + (origin % columns) * (tileset.tileWidth + spacing)
  const sourceY = margin + Math.floor(origin / columns) * (tileset.tileHeight + spacing)
  const canvasW = tileset.tileWidth * group.width * scale
  const canvasH = tileset.tileHeight * group.height * scale

  // Use background positioning to crop the region — no canvas needed per frame.
  const bgScale = scale
  const sheetOffsetX = -sourceX * bgScale
  const sheetOffsetY = -sourceY * bgScale

  return (
    <i
      className="map-anim-preview"
      style={{
        width: canvasW,
        height: canvasH,
        backgroundImage: `url(${image.src})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${sheetOffsetX}px ${sheetOffsetY}px`,
        backgroundSize: `${image.naturalWidth * bgScale}px ${image.naturalHeight * bgScale}px`,
        imageRendering: 'pixelated',
      }}
      aria-hidden="true"
    />
  )
}
