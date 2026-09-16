import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Crosshair, Film, MousePointerClick, Pause, Play, Plus, Trash2 } from 'lucide-react'
import type { MapDocument, MapTileset } from '@entities/map'
import { MapTilesheetGallery } from '@entities/map/ui/MapTilesheetGallery'
import { SheetGridCanvas, type SheetGridCanvasHandle } from '@entities/map/ui/SheetGridCanvas'
import { resolveTilesetImagePath } from '@entities/map/lib/assets'
import { loadImage } from '@entities/map/ui/mapViewportHelpers'
import {
  extractAnimationGroups,
  expandAnimationGroup,
  removeAnimationGroupAnimations,
  type AnimationGroup,
  type TileRegion,
} from '@entities/map/lib/animationGroups'
import type { LocaleCode } from '@locales/api'
import { appEvent } from '@platform/observability'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogBody, DialogFooter, DialogAction, DialogHeader } from '@shared/ui/Dialog'
import { AnimatedTilePreview } from './AnimatedTilePreview'

type MapAnimationDialogProps = {
  open: boolean
  onClose: () => void
  document: MapDocument
  renderDocument: MapDocument
  locale: LocaleCode
  gameRootPath: string | null
  onUpdateTileset: (name: string, updater: (tileset: MapTileset) => MapTileset) => void
}

type EditorMode = 'select' | 'newAnimation' | 'addFrameRegion' | 'replaceFrameRegion'

/**
 * Two-stage dialog for managing tile animations with native multi-tile support.
 *
 * Stage 1 — sheet gallery: pick a tilesheet.
 *
 * Stage 2 — animation editor:
 *  - Left: {@link SheetGridCanvas} with wheel zoom, middle pan, magnifier.
 *    Animated tile regions are outlined; the selected group is highlighted.
 *  - Right: animation group list + frame editor.
 *
 * **Multi-tile animations**: each animation is a rectangular region of tiles
 * that play in sync. Each frame is also a rectangular region. The owner tile
 * (top-left) carries the animation in TMX format; other tiles in the region
 * get their own matching animations so they play together.
 */
export function MapAnimationDialog({
  open,
  onClose,
  document,
  renderDocument,
  locale,
  gameRootPath,
  onUpdateTileset,
}: MapAnimationDialogProps) {
  const copy = useMapAuthoringCopy().assetEditor
  const [selectedTilesetName, setSelectedTilesetName] = useState<string | null>(null)

  useEffect(() => {
    if (open) setSelectedTilesetName(null)
  }, [open])

  const selectedTileset = document.tilesets.find((tileset) => tileset.name === selectedTilesetName) ?? null

  return (
    <Dialog open={open} onClose={onClose} size="xl" labelledBy="map-animation-dialog-title">
      <DialogHeader
        id="map-animation-dialog-title"
        title={selectedTileset ? copy.animationTileEditorTitle(selectedTileset.name) : copy.animationDialogTitle}
        icon={<Film className="h-4 w-4" />}
        onClose={onClose}
        closeLabel={copy.animationDialogClose}
      />
      <DialogBody className="map-animation-dialog-body">
        {document.tilesets.length === 0 ? (
          <p className="map-animation-dialog-empty">{copy.animationListEmpty}</p>
        ) : selectedTileset ? (
          <AnimationEditor
            tileset={selectedTileset}
            renderDocument={renderDocument}
            locale={locale}
            gameRootPath={gameRootPath}
            onUpdateTileset={onUpdateTileset}
          />
        ) : (
          <MapTilesheetGallery
            document={renderDocument}
            locale={locale}
            gameRootPath={gameRootPath}
            attachedTilesets={document.tilesets}
            activeTilesetName={null}
            gameSheetsEnabled={false}
            onPickAttached={(name) => setSelectedTilesetName(name)}
            onPickGameSheet={null}
            onImport={null}
            onClose={() => {}}
          />
        )}
      </DialogBody>
      <DialogFooter>
        {selectedTileset ? (
          <DialogAction onClick={() => setSelectedTilesetName(null)}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {copy.animationDialogBack}
          </DialogAction>
        ) : null}
        <DialogAction tone="primary" onClick={onClose}>
          {copy.animationDialogDone}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}

const THUMB_SCALE = 3

function AnimationEditor({
  tileset,
  renderDocument,
  locale,
  gameRootPath,
  onUpdateTileset,
}: {
  tileset: MapTileset
  renderDocument: MapDocument
  locale: LocaleCode
  gameRootPath: string | null
  onUpdateTileset: (name: string, updater: (tileset: MapTileset) => MapTileset) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [playing, setPlaying] = useState(true)
  const [currentFrame, setCurrentFrame] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mode, setMode] = useState<EditorMode>('select')
  const [zoom, setZoom] = useState(1)
  const [dragPreview, setDragPreview] = useState<{ startTileId: number; endTileId: number } | null>(null)
  const canvasRef = useRef<SheetGridCanvasHandle | null>(null)
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null)
  // Pending frame regions for new-animation or add-frame mode.
  const [pendingFrames, setPendingFrames] = useState<TileRegion[]>([])
  // When in replaceFrameRegion mode, which frame index to replace.
  const replacingFrameRef = useRef<number | null>(null)

  const columns = tileset.columns
  const rows = Math.ceil(tileset.tileCount / columns)
  const spacing = tileset.spacing ?? 0
  const margin = tileset.margin ?? 0

  // Extract animation groups from the tileset's animations map.
  const groups = extractAnimationGroups(tileset)
  const selectedGroup = selectedGroupIndex != null ? (groups[selectedGroupIndex] ?? null) : null

  // Load sheet image.
  useEffect(() => {
    const imagePath = resolveTilesetImagePath(renderDocument, tileset, gameRootPath)
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
          appEvent('warning', 'Failed to load map animation sheet')
            .error(error)
            .context({ source: 'map-animation-dialog', operation: 'load-image', path: imagePath })
            .emit({ notify: false })
          setImage(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale, renderDocument, tileset])

  // Playback loop.
  const frameCount = selectedGroup?.frameCount ?? 0
  const duration = selectedGroup?.duration ?? 100
  useEffect(() => {
    if (!playing || frameCount === 0) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(() => setCurrentFrame((p) => (p + 1) % frameCount), Math.max(1, duration))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [playing, frameCount, duration, currentFrame])

  useEffect(() => {
    setCurrentFrame(0)
  }, [selectedGroupIndex, frameCount])

  function cropRegionThumb(originTileId: number, w: number, h: number, scale: number): string | null {
    if (!image) return null
    const sourceX = margin + (originTileId % columns) * (tileset.tileWidth + spacing)
    const sourceY = margin + Math.floor(originTileId / columns) * (tileset.tileHeight + spacing)
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = tileset.tileWidth * w * scale
    canvas.height = tileset.tileHeight * h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, sourceX, sourceY, tileset.tileWidth * w, tileset.tileHeight * h, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }

  function tileIdToColRow(tileId: number) {
    return { col: tileId % columns, row: Math.floor(tileId / columns) }
  }

  function colRowToTileId(col: number, row: number) {
    return row * columns + col
  }

  /** Commit a new animation group from pending frame regions. */
  function commitNewGroup() {
    if (pendingFrames.length === 0) return
    const first = pendingFrames[0]
    const ownerTileId = colRowToTileId(first.startCol, first.startRow)
    const group: AnimationGroup = {
      ownerTileId,
      width: first.width,
      height: first.height,
      frameCount: pendingFrames.length,
      duration: 100,
      frameOrigins: pendingFrames.map((r) => colRowToTileId(r.startCol, r.startRow)),
    }
    const expanded = expandAnimationGroup(group, columns)
    onUpdateTileset(tileset.name, (ts) => ({
      ...ts,
      animations: { ...ts.animations, ...expanded },
    }))
    setPendingFrames([])
    setMode('select')
    // Select the new group.
    requestAnimationFrame(() => {
      const newGroups = extractAnimationGroups({ ...tileset, animations: { ...tileset.animations, ...expanded } })
      const idx = newGroups.findIndex((g) => g.ownerTileId === ownerTileId)
      setSelectedGroupIndex(idx >= 0 ? idx : null)
    })
  }

  /** Add a frame region to an existing group. */
  function addFrameToGroup(region: TileRegion) {
    if (!selectedGroup) return
    if (region.width !== selectedGroup.width || region.height !== selectedGroup.height) return
    const originTileId = colRowToTileId(region.startCol, region.startRow)
    const newFrameOrigins = [...selectedGroup.frameOrigins, originTileId]
    const updatedGroup: AnimationGroup = {
      ...selectedGroup,
      frameCount: newFrameOrigins.length,
      frameOrigins: newFrameOrigins,
    }
    // Remove old group's animations, then write new ones.
    const cleaned = removeAnimationGroupAnimations(tileset.animations, selectedGroup, columns)
    const expanded = expandAnimationGroup(updatedGroup, columns)
    onUpdateTileset(tileset.name, (ts) => ({
      ...ts,
      animations: { ...cleaned, ...expanded },
    }))
    setMode('select')
  }

  /** Replace a frame region in the selected group. */
  function replaceFrameRegion(frameIndex: number, region: TileRegion) {
    if (!selectedGroup) return
    if (region.width !== selectedGroup.width || region.height !== selectedGroup.height) return
    const originTileId = colRowToTileId(region.startCol, region.startRow)
    const newFrameOrigins = selectedGroup.frameOrigins.map((o, i) => (i === frameIndex ? originTileId : o))
    const updatedGroup: AnimationGroup = { ...selectedGroup, frameOrigins: newFrameOrigins }
    const cleaned = removeAnimationGroupAnimations(tileset.animations, selectedGroup, columns)
    const expanded = expandAnimationGroup(updatedGroup, columns)
    onUpdateTileset(tileset.name, (ts) => ({
      ...ts,
      animations: { ...cleaned, ...expanded },
    }))
    setMode('select')
  }

  /** Remove a frame from the selected group. */
  function removeFrame(frameIndex: number) {
    if (!selectedGroup || selectedGroup.frameCount <= 1) {
      // Removing the last frame deletes the whole group.
      deleteGroup(selectedGroupIndex!)
      return
    }
    const newFrameOrigins = selectedGroup.frameOrigins.filter((_, i) => i !== frameIndex)
    const updatedGroup: AnimationGroup = { ...selectedGroup, frameCount: newFrameOrigins.length, frameOrigins: newFrameOrigins }
    const cleaned = removeAnimationGroupAnimations(tileset.animations, selectedGroup, columns)
    const expanded = expandAnimationGroup(updatedGroup, columns)
    onUpdateTileset(tileset.name, (ts) => ({
      ...ts,
      animations: { ...cleaned, ...expanded },
    }))
  }

  /** Delete an entire animation group. */
  function deleteGroup(index: number) {
    const group = groups[index]
    if (!group) return
    const cleaned = removeAnimationGroupAnimations(tileset.animations, group, columns)
    onUpdateTileset(tileset.name, (ts) => ({ ...ts, animations: cleaned }))
    setSelectedGroupIndex(null)
  }

  /** Update duration for all frames in a group. */
  function updateGroupDuration(newDuration: number) {
    if (!selectedGroup) return
    const updatedGroup: AnimationGroup = { ...selectedGroup, duration: Math.max(1, newDuration) }
    const cleaned = removeAnimationGroupAnimations(tileset.animations, selectedGroup, columns)
    const expanded = expandAnimationGroup(updatedGroup, columns)
    onUpdateTileset(tileset.name, (ts) => ({
      ...ts,
      animations: { ...cleaned, ...expanded },
    }))
  }

  function handleTileClick(tileId: number) {
    const region: TileRegion = { startCol: tileId % columns, startRow: Math.floor(tileId / columns), width: 1, height: 1 }
    if (mode === 'newAnimation') {
      addPendingFrame(region)
    } else if (mode === 'addFrameRegion') {
      addFrameToGroup(region)
    } else if (mode === 'replaceFrameRegion' && replacingFrameRef.current != null) {
      replaceFrameRegion(replacingFrameRef.current, region)
    }
  }

  function addPendingFrame(region: TileRegion) {
    if (mode === 'newAnimation') {
      if (pendingFrames.length > 0) {
        const first = pendingFrames[0]
        if (region.width !== first.width || region.height !== first.height) {
          setPendingFrames([region])
          return
        }
      }
      setPendingFrames([...pendingFrames, region])
    } else if (mode === 'addFrameRegion') {
      addFrameToGroup(region)
    }
  }

  function handleDragSelectionEnd(startTileId: number, endTileId: number) {
    const startCol = startTileId % columns
    const startRow = Math.floor(startTileId / columns)
    const endCol = endTileId % columns
    const endRow = Math.floor(endTileId / columns)
    const region: TileRegion = {
      startCol: Math.min(startCol, endCol),
      startRow: Math.min(startRow, endRow),
      width: Math.abs(endCol - startCol) + 1,
      height: Math.abs(endRow - startRow) + 1,
    }

    if (mode === 'newAnimation') {
      addPendingFrame(region)
    } else if (mode === 'addFrameRegion') {
      addFrameToGroup(region)
    } else if (mode === 'replaceFrameRegion' && replacingFrameRef.current != null) {
      replaceFrameRegion(replacingFrameRef.current, region)
    } else if (mode === 'select') {
      const ownerTileId = colRowToTileId(region.startCol, region.startRow)
      const idx = groups.findIndex((g) => g.ownerTileId === ownerTileId)
      if (idx >= 0) setSelectedGroupIndex(idx)
    }
  }

  function locateGroup(group: AnimationGroup) {
    canvasRef.current?.locateTile(group.ownerTileId)
    const idx = groups.findIndex((g) => g === group)
    setSelectedGroupIndex(idx >= 0 ? idx : null)
  }

  // Sheet overlay: outline all animation groups, highlight selected.
  const sheetOverlay = (
    <>
      {groups.map((group, index) => {
        const pos = tileIdToColRow(group.ownerTileId)
        const isSelected = index === selectedGroupIndex
        return (
          <span
            key={index}
            className={cx('map-anim-group-outline', isSelected && 'is-selected')}
            style={{
              left: `${(pos.col / columns) * 100}%`,
              top: `${(pos.row / rows) * 100}%`,
              width: `${(group.width / columns) * 100}%`,
              height: `${(group.height / rows) * 100}%`,
            }}
            aria-hidden="true"
          />
        )
      })}
    </>
  )

  // Selection rect: show selected group region or drag preview.
  const selectionRect = dragPreview
    ? { startTileId: dragPreview.startTileId, endTileId: dragPreview.endTileId }
    : selectedGroup
      ? {
          startTileId: selectedGroup.ownerTileId,
          endTileId: colRowToTileId(
            tileIdToColRow(selectedGroup.ownerTileId).col + selectedGroup.width - 1,
            tileIdToColRow(selectedGroup.ownerTileId).row + selectedGroup.height - 1,
          ),
        }
      : null

  const isPicking = mode !== 'select'
  const previewOrigin = selectedGroup?.frameOrigins[currentFrame] ?? selectedGroup?.frameOrigins[0] ?? null
  const previewThumb =
    selectedGroup && previewOrigin != null ? cropRegionThumb(previewOrigin, selectedGroup.width, selectedGroup.height, 2) : null

  // Stamp preview for picking modes: shows the region that will be placed.
  const stampPreview = (() => {
    if (mode === 'addFrameRegion' && selectedGroup) {
      const origin = selectedGroup.frameOrigins[selectedGroup.frameOrigins.length - 1]
      const src = cropRegionThumb(origin, selectedGroup.width, selectedGroup.height, 1)
      return src ? { src, tileWidth: selectedGroup.width, tileHeight: selectedGroup.height } : null
    }
    if (mode === 'replaceFrameRegion' && selectedGroup && replacingFrameRef.current != null) {
      const origin = selectedGroup.frameOrigins[replacingFrameRef.current]
      const src = cropRegionThumb(origin, selectedGroup.width, selectedGroup.height, 1)
      return src ? { src, tileWidth: selectedGroup.width, tileHeight: selectedGroup.height } : null
    }
    if (mode === 'newAnimation' && pendingFrames.length > 0) {
      const last = pendingFrames[pendingFrames.length - 1]
      const origin = colRowToTileId(last.startCol, last.startRow)
      const src = cropRegionThumb(origin, last.width, last.height, 1)
      return src ? { src, tileWidth: last.width, tileHeight: last.height } : null
    }
    return null
  })()

  return (
    <div className="map-animation-editor">
      {/* Left: sheet canvas */}
      <div className="map-animation-editor-sheet">
        <SheetGridCanvas
          canvasRef={canvasRef}
          document={renderDocument}
          tileset={tileset}
          locale={locale}
          gameRootPath={gameRootPath}
          zoomState={{ zoom, setZoom }}
          onTileClick={handleTileClick}
          onDragSelectionChange={(start, end) => setDragPreview({ startTileId: start, endTileId: end })}
          onDragSelectionEnd={(start, end) => {
            setDragPreview(null)
            handleDragSelectionEnd(start, end)
          }}
          overlay={sheetOverlay}
          selectionRect={selectionRect}
          stampPreview={stampPreview}
          showMagnifier={!isPicking}
        />
        <div className="map-animation-editor-sheet-footer">
          {isPicking ? (
            <p className="map-animation-editor-sheet-mode-hint">
              <MousePointerClick className="h-3 w-3" />
              {mode === 'newAnimation'
                ? copy.animationDialogNewAnimHint
                : mode === 'replaceFrameRegion'
                  ? copy.animationDialogPickReplaceHint
                  : copy.animationDialogPickAddHint}
            </p>
          ) : (
            <p className="map-animation-editor-sheet-hint">{copy.animationDialogSheetHint}</p>
          )}
        </div>
      </div>

      {/* Right: group list + frame editor */}
      <div className="map-animation-editor-panel">
        {/* Section 1: animation group list */}
        <section className="map-animation-editor-section">
          <div className="map-animation-editor-list-header">
            <span className="map-animation-editor-list-label">{copy.animationDialogListLabel}</span>
            <button
              type="button"
              className={cx('control-button', mode === 'newAnimation' && 'is-active')}
              onClick={() => {
                if (mode === 'newAnimation') {
                  setPendingFrames([])
                  setMode('select')
                } else {
                  setMode('newAnimation')
                  setPendingFrames([])
                  setSelectedGroupIndex(null)
                }
              }}
            >
              <Plus className="h-3 w-3" />
              {mode === 'newAnimation' ? copy.animationDialogCancelPick : copy.animationDialogNewAnim}
            </button>
          </div>

          {groups.length > 0 ? (
            <div className="map-animation-editor-list-items">
              {groups.map((group, index) => (
                <button
                  key={index}
                  type="button"
                  className={cx('map-animation-editor-list-item', index === selectedGroupIndex && 'is-active')}
                  onClick={() => locateGroup(group)}
                  title={`#${group.ownerTileId} (${group.width}x${group.height}, ${group.frameCount}f)`}
                >
                  <AnimatedTilePreview
                    document={renderDocument}
                    tileset={tileset}
                    group={group}
                    locale={locale}
                    gameRootPath={gameRootPath}
                    scale={1}
                    playing={index !== selectedGroupIndex}
                  />
                  <span className="map-animation-editor-list-item-meta">
                    <span className="map-animation-editor-list-item-id">#{group.ownerTileId}</span>
                    <span className="map-animation-editor-list-item-size">
                      {group.width}x{group.height} · {group.frameCount}f
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="map-animation-editor-list-empty">{copy.animationDialogNoAnims}</p>
          )}
        </section>

        {/* Pending frames (new-animation mode) */}
        {mode === 'newAnimation' ? (
          <section className="map-animation-editor-pending is-flex">
            <div className="map-animation-editor-pending-header">
              <span className="map-animation-editor-list-label">{copy.animationDialogPendingFrames(pendingFrames.length)}</span>
              <div className="map-animation-editor-pending-actions">
                <button
                  type="button"
                  className="control-button"
                  onClick={() => {
                    setPendingFrames([])
                    setMode('select')
                  }}
                >
                  {copy.animationDialogCancelPick}
                </button>
                <button type="button" className="control-button is-primary" disabled={pendingFrames.length === 0} onClick={commitNewGroup}>
                  {copy.animationDialogConfirm}
                </button>
              </div>
            </div>
            {pendingFrames.length > 0 ? (
              <div className="map-animation-editor-pending-frames">
                {pendingFrames.map((region, index) => {
                  const originTileId = colRowToTileId(region.startCol, region.startRow)
                  const thumb = cropRegionThumb(originTileId, region.width, region.height, 2)
                  return (
                    <div key={index} className="map-animation-editor-pending-frame">
                      <span className="map-animation-editor-pending-frame-index">{index + 1}</span>
                      {thumb ? <img src={thumb} alt="" draggable={false} className="map-animation-editor-pending-frame-thumb" /> : null}
                      <span className="map-animation-editor-pending-frame-size">
                        {region.width}x{region.height}
                      </span>
                      <button
                        type="button"
                        className="icon-button is-danger"
                        onClick={() => setPendingFrames(pendingFrames.filter((_, i) => i !== index))}
                        aria-label={copy.removeFrame}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="map-animation-editor-pending-empty">
                <Film className="h-5 w-5" />
                <p>{copy.animationDialogNewAnimHint}</p>
              </div>
            )}
          </section>
        ) : null}

        {/* Section 2: frame editor for selected group */}
        {mode !== 'newAnimation' && selectedGroup == null ? (
          <div className="map-animation-editor-empty">
            <Film className="h-6 w-6" />
            <p>{copy.animationDialogHint}</p>
          </div>
        ) : mode !== 'newAnimation' && selectedGroup != null ? (
          <section className="map-animation-editor-section is-flex">
            <div className="map-animation-editor-header">
              <strong>
                #{selectedGroup.ownerTileId} ({selectedGroup.width}x{selectedGroup.height})
              </strong>
              <button
                type="button"
                className="icon-button"
                onClick={() => canvasRef.current?.locateTile(selectedGroup.ownerTileId)}
                aria-label={copy.animationDialogLocate}
                title={copy.animationDialogLocate}
              >
                <Crosshair className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? copy.animationPause : copy.animationPlay}
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                className="icon-button is-danger"
                onClick={() => deleteGroup(selectedGroupIndex!)}
                aria-label={copy.removeFrame}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="map-animation-editor-bind-hint">{copy.animationDialogBindHint}</p>

            {/* Preview */}
            {previewThumb ? (
              <div className="map-animation-editor-preview">
                <img src={previewThumb} alt="" draggable={false} />
                <span className="map-animation-editor-preview-meta">
                  {currentFrame + 1}/{selectedGroup.frameCount} · {selectedGroup.duration}ms
                </span>
              </div>
            ) : null}

            {/* Duration control */}
            <label className="map-animation-editor-frame-field">
              <span>{copy.frameDuration}</span>
              <input type="number" min={1} value={selectedGroup.duration} onChange={(e) => updateGroupDuration(Number(e.target.value))} />
            </label>

            {/* Frame strip: each frame is a region thumbnail */}
            <div className="map-animation-editor-strip">
              {selectedGroup.frameOrigins.map((origin, index) => {
                const thumb = cropRegionThumb(origin, selectedGroup.width, selectedGroup.height, THUMB_SCALE)
                return (
                  <div key={index} className={cx('map-animation-editor-frame', currentFrame === index && playing && 'is-playing')}>
                    <button
                      type="button"
                      className="map-animation-editor-frame-thumb"
                      onClick={() => {
                        setMode('replaceFrameRegion')
                        replacingFrameRef.current = index
                      }}
                      title={copy.animationDialogPickFrameTile}
                    >
                      {thumb ? <img src={thumb} alt="" draggable={false} /> : null}
                    </button>
                    <span className="map-animation-editor-frame-index">{index + 1}</span>
                    <button
                      type="button"
                      className="icon-button is-danger"
                      onClick={() => removeFrame(index)}
                      aria-label={copy.removeFrame}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
              <button
                type="button"
                className={cx('map-animation-editor-add-frame', mode === 'addFrameRegion' && 'is-active')}
                onClick={() => {
                  if (mode === 'addFrameRegion') setMode('select')
                  else setMode('addFrameRegion')
                  replacingFrameRef.current = null
                }}
              >
                <Plus className="h-4 w-4" />
                {mode === 'addFrameRegion' ? copy.animationDialogCancelPick : copy.addFrame}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
