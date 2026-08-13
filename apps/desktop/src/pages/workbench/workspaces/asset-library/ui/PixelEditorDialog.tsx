import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, PaintBucket, Pencil, Pipette, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import type { VirtualPreviewAsset } from '@features/cp-maker'
import { useAssetLibraryCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { fillPixels, parsePixelColor, pixelColorToHex, setPixel, type PixelRgba } from '../model/pixelOps'

type PixelTool = 'pencil' | 'eraser' | 'eyedropper' | 'fill'
type PixelDocument = { width: number; height: number; history: Uint8ClampedArray[]; index: number }

function assetDataUrl(asset: VirtualPreviewAsset) {
  return `data:${asset.mediaType};base64,${asset.bytesBase64}`
}

export type PixelEditorDialogProps = {
  asset: VirtualPreviewAsset | null
  onClose: () => void
  onSave: (bytesBase64: string) => void
}

/** Canvas-backed pixel editor with stable image dimensions and immutable undo history. */
export function PixelEditorDialog({ asset, onClose, onSave }: PixelEditorDialogProps) {
  const libraryCopy = useAssetLibraryCopy()
  const copy = libraryCopy.pixelEditor
  const titleId = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workingRef = useRef<Uint8ClampedArray | null>(null)
  const [documentState, setDocumentState] = useState<PixelDocument | null>(null)
  const [tool, setTool] = useState<PixelTool>('pencil')
  const [color, setColor] = useState(pixelColorToHex([32, 32, 32, 255]))
  const [zoom, setZoom] = useState(8)
  const [drawing, setDrawing] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!asset) {
      setDocumentState(null)
      setFailed(false)
      return
    }
    let cancelled = false
    setDocumentState(null)
    setFailed(false)
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const source = window.document.createElement('canvas')
      source.width = image.naturalWidth
      source.height = image.naturalHeight
      const context = source.getContext('2d', { willReadFrequently: true })
      if (!context) {
        setFailed(true)
        return
      }
      context.drawImage(image, 0, 0)
      const buffer = new Uint8ClampedArray(context.getImageData(0, 0, source.width, source.height).data)
      setDocumentState({ width: source.width, height: source.height, history: [buffer], index: 0 })
      setZoom(source.width > 256 || source.height > 256 ? 2 : source.width > 96 || source.height > 96 ? 4 : 8)
    }
    image.onerror = () => !cancelled && setFailed(true)
    image.src = assetDataUrl(asset)
    return () => {
      cancelled = true
    }
  }, [asset])

  const currentBuffer = documentState?.history[documentState.index] ?? null

  function drawBuffer(buffer: Uint8ClampedArray) {
    if (!documentState || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = documentState.width
    canvas.height = documentState.height
    const pixels = new Uint8ClampedArray(buffer.length)
    pixels.set(buffer)
    canvas.getContext('2d')?.putImageData(new ImageData(pixels, documentState.width, documentState.height), 0, 0)
  }

  useEffect(() => {
    if (currentBuffer) drawBuffer(currentBuffer)
  }, [currentBuffer, documentState?.width, documentState?.height])

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!documentState) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.floor(((event.clientX - bounds.left) / bounds.width) * documentState.width),
      y: Math.floor(((event.clientY - bounds.top) / bounds.height) * documentState.height),
    }
  }

  function commitBuffer(buffer: Uint8ClampedArray) {
    setDocumentState((current) =>
      current ? { ...current, history: [...current.history.slice(0, current.index + 1), buffer], index: current.index + 1 } : current,
    )
  }

  function paintAt(event: ReactPointerEvent<HTMLCanvasElement>, base: Uint8ClampedArray) {
    if (!documentState) return base
    const point = pointFromEvent(event)
    if (!point) return base
    const rgba: PixelRgba = tool === 'eraser' ? [0, 0, 0, 0] : parsePixelColor(color)
    return setPixel(base, documentState.width, documentState.height, point.x, point.y, rgba)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!documentState || !currentBuffer) return
    const point = pointFromEvent(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'eyedropper') {
      const offset = (point.y * documentState.width + point.x) * 4
      setColor(
        pixelColorToHex([
          currentBuffer[offset] ?? 0,
          currentBuffer[offset + 1] ?? 0,
          currentBuffer[offset + 2] ?? 0,
          currentBuffer[offset + 3] ?? 255,
        ]),
      )
      return
    }
    if (tool === 'fill') {
      commitBuffer(fillPixels(currentBuffer, documentState.width, documentState.height, point.x, point.y, parsePixelColor(color)))
      return
    }
    const next = paintAt(event, currentBuffer)
    workingRef.current = next
    drawBuffer(next)
    setDrawing(true)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing || !workingRef.current) return
    const next = paintAt(event, workingRef.current)
    workingRef.current = next
    drawBuffer(next)
  }

  function finishStroke() {
    if (drawing && workingRef.current) commitBuffer(workingRef.current)
    workingRef.current = null
    setDrawing(false)
  }

  function moveHistory(offset: number) {
    setDocumentState((current) =>
      current ? { ...current, index: Math.min(current.history.length - 1, Math.max(0, current.index + offset)) } : current,
    )
  }

  function save() {
    if (!documentState || !currentBuffer || !canvasRef.current) return
    drawBuffer(currentBuffer)
    onSave(canvasRef.current.toDataURL('image/png').split(',')[1] ?? '')
  }

  const tools = [
    { id: 'pencil' as const, label: copy.pencil, icon: Pencil },
    { id: 'eraser' as const, label: copy.eraser, icon: Eraser },
    { id: 'eyedropper' as const, label: copy.eyedropper, icon: Pipette },
    { id: 'fill' as const, label: copy.fill, icon: PaintBucket },
  ]

  return (
    <Dialog open={asset !== null} onClose={onClose} labelledBy={titleId} size="xl" stack closeOnBackdrop={false}>
      <DialogHeader id={titleId} title={copy.title} subtitle={asset?.relativePath} onClose={onClose} closeLabel={copy.title} />
      <DialogBody className="pixel-editor-body">
        <div className="pixel-editor-toolbar">
          <div className="pixel-editor-tool-group" role="toolbar" aria-label={copy.title}>
            {tools.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={cx('pixel-editor-tool', tool === id && 'is-active')}
                aria-label={label}
                title={label}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
          <label className="pixel-editor-color">
            <span>{copy.color}</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <div className="pixel-editor-tool-group">
            <button
              type="button"
              className="pixel-editor-tool"
              disabled={!documentState || documentState.index === 0}
              aria-label={copy.undo}
              title={copy.undo}
              onClick={() => moveHistory(-1)}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="pixel-editor-tool"
              disabled={!documentState || documentState.index + 1 >= documentState.history.length}
              aria-label={copy.redo}
              title={copy.redo}
              onClick={() => moveHistory(1)}
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          <label className="pixel-editor-zoom">
            <span>{copy.zoom}</span>
            <input type="range" min={1} max={24} step={1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            <span>{zoom}×</span>
          </label>
          <button type="button" className="pixel-editor-tool" aria-label={copy.resetView} title={copy.resetView} onClick={() => setZoom(8)}>
            <RotateCcw className="h-4 w-4" />
          </button>
          {documentState ? (
            <span className="pixel-editor-dimensions">{copy.dimensions(documentState.width, documentState.height)}</span>
          ) : null}
        </div>
        <div className="pixel-editor-stage">
          {failed ? (
            <p className="asset-library-state-message is-error">{copy.decodeFailed}</p>
          ) : documentState ? (
            <canvas
              ref={canvasRef}
              className="pixel-editor-canvas"
              style={{ width: `${documentState.width * zoom}px`, height: `${documentState.height * zoom}px` }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />
          ) : (
            <p className="asset-library-state-message">{copy.loading}</p>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{libraryCopy.cancelAction}</DialogAction>
        <DialogAction tone="primary" disabled={!documentState || failed} onClick={save}>
          {copy.saveAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
