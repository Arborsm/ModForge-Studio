import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Plus, Trash2 } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { MapDocument, MapTileset, MapTilesetAnimationFrame } from '@entities/map'
import { resolveTilesetImagePath } from '@entities/map/lib/assets'
import { loadImage } from '@entities/map/ui/mapViewportHelpers'

const THUMB_SCALE = 3

type AnimationFrameEditorProps = {
  /** Render document with loadable tileset imagePath values (data URLs). */
  renderDocument: MapDocument
  /** The tileset the animated tile belongs to. */
  tileset: MapTileset
  /** Tileset-local tile index of the animated tile. */
  tileId: number
  /** Current animation frames. */
  frames: MapTilesetAnimationFrame[]
  /** Locale used for tileset image resolution. */
  locale: LocaleCode
  /** Game root used to resolve dynamically referenced vanilla sheets. */
  gameRootPath?: string | null
  /** Commits the next frame list; the parent owns the document update and merge key. */
  onChange: (frames: MapTilesetAnimationFrame[]) => void
}

/**
 * Visual animation frame editor: each frame is a card with a tile thumbnail
 * (cropped from the sheet image at 3x), a duration input, and a delete button.
 * A live preview above the frame strip plays the animation loop, cycling
 * frames at their declared durations. The tileId input is retained for
 * advanced users but the primary interaction is visual.
 */
export function AnimationFrameEditor({
  renderDocument,
  tileset,
  tileId,
  frames,
  locale,
  gameRootPath = null,
  onChange,
}: AnimationFrameEditorProps) {
  const copy = useMapAuthoringCopy().assetEditor
  // The loaded sheet image element, reused for every thumbnail crop. Stored in
  // a ref so the thumbnail effect can draw synchronously without waiting for
  // a per-render `new Image()` load (which is unreliable even for data URLs).
  const imageRef = useRef<HTMLImageElement | null>(null)
  // Whether the sheet image has loaded (drives thumbnail/preview visibility).
  const [imageReady, setImageReady] = useState(false)
  // Pre-rendered thumbnail data URLs keyed by tile id, produced asynchronously
  // from the loaded sheet image so render never blocks on canvas rasterization.
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({})
  const [playing, setPlaying] = useState(true)
  const [currentFrame, setCurrentFrame] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the tileset image once; store the HTMLImageElement for thumbnail crops.
  useEffect(() => {
    const imagePath = resolveTilesetImagePath(renderDocument, tileset, gameRootPath)
    if (!imagePath) {
      imageRef.current = null
      setImageReady(false)
      setThumbUrls({})
      return
    }
    let cancelled = false
    void loadImage(imagePath, locale, (failedPath) => `Failed to load tileset image: ${failedPath}`)
      .then((image) => {
        if (cancelled) return
        imageRef.current = image
        setImageReady(true)
      })
      .catch(() => {
        if (cancelled) return
        imageRef.current = null
        setImageReady(false)
        setThumbUrls({})
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale, renderDocument, tileset])

  // Collect the unique tile ids that need thumbnails (frame tiles + the base
  // tile id for the "add frame" default). Recomputed when frames or tileId change.
  const neededTileIds = useMemo(() => {
    const ids = new Set<number>(frames.map((frame) => frame.tileId))
    ids.add(tileId)
    return [...ids]
  }, [frames, tileId])

  // Pre-render thumbnails asynchronously from the loaded sheet image. Each
  // unique tile id is cropped once at THUMB_SCALE and cached as a data URL;
  // the effect re-runs only when the image or the needed tile-id set changes.
  useEffect(() => {
    if (!imageReady || !imageRef.current) {
      setThumbUrls({})
      return
    }
    let cancelled = false
    const image = imageRef.current
    const spacing = tileset.spacing ?? 0
    const margin = tileset.margin ?? 0
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = tileset.tileWidth * THUMB_SCALE
    canvas.height = tileset.tileHeight * THUMB_SCALE
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    const next: Record<number, string> = {}
    for (const frameTileId of neededTileIds) {
      if (cancelled) return
      if (frameTileId < 0 || frameTileId >= tileset.tileCount) continue
      const sourceX = margin + (frameTileId % tileset.columns) * (tileset.tileWidth + spacing)
      const sourceY = margin + Math.floor(frameTileId / tileset.columns) * (tileset.tileHeight + spacing)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, sourceX, sourceY, tileset.tileWidth, tileset.tileHeight, 0, 0, canvas.width, canvas.height)
      next[frameTileId] = canvas.toDataURL('image/png')
    }
    if (!cancelled) setThumbUrls(next)
    return () => {
      cancelled = true
    }
  }, [imageReady, neededTileIds, tileset])

  // Playback loop: advance currentFrame based on the current frame's duration.
  useEffect(() => {
    if (!playing || frames.length === 0) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    const frame = frames[currentFrame]
    if (!frame) {
      setCurrentFrame(0)
      return
    }
    timerRef.current = setTimeout(
      () => {
        setCurrentFrame((prev) => (prev + 1) % frames.length)
      },
      Math.max(1, frame.duration),
    )
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [playing, frames, currentFrame])

  // Reset to frame 0 when frames change identity (new edit).
  useEffect(() => {
    setCurrentFrame(0)
  }, [frames.length])

  function updateFrame(index: number, updates: Partial<MapTilesetAnimationFrame>) {
    const next = frames.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...updates } : entry))
    onChange(next)
  }

  function removeFrame(index: number) {
    onChange(frames.filter((_, frameIndex) => frameIndex !== index))
  }

  function addFrame() {
    onChange([...frames, { tileId, duration: 100 }])
  }

  const hasMixedDurations = new Set(frames.map((frame) => frame.duration)).size > 1
  const hasInvalidTileId = frames.some((frame) => frame.tileId < 0 || frame.tileId >= tileset.tileCount)
  const previewFrame = frames[currentFrame] ?? frames[0]

  return (
    <div className="map-asset-animation-editor">
      <header>
        <strong>{copy.animation}</strong>
        <span>{copy.animationTile(tileId)}</span>
        {frames.length > 0 ? (
          <button
            type="button"
            className="icon-button"
            aria-label={playing ? copy.animationPause : copy.animationPlay}
            title={playing ? copy.animationPause : copy.animationPlay}
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </header>
      {/* Live playback preview */}
      {previewFrame && imageReady ? (
        <div className="map-asset-animation-preview">
          <img src={thumbUrls[previewFrame.tileId] ?? undefined} alt={copy.frameTile} draggable={false} />
          <span className="map-asset-animation-preview-meta">
            {currentFrame + 1}/{frames.length} · {previewFrame.duration}ms
          </span>
        </div>
      ) : null}
      {hasMixedDurations ? <p className="is-warning">{copy.animationDurationWarning}</p> : null}
      {hasInvalidTileId ? <p className="is-warning">{copy.cellAnimationInvalidTile}</p> : null}
      {/* Frame strip */}
      <div className="map-asset-animation-frames">
        {frames.map((frame, index) => (
          <div key={index} className={cx('map-asset-animation-frame', currentFrame === index && playing && 'is-playing')}>
            <div className="map-asset-animation-frame-thumb">
              {imageReady && thumbUrls[frame.tileId] ? (
                <img src={thumbUrls[frame.tileId]} alt={copy.frameTile} draggable={false} />
              ) : (
                <span className="map-asset-tile-ref-ph" aria-hidden="true" />
              )}
            </div>
            <label className="map-asset-animation-frame-id">
              <span>{copy.frameTile}</span>
              <input
                type="number"
                min={0}
                max={tileset.tileCount - 1}
                value={frame.tileId}
                onChange={(event) => updateFrame(index, { tileId: Number(event.target.value) })}
              />
            </label>
            <label className="map-asset-animation-frame-duration">
              <span>{copy.frameDuration}</span>
              <input
                type="number"
                min={1}
                value={frame.duration}
                onChange={(event) => updateFrame(index, { duration: Math.max(1, Number(event.target.value)) })}
              />
            </label>
            <button
              type="button"
              className="icon-button is-danger"
              aria-label={copy.removeFrame}
              title={copy.removeFrame}
              onClick={() => removeFrame(index)}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="control-button" onClick={addFrame}>
        <Plus className="h-3.5 w-3.5" />
        {copy.addFrame}
      </button>
    </div>
  )
}
